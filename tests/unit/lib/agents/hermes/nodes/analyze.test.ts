// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/hermes/nodes/analyze.ts. BQ queries, retrieve, and
// Anthropic are mocked. Verifies the orchestration: fetch -> Anomstack
// -> retrieve -> Sonnet -> typed Findings.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const networkBreakdownMock = vi.hoisted(() => vi.fn());
const campaignsMock = vi.hoisted(() => vi.fn());
const trendMock = vi.hoisted(() => vi.fn());
const retrieveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/globalcomix-queries", () => ({
  queryGlobalComixNetworkBreakdown: networkBreakdownMock,
  queryGlobalComixCampaigns: campaignsMock,
  queryGlobalComixTrend: trendMock,
}));

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

class FakeAnthropic {
  messages = { create: vi.fn() };
}

const fake = new FakeAnthropic();

function makeNetwork(over: Record<string, unknown>) {
  return {
    network: "meta",
    spend: 1000,
    share: 0.5,
    installs: 100,
    clicks: 1000,
    impressions: 10000,
    cpi: 10,
    ctr: 0.1,
    cpm: 5,
    cpc: 0.5,
    roasD7: 0.3,
    roasD14: 0.4,
    roasD30: 0.5,
    roasD90: 0.6,
    ftdD7: 5,
    payersD7: 5,
    retD7: 0.2,
    subStart: 10,
    subD0: 8,
    subD7: 5,
    cpSubStart: 100,
    cpaD0: 125,
    cpaD7: 200,
    trailingCpaD7Avg: 200,
    ...over,
  };
}

beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  networkBreakdownMock.mockReset();
  campaignsMock.mockReset();
  trendMock.mockReset();
  retrieveMock.mockReset();
  fake.messages.create.mockReset();
  retrieveMock.mockResolvedValue({
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  });
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(fake as never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(null);
});

function baseState() {
  return {
    email_text: "x",
    run_id: "run-analyze-1",
    intent: {
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "last week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.9,
      doubts: [],
    },
    context: { knowledge: [], history: [], comms: [] },
    findings: [],
    bullets: [],
    deck: { pptx_path: null, slides: [] },
    approval: { approved: false, approved_by: null, approved_at: null, edits: [] },
    history: [],
  };
}

function mockSonnetFindings(findings: unknown[]) {
  fake.messages.create.mockResolvedValueOnce({
    content: [
      {
        type: "tool_use",
        name: "rank_findings",
        id: "toolu_test",
        input: { findings },
      },
    ],
  });
}

describe("analyze node", () => {
  it("skips and returns empty findings when intent is null", async () => {
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    const state = baseState();
    state.intent = null as never;
    const update = await analyze(state);
    expect(update.findings).toEqual([]);
    expect(update.history?.[0]?.notes).toMatch(/no intent/);
  });

  it("happy path: fetches BQ, runs Anomstack, retrieves RAG, calls Sonnet, returns findings", async () => {
    networkBreakdownMock.mockResolvedValueOnce([
      makeNetwork({ network: "meta", cpaD7: 300, trailingCpaD7Avg: 200 }),
      makeNetwork({ network: "google", cpaD7: 220, trailingCpaD7Avg: 210 }),
    ]);
    campaignsMock.mockResolvedValueOnce([]);
    trendMock.mockResolvedValueOnce([]);
    mockSonnetFindings([
      {
        kind: "anomaly",
        claim_template:
          "Meta CPA D7 jumped 50% to $300 this week, well above the trailing baseline.",
        delta: 0.5,
        source_query_id: "network_breakdown",
        citations: [],
        severity: "high",
      },
    ]);
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    const update = await analyze(baseState());
    expect(update.findings).toHaveLength(1);
    expect(update.findings?.[0].severity).toBe("high");
    expect(networkBreakdownMock).toHaveBeenCalledTimes(1);
    expect(campaignsMock).toHaveBeenCalledTimes(1);
    expect(trendMock).toHaveBeenCalledTimes(1);
    expect(fake.messages.create).toHaveBeenCalledTimes(1);
  });

  it("calls retrieve for both Knowledge and History corpora in parallel", async () => {
    networkBreakdownMock.mockResolvedValueOnce([]);
    campaignsMock.mockResolvedValueOnce([]);
    trendMock.mockResolvedValueOnce([]);
    mockSonnetFindings([]);
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    await analyze(baseState());
    const corpora = retrieveMock.mock.calls.map((c) => c[0].corpus).sort();
    expect(corpora).toEqual(["history", "knowledge"]);
  });

  it("survives a failing retrieve (degrades to empty chunks)", async () => {
    networkBreakdownMock.mockResolvedValueOnce([]);
    campaignsMock.mockResolvedValueOnce([]);
    trendMock.mockResolvedValueOnce([]);
    retrieveMock.mockRejectedValue(new Error("RAG offline"));
    mockSonnetFindings([
      {
        kind: "info",
        claim_template: "No anomalies this period.",
        source_query_id: "network_breakdown",
        citations: [],
        severity: "low",
      },
    ]);
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    const update = await analyze(baseState());
    expect(update.findings).toHaveLength(1);
    expect(update.context?.knowledge).toEqual([]);
    expect(update.context?.history).toEqual([]);
  });

  it("throws when Sonnet returns no tool_use block", async () => {
    networkBreakdownMock.mockResolvedValueOnce([]);
    campaignsMock.mockResolvedValueOnce([]);
    trendMock.mockResolvedValueOnce([]);
    fake.messages.create.mockResolvedValueOnce({
      content: [{ type: "text", text: "no thanks" }],
    });
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    await expect(analyze(baseState())).rejects.toThrow(/no tool_use/);
  });

  it("rejects invalid findings shapes via Zod", async () => {
    networkBreakdownMock.mockResolvedValueOnce([]);
    campaignsMock.mockResolvedValueOnce([]);
    trendMock.mockResolvedValueOnce([]);
    mockSonnetFindings([
      {
        kind: "anomaly",
        // missing required claim_template
        source_query_id: "network_breakdown",
        citations: [],
        severity: "high",
      },
    ]);
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    await expect(analyze(baseState())).rejects.toThrow();
  });

  it("history trace records the per-detector counts in notes", async () => {
    networkBreakdownMock.mockResolvedValueOnce([
      makeNetwork({ network: "meta", cpaD7: 300, trailingCpaD7Avg: 200 }),
    ]);
    campaignsMock.mockResolvedValueOnce([]);
    trendMock.mockResolvedValueOnce([]);
    mockSonnetFindings([]);
    const { analyze } = await import("@/lib/agents/hermes/nodes/analyze");
    const update = await analyze(baseState());
    expect(update.history?.[0]?.notes).toMatch(/anomalies=/);
    expect(update.history?.[0]?.notes).toMatch(/findings=/);
  });
});
