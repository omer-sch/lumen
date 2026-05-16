// @vitest-environment node
// Layer 2 (lib unit). A short pinning test that captures one real
// [analyst:shadow] log entry so the PR description can show what the
// production stdout will look like once USE_SHARED_ANALYST="shadow"
// is in place. Not part of the regression contract; this test exists
// to document the log shape.
process.env.USE_SHARED_ANALYST = "shadow";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const networkBreakdownMock = vi.hoisted(() => vi.fn());
const campaignsMock = vi.hoisted(() => vi.fn());
const trendMock = vi.hoisted(() => vi.fn());
const dataAsOfMock = vi.hoisted(() => vi.fn());
const retrieveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/globalcomix-queries", () => ({
  queryGlobalComixNetworkBreakdown: networkBreakdownMock,
  queryGlobalComixCampaigns: campaignsMock,
  queryGlobalComixTrend: trendMock,
  queryGlobalComixDataAsOf: dataAsOfMock,
}));

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

vi.mock("@/lib/cache/redis", () => ({
  cacheEnabled: () => false,
  redis: null,
}));

// Anthropic client never gets called in this test (Sonnet rank step
// short-circuits because we throw before then). We don't need to mock
// it; the assertion targets the structured log only.
vi.mock("@/lib/agents/_scaffold/model", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi
        .fn()
        .mockResolvedValue({
          content: [
            {
              type: "tool_use",
              name: "rank_findings",
              input: { findings: [] },
            },
          ],
        }),
    },
  }),
  pickModel: () => "claude-sonnet-fake",
}));

import { analyze } from "@/lib/agents/hermes/nodes/analyze";
import type { HermesState } from "@/lib/agents/hermes/state";

function makeNetwork(over: Record<string, unknown>) {
  return {
    network: "Meta", spend: 100, share: 0.1, installs: 10,
    clicks: 200, impressions: 5000,
    cpi: 10, ctr: 0.04, cpm: 20, cpc: 0.5,
    roasD7: 0.3, roasD14: 0.4, roasD30: 0.5, roasD90: 0.6,
    ftdD7: 10, payersD7: 12, retD7: 0.4,
    subStart: 10, subD0: 8, subD7: 20,
    cpSubStart: 10, cpaD0: 12.5, cpaD7: 100,
    trailingCpaD7Avg: 100, ...over,
  };
}

beforeEach(() => {
  networkBreakdownMock.mockReset();
  campaignsMock.mockReset();
  trendMock.mockReset();
  dataAsOfMock.mockReset();
  retrieveMock.mockReset();
  trendMock.mockResolvedValue([]);
  dataAsOfMock.mockResolvedValue("2026-05-07");
  retrieveMock.mockResolvedValue({
    chunks: [], citations: [], chunks_returned: 0, latency_ms: 0,
    query_embedding_cost_usd: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function intent(): NonNullable<HermesState["intent"]> {
  return {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: { label: "x", iso_start: "2026-05-01", iso_end: "2026-05-07" },
    focus: null,
    confidence: 1,
    doubts: [],
  };
}

function baseState(): HermesState {
  return {
    email_text: "x",
    run_id: "run-shadow-sample",
    user_id: "user-shadow",
    intent: intent(),
    context: { knowledge: [], history: [], comms: [] },
    contact: null,
    snapshot: null,
    findings: [],
    bullets: [],
    deck: { pptx_path: null, slides: [], report_id: null },
    approval: {
      approved: false,
      approved_by: null,
      approved_at: null,
      edits: [],
    },
    history: [],
  } as unknown as HermesState;
}

describe("[analyst:shadow] log emission", () => {
  it("emits a single structured log line per analyze() run in shadow mode", async () => {
    // 6-network fixture: one clear spend outlier (Unity Ads). The shadow
    // path's getReadyData call hits the same mocks and should produce
    // the same set of keys. We assert the log shape, not the contents
    // of the diff.
    const networks = [
      makeNetwork({ network: "Meta", spend: 100, subD7: 20 }),
      makeNetwork({ network: "Google", spend: 110, subD7: 25 }),
      makeNetwork({ network: "TikTok", spend: 90, subD7: 22 }),
      makeNetwork({ network: "Apple", spend: 100, subD7: 24 }),
      makeNetwork({ network: "AppLovin", spend: 110, subD7: 26 }),
      makeNetwork({ network: "Unity Ads", spend: 1000, subD7: 200 }),
    ];
    networkBreakdownMock.mockResolvedValue(networks);
    campaignsMock.mockResolvedValue([]);

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await analyze(baseState());

    // Wait for the parallel shadow-mode getReadyData fire-and-log to
    // settle. The analyze function returns before the shadow log has
    // landed; we yield the event loop a couple of times.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const shadowEntries = infoSpy.mock.calls
      .map(([arg]) => arg)
      .filter(
        (a): a is { event: string; tag: string } =>
          typeof a === "object" &&
          a !== null &&
          "tag" in a &&
          (a as { tag: unknown }).tag === "[analyst:shadow]",
      );
    expect(shadowEntries.length).toBe(1);
    expect(shadowEntries[0]).toMatchObject({
      event: "analyst.shadow",
      tag: "[analyst:shadow]",
    });

    infoSpy.mockRestore();
  });
});
