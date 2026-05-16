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
const upsertReportMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

vi.mock("@/lib/globalcomix-queries", () => ({
  queryGlobalComixNetworkBreakdown: networkBreakdownMock,
  queryGlobalComixCampaigns: campaignsMock,
  queryGlobalComixTrend: trendMock,
}));

vi.mock("@/lib/reports/server-store", () => ({
  upsertReport: upsertReportMock,
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
  // Post-snapshot-rewrite: networks/campaigns are no longer
  // mock-anchored, so empty BQ -> empty deck. Provide one network +
  // one campaign so the end-to-end test exercises the full assembly.
  networkBreakdownMock.mockResolvedValue([
    {
      network: "Meta",
      spend: 5000,
      share: 1,
      installs: 1000,
      clicks: 20000,
      impressions: 1_000_000,
      cpi: 5,
      ctr: 0.02,
      cpm: 5,
      cpc: 0.25,
      roasD7: 0.2,
      roasD14: 0.3,
      roasD30: 0.4,
      roasD90: 0.5,
      ftdD7: 100,
      payersD7: 80,
      retD7: 0.6,
      subStart: 200,
      subD0: 50,
      subD7: 80,
      cpSubStart: 25,
      cpaD0: 100,
      cpaD7: 62.5,
      trailingCpaD7Avg: 60,
    },
  ]);
  campaignsMock.mockResolvedValue([
    {
      campaign_id: "c1",
      campaign_name: "YH_FB_test",
      network: "Meta",
      spend: 1000,
      installs: 200,
      cpi: 5,
      roas: 0,
      spendDelta: 0.1,
    },
  ]);
  trendMock.mockResolvedValue([]);
  upsertReportMock.mockReset();
  upsertReportMock.mockImplementation((report) => Promise.resolve(report));
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

function mockQuillResponse(bullets: unknown[] = []) {
  return {
    content: [
      {
        type: "tool_use",
        name: "draft_bullets",
        id: "toolu_quill",
        input: { bullets },
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

  it("routeAfterAnalyze routes through quill when USE_SMART_REPORTS is off, skips to atelier when live", async () => {
    const { routeAfterAnalyze } = await import("@/lib/agents/hermes/graph");
    vi.stubEnv("USE_SMART_REPORTS", "off");
    expect(routeAfterAnalyze({} as never)).toBe("quill");
    vi.stubEnv("USE_SMART_REPORTS", "shadow");
    expect(routeAfterAnalyze({} as never)).toBe("quill");
    vi.stubEnv("USE_SMART_REPORTS", "live");
    expect(routeAfterAnalyze({} as never)).toBe("atelier");
  });

  it("runs end to end with parse_intent + analyze + quill (all mocked Anthropic) + atelier/review_gate stubs", async () => {
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
      )
      .mockResolvedValueOnce(
        mockQuillResponse([
          {
            claim: "Quiet week — nothing material.",
            columns_used: [],
            source_query_id: "network_breakdown",
            delta_value: null,
            action_item: null,
            citations: [],
            slide_target: "platform_overall",
          },
        ]),
      );
    const { buildHermesGraph } = await import(
      "@/lib/agents/hermes/graph"
    );
    const graph = buildHermesGraph();
    const final = await graph.invoke({
      email_text: "Please send the weekly review for GlobalComix focused on Meta.",
    action_notes: null as string | null,
      run_id: "test-run-1",
      user_id: "user-test-1",
    });

    expect(final.intent?.client).toBe("globalcomix");
    expect(final.intent?.confidence).toBeCloseTo(0.91, 2);
    expect(final.findings).toHaveLength(1);
    expect(final.bullets).toHaveLength(1);
    // v0.5-A chunk 4: Atelier inserts a Report row instead of writing
    // .pptx. The slides array now mirrors the assembled Report's
    // sections (platform_overall + channel_weekly + channel_campaign).
    expect(final.deck.report_id).toBe("rpt_test-run-1");
    expect(final.deck.pptx_path).toBeNull();
    expect(final.deck.slides).toHaveLength(3);
    expect(upsertReportMock).toHaveBeenCalledOnce();
    const [reportArg, ownerArg] = upsertReportMock.mock.calls[0];
    expect(reportArg.authoredBy).toBe("hermes");
    expect(reportArg.source).toBe("hermes");
    expect(ownerArg).toBe("user-test-1");
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

  it("end-to-end iOS/TikTok intent assembles an iOS/TikTok deck (no Android/Meta fallback, no mock-fixture leaks)", async () => {
    // Override default Meta mocks for this test: BQ returns a TikTok row.
    networkBreakdownMock.mockReset();
    networkBreakdownMock.mockResolvedValue([
      {
        network: "TikTok",
        spend: 4321,
        share: 1,
        installs: 500,
        clicks: 10000,
        impressions: 500_000,
        cpi: 8.64,
        ctr: 0.02,
        cpm: 8.64,
        cpc: 0.43,
        roasD7: 0.15,
        roasD14: 0.2,
        roasD30: 0.25,
        roasD90: 0.3,
        ftdD7: 50,
        payersD7: 40,
        retD7: 0.5,
        subStart: 75,
        subD0: 20,
        subD7: 35,
        cpSubStart: 57.6,
        cpaD0: 216.05,
        cpaD7: 123.45,
        trailingCpaD7Avg: 100,
      },
    ]);
    campaignsMock.mockReset();
    campaignsMock.mockResolvedValue([
      {
        campaign_id: "tt-1",
        campaign_name: "YH_TT_APP_iOS_T1",
        network: "TikTok",
        spend: 2000,
        installs: 250,
        cpi: 8,
        roas: 0,
        spendDelta: -0.12,
      },
    ]);
    fake.messages.create
      .mockResolvedValueOnce(
        mockHaikuResponse({
          client: "globalcomix",
          platforms: ["ios"],
          channels: ["tiktok"],
          period: {
            label: "last 7 days",
            iso_start: "2026-05-09",
            iso_end: "2026-05-15",
          },
          focus: null,
          confidence: 0.93,
          doubts: [],
        }),
      )
      .mockResolvedValueOnce(
        mockAnalyzeResponse([
          {
            kind: "anomaly",
            claim_template: "TikTok CPA D7 up 23%.",
            source_query_id: "network_breakdown",
            citations: [],
            severity: "high",
          },
        ]),
      )
      .mockResolvedValueOnce(
        mockQuillResponse([
          {
            claim: "TikTok CPA D7 climbed to $123.45.",
            columns_used: ["cpa_d7"],
            source_query_id: "network_breakdown",
            delta_value: 23,
            action_item: null,
            citations: [],
            slide_target: "channel_weekly",
          },
        ]),
      );

    const { buildHermesGraph } = await import("@/lib/agents/hermes/graph");
    const final = await buildHermesGraph().invoke({
      email_text:
        "Hi team, please send the TikTok weekly review for GlobalComix on iOS, last 7 days. Thanks, Emily",
      run_id: "test-tiktok",
      user_id: "user-test",
    });

    // Snapshot pulls from the BQ mock above, not the deleted fixtures.
    expect(final.snapshot?.platformOverall?.rows[0].label).toBe("TikTok");
    expect(final.snapshot?.platformOverall?.rows[0].spend.value).toBe(4321);
    // cpaD7 delta is derived from trailingCpaD7Avg (123.45 vs 100 = +23.5%).
    expect(final.snapshot?.platformOverall?.rows[0].cpaD7.delta).toBeCloseTo(
      23.5,
      1,
    );

    // Assembled report headers reflect the intent at the data layer
    // (platform / channel fields are still set so future
    // platform-filtered runs render correctly) but the human-readable
    // titles do NOT claim the intent's platform because BQ data is
    // currently client-wide across platforms; see snapshot.ts
    // dataScope. The scopeCaveat surfaces on the cover so the reader
    // knows what they're looking at.
    const [reportArg] = upsertReportMock.mock.calls[0];
    const platformSection = reportArg.sections.find(
      (s: { id: string }) => s.id === "platform_overall",
    );
    const weeklySection = reportArg.sections.find(
      (s: { id: string }) => s.id === "channel_weekly",
    );
    expect(platformSection.platform).toBe("ios");
    expect(platformSection.title).toMatch(/Overall \| Weekly Breakdown/);
    expect(platformSection.title).not.toMatch(/iOS/);
    expect(weeklySection.platform).toBe("ios");
    expect(weeklySection.channel).toBe("tiktok");
    expect(weeklySection.title).toMatch(/TikTok \| Weekly Breakdown/);
    expect(weeklySection.title).not.toMatch(/iOS/);
    // Cover scope caveat: the intent asked for iOS / TikTok but the
    // data is client-wide; the cover line announces that honestly.
    expect(reportArg.filterRange).toMatch(/iOS.*TikTok.*client-wide/);

    // Trust-contract guard: none of the deleted mock-fixture values
    // (Facebook $6,230, -28.7% substart, $22.41 cpSubstart) appear in
    // the snapshot or the assembled deck.
    const json = JSON.stringify({
      snapshot: final.snapshot,
      sections: reportArg.sections,
    });
    expect(json).not.toContain("6230");
    expect(json).not.toContain("-28.7");
    expect(json).not.toContain("22.41");
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
    action_notes: null as string | null,
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
    action_notes: null as string | null,
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
    action_notes: null as string | null,
        run_id: "test-run-4",
      }),
    ).rejects.toThrow(/no tool_use/);
  });
});
