// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/reports/generate.ts.
//
// The manual generator is now BQ-backed (same trust contract as
// Hermes). Tests mock the three BQ query functions and assert the
// resulting Report carries the real values + correct shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const networksMock = vi.hoisted(() => vi.fn());
const campaignsMock = vi.hoisted(() => vi.fn());
const trendMock = vi.hoisted(() => vi.fn());
const dataAsOfMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/globalcomix-queries", () => ({
  queryGlobalComixNetworkBreakdown: networksMock,
  queryGlobalComixCampaigns: campaignsMock,
  queryGlobalComixTrend: trendMock,
  // dataAsOf is queried by the shared analyst for the freshness stamp
  // on ReadyData.provenance. Default to a stable date so the
  // bqCacheAgeSeconds computation is deterministic in tests.
  queryGlobalComixDataAsOf: dataAsOfMock,
}));

// The shared analyst's knowledge module wraps retrieve() behind the
// USE_ANALYST_KNOWLEDGE flag. Default is "off" -> []; mock the module
// so the manual-builder tests never touch Supabase regardless.
vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: vi.fn().mockResolvedValue({
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  }),
}));

// Force the analyst cache wrapper to fall through to the loader so
// the test never tries to talk to Upstash.
vi.mock("@/lib/cache/redis", () => ({
  cacheEnabled: () => false,
  redis: null,
}));

const FROM = new Date("2026-04-27T00:00:00Z");
const TO = new Date("2026-05-03T00:00:00Z");

function netRow(over: Record<string, unknown> = {}) {
  return {
    network: "Meta",
    spend: 5000,
    share: 0.5,
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
    ...over,
  };
}

function campRow(over: Record<string, unknown> = {}) {
  return {
    campaign_id: "c1",
    campaign_name: "YH_FB_test",
    network: "Meta",
    spend: 1000,
    installs: 200,
    cpi: 5,
    roas: 0,
    spendDelta: 0.1,
    ...over,
  };
}

beforeEach(() => {
  networksMock.mockReset();
  campaignsMock.mockReset();
  trendMock.mockReset();
  dataAsOfMock.mockReset();
  trendMock.mockResolvedValue([]);
  dataAsOfMock.mockResolvedValue("2026-05-03");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateReport (manual builder, BQ-backed)", () => {
  it("calls the three GlobalComix BQ queries with client + ISO date strings", async () => {
    networksMock.mockResolvedValueOnce([netRow()]);
    campaignsMock.mockResolvedValueOnce([campRow()]);
    const { generateReport } = await import("@/lib/reports/generate");
    await generateReport({
      prompt: "weekly review",
      from: FROM,
      to: TO,
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
    });
    expect(networksMock).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-27",
      "2026-05-03",
    );
    expect(campaignsMock).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-27",
      "2026-05-03",
    );
    expect(trendMock).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-27",
      "2026-05-03",
    );
  });

  it("emits the three yellowHEAD sections from the snapshot, never the deleted $6,230 fixture", async () => {
    networksMock.mockResolvedValueOnce([
      netRow({ network: "Meta", spend: 4321 }),
      netRow({ network: "TikTok", spend: 1234 }),
    ]);
    campaignsMock.mockResolvedValueOnce([campRow()]);
    const { generateReport } = await import("@/lib/reports/generate");
    const r = await generateReport({
      prompt: "weekly review",
      from: FROM,
      to: TO,
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
    });
    expect(r.sections.map((s) => s.id)).toEqual([
      "platform_overall",
      "channel_weekly",
      "channel_campaign",
    ]);
    // Real BQ values pass through.
    const platformSection = r.sections.find((s) => s.id === "platform_overall");
    if (platformSection?.id !== "platform_overall") throw new Error("narrow");
    const spends = platformSection.summary.rows.map((row) => row.spend.value);
    expect(spends).toContain(4321);
    expect(spends).toContain(1234);
    // Old fixture value is gone.
    expect(spends).not.toContain(6230);
    // Real spend is not 0.
    expect(spends.every((s) => s !== 0)).toBe(true);
  });

  it("stamps source=manual + authoredBy=nova on every manual deck", async () => {
    networksMock.mockResolvedValueOnce([netRow()]);
    campaignsMock.mockResolvedValueOnce([]);
    const { generateReport } = await import("@/lib/reports/generate");
    const r = await generateReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
    });
    expect(r.source).toBe("manual");
    expect(r.authoredBy).toBe("nova");
    expect(r.clientLabel).toBe("GlobalComix");
  });

  it("derives the title from the first prompt line when long enough", async () => {
    networksMock.mockResolvedValueOnce([netRow()]);
    campaignsMock.mockResolvedValueOnce([]);
    const { generateReport } = await import("@/lib/reports/generate");
    const r = await generateReport({
      prompt: "Custom title for week 18\nadditional context",
      from: FROM,
      to: TO,
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
    });
    expect(r.title).toBe("Custom title for week 18");
  });

  it("synthesises a default title when the prompt is too short", async () => {
    networksMock.mockResolvedValueOnce([netRow()]);
    campaignsMock.mockResolvedValueOnce([]);
    const { generateReport } = await import("@/lib/reports/generate");
    const r = await generateReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
    });
    expect(r.title).toMatch(/GlobalComix.*Week \d+ Review/);
  });

  it("throws for a client without real BQ data (no fixture-fallback)", async () => {
    const { generateReport } = await import("@/lib/reports/generate");
    await expect(
      generateReport({
        prompt: "x",
        from: FROM,
        to: TO,
        client: "playw3",
        platforms: ["android"],
        channels: ["meta"],
      }),
    ).rejects.toThrow(/real BQ data/);
    expect(networksMock).not.toHaveBeenCalled();
  });

  it("emits zero sections when BQ returns no rows (honest no-data state)", async () => {
    networksMock.mockResolvedValueOnce([]);
    campaignsMock.mockResolvedValueOnce([]);
    const { generateReport } = await import("@/lib/reports/generate");
    const r = await generateReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
    });
    expect(r.sections).toEqual([]);
    expect(r.source).toBe("manual");
  });
});
