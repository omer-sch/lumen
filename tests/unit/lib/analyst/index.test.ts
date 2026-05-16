// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/index.ts.
// End-to-end shape test for getReadyData with the BQ + retrieve layer
// mocked. Verifies the full ReadyData contract: rows, anomalies (with
// provenance), rankings, comparisons, knowledgeChunks, and the
// ReadyDataProvenance fields including a non-empty cacheKey and
// derived bqCacheAgeSeconds.
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

// Skip the cache wrapper. Without Redis configured in tests the wrapper
// already falls through to the loader, so this is just a defensive
// alias so the test environment never tries to dial Upstash.
vi.mock("@/lib/cache/redis", () => ({
  cacheEnabled: () => false,
  redis: null,
}));

import { getReadyData } from "@/lib/analyst";
import type { Intent } from "@/lib/analyst/types";
import type { CampaignRow, NetworkRow } from "@/types/dashboard";

function intent(over: Partial<Intent> = {}): Intent {
  return {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: {
      label: "last 7 days",
      iso_start: "2026-05-01",
      iso_end: "2026-05-07",
    },
    focus: null,
    confidence: 1,
    doubts: [],
    ...over,
  };
}

function net(over: Partial<NetworkRow>): NetworkRow {
  return {
    network: "Meta", spend: 100, share: 0.1, installs: 10,
    clicks: 200, impressions: 5000,
    ftdD7: 10, subStart: 10, subD0: 8, subD7: 20,
    cpi: 10, cpSubStart: 10, cpaD0: 12.5, cpaD7: 100,
    ctr: 0.04, cpm: 20, cpc: 0.5,
    roasD7: 0.3, roasD14: 0.4, roasD30: 0.5, roasD90: 0.6,
    payersD7: 12, retD7: 0.4, trailingCpaD7Avg: 100,
    ...over,
  };
}

function camp(over: Partial<CampaignRow>): CampaignRow {
  return {
    campaign_id: "c1", campaign_name: "X", network: "Meta",
    spend: 100, installs: 10, cpi: 10, roas: 0.3, spendDelta: null,
    ...over,
  };
}

beforeEach(() => {
  networkBreakdownMock.mockReset();
  campaignsMock.mockReset();
  trendMock.mockReset();
  dataAsOfMock.mockReset();
  retrieveMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getReadyData", () => {
  it("returns a complete ReadyData contract with provenance", async () => {
    networkBreakdownMock.mockResolvedValue([
      net({ network: "Meta", spend: 100, subD7: 20 }),
      net({ network: "Google", spend: 110, subD7: 25 }),
      net({ network: "TikTok", spend: 90, subD7: 22 }),
    ]);
    campaignsMock.mockResolvedValue([
      camp({ campaign_id: "a", spend: 300 }),
      camp({ campaign_id: "b", spend: 200 }),
    ]);
    trendMock.mockResolvedValue([]);
    dataAsOfMock.mockResolvedValue("2026-05-07");
    retrieveMock.mockResolvedValue({
      chunks: [],
      citations: [],
      chunks_returned: 0,
      latency_ms: 0,
      query_embedding_cost_usd: 0,
    });

    const r = await getReadyData(intent());

    // Shape: every field the spec declares is present.
    expect(r.intent.client).toBe("globalcomix");
    expect(r.clientLabel).toBeTruthy();
    expect(r.period.isoStart).toBe("2026-05-01");
    expect(r.period.isoEnd).toBe("2026-05-07");
    expect(r.networks).toHaveLength(3);
    expect(r.campaigns).toHaveLength(2);
    // Campaigns are enriched with classifier output. The mock names are
    // single-letter (don't match the canonical pattern) so every row
    // falls back to "Other"; the assertion below verifies the fields
    // exist regardless of name shape.
    for (const c of r.campaigns) {
      expect(typeof c.family).toBe("string");
      expect(typeof c.geo).toBe("string");
      expect(typeof c.campaignType).toBe("string");
    }
    expect(r.trend).toEqual([]);
    // History is fetched in parallel with the current-period BQ trio.
    // With HISTORY_WEEKS=4 trailing weeks and 3 networks per week
    // (the same network mock returns the same rows on every shifted
    // call) we expect 12 rows.
    expect(r.history.networks).toHaveLength(4 * 3);
    expect(Array.isArray(r.anomalies)).toBe(true);
    expect(r.rankings.topCampaignsBySpend.rows).toHaveLength(2);
    expect(r.rankings.topCampaignsBySpend.partial).toBe(true); // requested 5, have 2
    expect(r.comparisons.cpaD7PoP).toHaveLength(3);
    expect(r.knowledgeChunks).toEqual([]);

    // Provenance.
    expect(r.provenance.cacheKey).toMatch(
      /^lumen:cache:v1:globalcomix:analyst-ready-data:[0-9a-f]{12}$/,
    );
    expect(r.provenance.queryIds).toContain("network-breakdown");
    expect(r.provenance.queryIds).toContain("campaigns");
    expect(r.provenance.queryIds).toContain("trend");
    expect(r.provenance.queryIds).toContain("data-as-of");
    expect(r.provenance.bqCacheAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(Date.parse(r.provenance.fetchedAt)).not.toBeNaN();
  });

  it("every anomaly carries non-empty provenance fields and a 16-char id", async () => {
    // Construct a network distribution where the spend z-score detector
    // fires for one network (Unity Ads). Same setup as the ground-truth
    // fixture but inline so the test is self-contained.
    networkBreakdownMock.mockResolvedValue([
      net({ network: "Meta", spend: 100 }),
      net({ network: "Google", spend: 110 }),
      net({ network: "TikTok", spend: 90 }),
      net({ network: "Apple", spend: 100 }),
      net({ network: "AppLovin", spend: 110 }),
      net({ network: "Unity Ads", spend: 1000, subD7: 200 }),
    ]);
    campaignsMock.mockResolvedValue([]);
    trendMock.mockResolvedValue([]);
    dataAsOfMock.mockResolvedValue("2026-05-07");
    retrieveMock.mockResolvedValue({
      chunks: [], citations: [], chunks_returned: 0, latency_ms: 0,
      query_embedding_cost_usd: 0,
    });

    const r = await getReadyData(intent());
    expect(r.anomalies.length).toBeGreaterThan(0);
    for (const a of r.anomalies) {
      expect(a.id).toMatch(/^[0-9a-f]{16}$/);
      expect(a.kind).toBe("anomaly");
      expect(a.provenance.algorithm).toMatch(/^anomstack\//);
      expect(a.provenance.queryIds.length).toBeGreaterThan(0);
      expect(a.provenance.computedAt).toBeTruthy();
    }
  });

  it("survives a dataAsOf failure (bqCacheAgeSeconds defaults to 0)", async () => {
    networkBreakdownMock.mockResolvedValue([]);
    campaignsMock.mockResolvedValue([]);
    trendMock.mockResolvedValue([]);
    dataAsOfMock.mockRejectedValue(new Error("bq offline"));
    retrieveMock.mockResolvedValue({
      chunks: [], citations: [], chunks_returned: 0, latency_ms: 0,
      query_embedding_cost_usd: 0,
    });

    const r = await getReadyData(intent());
    expect(r.provenance.bqCacheAgeSeconds).toBe(0);
  });
});
