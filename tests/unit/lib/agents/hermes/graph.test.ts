// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/agents/hermes/graph.ts.
// We compile the real graph and run it end to end with a mocked
// Anthropic client (via the model.ts test seam) and a mocked retrieve.
// Verifies node order, state shape after the run, and that stubs
// don't accidentally drop fields.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.hoisted(() => vi.fn());
const networkBreakdownMock = vi.hoisted(() => vi.fn());
const campaignsMock = vi.hoisted(() => vi.fn());
const trendMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

vi.mock("@/lib/globalcomix-queries", () => ({
  queryGlobalComixNetworkBreakdown: networkBreakdownMock,
  queryGlobalComixCampaigns: campaignsMock,
  queryGlobalComixTrend: trendMock,
}));

class FakeAnthropic {
  messages = {
    create: vi.fn(),
  };
}

const fake = new FakeAnthropic();

beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  fake.messages.create.mockReset();
  retrieveMock.mockReset();
  networkBreakdownMock.mockReset();
  campaignsMock.mockReset();
  trendMock.mockReset();
  retrieveMock.mockResolvedValue({
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  });
  // Analyze pulls these three; empty arrays produce 0 anomalies, the
  // Sonnet rank-and-frame call (second messages.create) returns no
  // findings; the graph still completes.
  networkBreakdownMock.mockResolvedValue([]);
  campaignsMock.mockResolvedValue([]);
  trendMock.mockResolvedValue([]);
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(fake as never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(null);
});

const TOOL_USE_INTENT = {
  client: "globalcomix",
  platforms: ["android"],
  channels: ["meta"],
  period: {
    label: "last week",
    iso_start: "2026-05-04",
    iso_end: "2026-05-10",
  },
  focus: null,
  confidence: 0.91,
  doubts: [],
};

function mockHaikuResponse(input: unknown) {
  return {
    content: [
      {
        type: "tool_use",
        name: "extract_intent",
        id: "toolu_test",
        input,
      },
    ],
  };
}

function mockAnalyzeResponse(findings: unknown[] = []) {
  return {
    content: [
      {
        type: "tool_use",
        name: "rank_findings",
        id: "toolu_analyze",
        input: { findings },
      },
    ],
  };
}

describe("buildHermesGraph", () => {
  it("HERMES_NODE_ORDER pins the five-node linear order", async () => {
    const { HERMES_NODE_ORDER } = await import(
      "@/lib/agents/hermes/graph"
    );
    expect(HERMES_NODE_ORDER).toEqual([
      "parse_intent",
      "analyze",
      "quill",
      "atelier",
      "review_gate",
    ]);
  });

  it("runs end to end with parse_intent + real analyze (both mocked Anthropic)", async () => {
    fake.messages.create
      .mockResolvedValueOnce(mockHaikuResponse(TOOL_USE_INTENT))
      .mockResolvedValueOnce(
        mockAnalyzeResponse([
          {
            kind: "info",
            claim_template: "Quiet week.",
            source_query_id: "network_breakdown",
            citations: [],
            severity: "low",
          },
        ]),
      );
    const { buildHermesGraph } = await import(
      "@/lib/agents/hermes/graph"
    );
    const graph = buildHermesGraph();
    const final = await graph.invoke({
      email_text: "Please send the weekly review for GlobalComix focused on Meta.",
      run_id: "test-run-1",
    });

    expect(final.intent?.client).toBe("globalcomix");
    expect(final.intent?.confidence).toBeCloseTo(0.91, 2);
    // Phase 4 analyze returns findings shape from the model; Quill /
    // Atelier / review_gate are still stubs and produce one bullet,
    // four slide placeholders, and an unapproved gate respectively.
    expect(final.findings).toHaveLength(1);
    expect(final.bullets).toHaveLength(1);
    expect(final.deck.slides).toHaveLength(4);
    expect(final.approval.approved).toBe(false);
    // History trace has one event per node, in order.
    expect(final.history.map((h) => h.node)).toEqual([
      "parse_intent",
      "analyze",
      "quill",
      "atelier",
      "review_gate",
    ]);
  });

  it("calls Comms retrieve before invoking Haiku", async () => {
    fake.messages.create
      .mockResolvedValueOnce(mockHaikuResponse(TOOL_USE_INTENT))
      .mockResolvedValueOnce(mockAnalyzeResponse([]));
    const { buildHermesGraph } = await import(
      "@/lib/agents/hermes/graph"
    );
    await buildHermesGraph().invoke({
      email_text: "Weekly review please for GlobalComix.",
      run_id: "test-run-2",
    });
    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({ corpus: "comms" }),
    );
  });

  it("recovers when Comms retrieve fails (non-load-bearing in v0)", async () => {
    retrieveMock.mockRejectedValueOnce(new Error("RAG offline"));
    fake.messages.create
      .mockResolvedValueOnce(mockHaikuResponse(TOOL_USE_INTENT))
      .mockResolvedValueOnce(mockAnalyzeResponse([]));
    const { buildHermesGraph } = await import(
      "@/lib/agents/hermes/graph"
    );
    const final = await buildHermesGraph().invoke({
      email_text: "Weekly review please for GlobalComix.",
      run_id: "test-run-3",
    });
    expect(final.intent?.client).toBe("globalcomix");
    expect(final.context.comms).toEqual([]);
  });

  it("fails the run if Haiku returns no tool_use block", async () => {
    fake.messages.create.mockResolvedValueOnce({
      content: [{ type: "text", text: "I refuse to extract anything." }],
    });
    const { buildHermesGraph } = await import(
      "@/lib/agents/hermes/graph"
    );
    await expect(
      buildHermesGraph().invoke({
        email_text: "Weekly review please for GlobalComix.",
        run_id: "test-run-4",
      }),
    ).rejects.toThrow(/no tool_use/);
  });
});
