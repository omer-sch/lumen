// Layer 2 (backend lib unit). File under test: src/lib/globalcomix-queries.ts.
// Priority: P0.
// GlobalComix is the multi-source path: spend is UNION'd across four per-
// network dwh_* tables and revenue comes from the cohort table. These tests
// pin the SQL shape (UNION leg presence, dedupe predicate, cohort join,
// Google iOS exclusion, parameter binding) without ever hitting BigQuery.
//
// The module is now wrapped by `withRedisCache` (Upstash). The wrapper is
// mocked to record the call shape (client, query, ttlSeconds, params) AND
// transparently invoke the loader, so the existing SQL/coercion assertions
// keep working *and* a dedicated suite below pins the cache contract.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryFn = vi.fn();

vi.mock("@google-cloud/bigquery", () => {
  class BigQuery {
    query(opts: unknown) {
      return queryFn(opts);
    }
  }
  return { BigQuery };
});

// Captures every `withRedisCache(opts, loader)` invocation so the
// "calls the wrapper with the expected shape" suite below can inspect
// what was handed in. The mock implementation invokes the loader
// directly, so the rest of this file's SQL/coercion assertions exercise
// the real `_queryGlobalComix*` bodies just as they did pre-migration.
type CacheCall = {
  client: string;
  query: string;
  params: unknown;
  ttlSeconds: number;
  hardCeilingSeconds?: number;
};
const cacheCalls: CacheCall[] = [];

vi.mock("@/lib/cache/with-redis-cache", () => ({
  withRedisCache: async <T>(opts: CacheCall, loader: () => Promise<T>) => {
    cacheCalls.push(opts);
    return loader();
  },
}));

// The cache wrapper assertions below derive the expected param hash by
// running the real `paramHash` helper. Keep the import after the mock
// so we still see the real keys module (only the wrapper is mocked).
import { paramHash } from "@/lib/cache/keys";

beforeEach(() => {
  queryFn.mockReset();
  cacheCalls.length = 0;
  vi.stubEnv("BQ_PROJECT", "test-project");
  vi.stubEnv("BQ_DATASET", "test_dataset");
  vi.stubEnv("ALLOWED_CLIENTS", "globalcomix,playw3,100play");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const FROM = "2026-04-15";
const TO = "2026-05-14";

describe("queryGlobalComixKPIs: UNION shape + cohort join", () => {
  it("UNION ALL'd spend over four per-network tables", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("dwh_fb2_globalcomix_adjust");
    expect(query).toContain("dwh_google_ads_globalcomix_adjust");
    expect(query).toContain("dwh_tik_tok_globalcomix_adjust");
    expect(query).toContain("dwh_apple_globalcomix_adjust");
    // The legs are unioned, not joined.
    expect(query).toContain("UNION ALL");
  });

  it("applies the No Breakdown dedupe predicate on every spend leg", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Four spend legs * (currr + prev) = predicate appears 8 times.
    const occurrences = query.match(/breakdown_type = 'No Breakdown'/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(8);
  });

  it("joins the cohort table for D7 revenue", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("uni_adjust_cohort_report_globalcomix");
    expect(query).toContain("_7D_Revenue_Total");
  });

  it("excludes Google iOS via _OS_name filter in the cohort subquery", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/_OS_name\s*=\s*'ios'/);
    expect(query).toMatch(/Google Ads/);
  });

  it("binds dates via @from / @to params, never inline strings", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const opts = queryFn.mock.calls[0][0] as {
      query: string;
      params: { from: string; to: string };
    };
    expect(opts.query).toContain("@from");
    expect(opts.query).toContain("@to");
    expect(opts.query).not.toContain(`'${FROM}'`);
    expect(opts.query).not.toContain(`'${TO}'`);
    expect(opts.params).toEqual({ from: FROM, to: TO });
  });

  it("sets BQ location to US (cohort tables live in US)", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const opts = queryFn.mock.calls[0][0] as { location: string };
    expect(opts.location).toBe("US");
  });
});

describe("queryGlobalComixKPIs: client guard", () => {
  it("rejects a client that is not in the env allowlist", async () => {
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await expect(
      queryGlobalComixKPIs("evil_client", FROM, TO),
    ).rejects.toThrow(/not permitted|Client not permitted/);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("rejects an agent-strategy client (e.g. playw3) since it has no multi-source config", async () => {
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await expect(
      queryGlobalComixKPIs("playw3", FROM, TO),
    ).rejects.toThrow(/not a multi-source|No table mapped/);
    expect(queryFn).not.toHaveBeenCalled();
  });
});

describe("queryGlobalComixTrend / ChannelMix / NetworkBreakdown / Campaigns", () => {
  it("queryGlobalComixTrend groups by (date, network) and orders ascending", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixTrend } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixTrend("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Per-network split: both CTEs and the final ORDER BY include network.
    expect(query).toMatch(/GROUP BY date,\s*network/);
    expect(query).toMatch(/ORDER BY date ASC,\s*network ASC/);
  });

  it("queryGlobalComixTrend selects the subscription-funnel derived metrics", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixTrend } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixTrend("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // CPA D7 hero metric and its peers must appear in the SELECT — the
    // chart's default tab needs them populated. SAFE_DIVIDE protects
    // a zero-denominator day from crashing.
    expect(query).toMatch(/AS cp_sub_start/);
    expect(query).toMatch(/AS cpa_d0/);
    expect(query).toMatch(/AS cpa_d7/);
    expect(query).toMatch(/SAFE_DIVIDE\(s\.spend, NULLIF\(r\.sub_d7,\s*0\)\)\s+AS cpa_d7/);
  });

  it("queryGlobalComixKPIs binds Sub D0 to _0D_Paying_Users in the cohort CTE", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("_0D_Paying_Users");
    expect(query).toMatch(/AS sub_d0/);
  });

  it("queryGlobalComixNetworkBreakdown embeds the trailing 30d CPA D7 baseline", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixNetworkBreakdown } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixNetworkBreakdown("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Trailing CTEs are inline so the status pill data comes from the
    // same query, not a second XHR.
    expect(query).toMatch(/spend_trailing AS/);
    expect(query).toMatch(/rev_trailing AS/);
    expect(query).toMatch(/AS trailing_cpa_d7_avg/);
    // Trailing window is [from - 30 days, from - 1 day].
    expect(query).toMatch(/INTERVAL 30 DAY/);
    expect(query).toMatch(/INTERVAL 1 DAY/);
  });

  it("queryGlobalComixChannelMix orders by spend desc and filters $0-spend networks", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixChannelMix } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixChannelMix("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("ORDER BY p.spend DESC");
    expect(query).toMatch(/WHERE\s+p\.spend\s*>\s*0/);
  });

  it("queryGlobalComixNetworkBreakdown returns one row per network", async () => {
    queryFn.mockResolvedValue([
      [
        { network: "Meta", spend: 100, share: 0.5, installs: 50, cpi: 2, roas: 1 },
        { network: "Google", spend: 80, share: 0.4, installs: 30, cpi: 2.66, roas: 0.9 },
      ],
    ]);
    const { queryGlobalComixNetworkBreakdown } = await import(
      "@/lib/globalcomix-queries"
    );
    const rows = await queryGlobalComixNetworkBreakdown(
      "globalcomix",
      FROM,
      TO,
    );
    expect(rows.map((r) => r.network)).toEqual(["Meta", "Google"]);
  });

  it("queryGlobalComixCampaigns sends a single query bound to from/to", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCampaigns } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCampaigns("globalcomix", FROM, TO);
    expect(queryFn).toHaveBeenCalledTimes(1);
    const opts = queryFn.mock.calls[0][0] as {
      params: { from: string; to: string };
    };
    expect(opts.params).toEqual({ from: FROM, to: TO });
  });
});

describe("queryGlobalComixDataBounds / DataAsOf", () => {
  it("queryGlobalComixDataBounds returns { earliest, latest } via toBounds coercion", async () => {
    queryFn.mockResolvedValue([
      [{ earliest: "2024-01-01", latest: "2026-05-14" }],
    ]);
    const { queryGlobalComixDataBounds } = await import(
      "@/lib/globalcomix-queries"
    );
    const out = await queryGlobalComixDataBounds("globalcomix");
    expect(out).toEqual({ earliest: "2024-01-01", latest: "2026-05-14" });
  });

  it("queryGlobalComixDataBounds tolerates missing data with nulls", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixDataBounds } = await import(
      "@/lib/globalcomix-queries"
    );
    const out = await queryGlobalComixDataBounds("globalcomix");
    expect(out).toEqual({ earliest: null, latest: null });
  });

  it("queryGlobalComixDataAsOf returns the latest date across the four spend tables", async () => {
    queryFn.mockResolvedValue([[{ data_as_of: "2026-05-14" }]]);
    const { queryGlobalComixDataAsOf } = await import(
      "@/lib/globalcomix-queries"
    );
    const out = await queryGlobalComixDataAsOf("globalcomix");
    expect(out).toBe("2026-05-14");
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("GREATEST");
    // One subquery per per-network spend table (4).
    expect((query.match(/MAX\(date\)/g) ?? []).length).toBe(4);
  });

  it("queryGlobalComixDataAsOf unwraps the BQ { value: string } object shape", async () => {
    queryFn.mockResolvedValue([[{ data_as_of: { value: "2026-05-14" } }]]);
    const { queryGlobalComixDataAsOf } = await import(
      "@/lib/globalcomix-queries"
    );
    expect(await queryGlobalComixDataAsOf("globalcomix")).toBe("2026-05-14");
  });

  it("queryGlobalComixDataAsOf returns null on unexpected shapes", async () => {
    queryFn.mockResolvedValue([[{ data_as_of: 12345 }]]);
    const { queryGlobalComixDataAsOf } = await import(
      "@/lib/globalcomix-queries"
    );
    expect(await queryGlobalComixDataAsOf("globalcomix")).toBe(null);

    queryFn.mockResolvedValue([[{ data_as_of: { value: 12345 } }]]);
    const { queryGlobalComixDataAsOf: q2 } = await import(
      "@/lib/globalcomix-queries"
    );
    expect(await q2("globalcomix")).toBe(null);
  });
});

describe("queryGlobalComixKPIs: numeric coercion", () => {
  it("treats nullish numerics as 0; preserves real values", async () => {
    queryFn.mockResolvedValue([
      [
        {
          spend: null,
          installs: undefined,
          clicks: "1234",
          impressions: 5678,
          cpi: NaN,
          roas: "1.42",
        },
      ],
    ]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    const result = await queryGlobalComixKPIs("globalcomix", FROM, TO);
    expect(result.spend).toBe(0);
    expect(result.installs).toBe(0);
    expect(result.clicks).toBe(1234);
    expect(result.impressions).toBe(5678);
    expect(result.cpi).toBe(0);
    expect(result.roas).toBeCloseTo(1.42);
  });

  it("coerces BigQueryInt-style objects via toNumber()", async () => {
    queryFn.mockResolvedValue([
      [
        {
          spend: { toNumber: () => 9999 },
          installs: { value: "42" },
        },
      ],
    ]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    const result = await queryGlobalComixKPIs("globalcomix", FROM, TO);
    expect(result.spend).toBe(9999);
    expect(result.installs).toBe(42);
  });
});

// ── Cache-wrapping contract ───────────────────────────────────────────────
//
// The 6 dashboard queries cache for 12 hours; DataBounds caches for 30
// minutes; DataAsOf is intentionally NOT wrapped (drives the freshness
// stamp, see globalcomix-queries.ts header comment). Each wrapped export
// must hand `withRedisCache` a `{client, query, params, ttlSeconds}`
// shape that matches what `cacheKey()` will hash to — so two callers
// passing equivalent params land on the same Redis key.
describe("globalcomix-queries cache-wrapping contract", () => {
  const TWELVE_HOURS_S = 60 * 60 * 12;
  const THIRTY_MIN_S = 60 * 30;
  const expectedDateParams = { from: FROM, to: TO };
  const expectedDateHash = paramHash(expectedDateParams);
  const expectedEmptyHash = paramHash({});

  async function callAll(client: string, from: string, to: string) {
    const mod = await import("@/lib/globalcomix-queries");
    queryFn.mockResolvedValue([[]]);
    await mod.queryGlobalComixKPIs(client, from, to);
    await mod.queryGlobalComixTrend(client, from, to);
    await mod.queryGlobalComixChannelMix(client, from, to);
    await mod.queryGlobalComixNetworkBreakdown(client, from, to);
    await mod.queryGlobalComixPayback(client, from, to);
    await mod.queryGlobalComixCampaigns(client, from, to);
    await mod.queryGlobalComixDataBounds(client);
    // DataAsOf is intentionally uncached — make sure we don't see it.
    queryFn.mockResolvedValue([[{ data_as_of: "2026-05-14" }]]);
    await mod.queryGlobalComixDataAsOf(client);
  }

  it("wraps every dashboard query with the right (client, query, ttl, params) shape", async () => {
    await callAll("globalcomix", FROM, TO);

    const byQuery = Object.fromEntries(cacheCalls.map((c) => [c.query, c]));

    for (const name of [
      "kpis",
      "trend",
      "channel-mix",
      "network-breakdown",
      "payback",
      "campaigns",
    ] as const) {
      const call = byQuery[name];
      expect(call, name).toBeDefined();
      expect(call.client).toBe("globalcomix");
      expect(call.ttlSeconds).toBe(TWELVE_HOURS_S);
      expect(call.params).toEqual(expectedDateParams);
      // Sanity: same date params hash identically across all six —
      // proves callers will share Redis keys when their windows match.
      expect(paramHash(call.params)).toBe(expectedDateHash);
    }
  });

  it("wraps DataBounds with a 30-minute TTL and empty params", async () => {
    await callAll("globalcomix", FROM, TO);
    const bounds = cacheCalls.find((c) => c.query === "data-bounds");
    expect(bounds).toBeDefined();
    expect(bounds!.ttlSeconds).toBe(THIRTY_MIN_S);
    expect(bounds!.params).toEqual({});
    expect(paramHash(bounds!.params)).toBe(expectedEmptyHash);
  });

  it("does NOT wrap DataAsOf — it must stay live for the freshness path", async () => {
    await callAll("globalcomix", FROM, TO);
    expect(cacheCalls.find((c) => c.query === "data-as-of")).toBeUndefined();
    // Defense-in-depth: nothing else should be wrapped under a name we
    // didn't intend. If a future query name leaks through, this asserts.
    const names = cacheCalls.map((c) => c.query).sort();
    expect(names).toEqual(
      [
        "kpis",
        "trend",
        "channel-mix",
        "network-breakdown",
        "payback",
        "campaigns",
        "data-bounds",
      ].sort(),
    );
  });
});

// ── WS1.B — Organic + AppLovin cohort branches; Pubmint TODO marker ────────
describe("buildCohortSubquery: attribution-bucket CASE", () => {
  it("maps the three Organic strings into the 'Organic' bucket", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // All three Organic flavors should resolve to the same display label.
    expect(query).toContain("'Organic'");
    expect(query).toContain("'Google Organic Search'");
    expect(query).toContain("'Untrusted Devices'");
    // The branch returns the literal 'Organic' (one occurrence in the
    // THEN clause is enough to prove the case wiring landed).
    expect(query).toMatch(/THEN 'Organic'/);
  });

  it("maps both Axon AppLovin strings into the 'AppLovin' bucket", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("'Axon by AppLovin Android'");
    expect(query).toContain("'Axon by AppLovin iOS'");
    expect(query).toMatch(/THEN 'AppLovin'/);
  });

  it("leaves a TODO marker for Pubmint (open Q2 awaiting Gabby's call)", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Pubmint stays out of the bucketed CASE branches.
    expect(query).not.toMatch(/THEN 'Pubmint'/);
    // The TODO comment ships inside the SQL so a future reader sees the gap.
    expect(query).toContain("TODO(open-q-2)");
  });

  it("keeps the Google iOS attribution filter exactly as before", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/NOT \(_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios'\)/);
  });
});

// ── WS1.C — campaign cohort JOIN + maturity-friendly nulls ─────────────────
describe("queryGlobalComixCampaigns: cohort _Campaign_ID join", () => {
  it("LEFT JOINs the cohort table on `campaign_id` and selects ROI D7 / sub funnel", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCampaigns } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCampaigns("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // No more hardcoded zero — ROI D7 is real, sourced from rev_d7 / spend.
    expect(query).not.toMatch(/CAST\(0 AS FLOAT64\)\s+AS\s+roas/);
    expect(query).toMatch(/AS roi_d7/);
    // The cohort CTE projects the three new fields the dashboard reads.
    expect(query).toMatch(/AS sub_d7/);
    expect(query).toMatch(/AS sub_start_d7/);
    expect(query).toMatch(/AS cpa_d7/);
    // Join shape: LEFT JOIN preserves spend-only campaigns (cohort NULLs
    // surface as null fields the renderer prints as "—").
    expect(query).toMatch(/LEFT JOIN curr_cohort cc\s+USING \(campaign_id\)/);
    // _Campaign_ID is the join key (distinct from the unreliable
    // _Campaign_Attribution string). It's CAST to STRING so the join
    // lands cleanly against the spend-side campaign_id (also STRING).
    expect(query).toMatch(/CAST\(_Campaign_ID AS STRING\)\s+AS campaign_id/);
  });

  it("returns null cohort fields for campaigns with no Adjust attribution", async () => {
    queryFn.mockResolvedValue([
      [
        {
          campaign_id: "c-orphan",
          campaign_name: "YH_FB_orphan",
          network: "Meta",
          spend: 500,
          installs: 50,
          cpi: 10,
          // Cohort CTE didn't match — these come back null from BQ.
          sub_d7: null,
          sub_start_d7: null,
          cpa_d7: null,
          roi_d7: null,
          spend_delta: null,
        },
      ],
    ]);
    const { queryGlobalComixCampaigns } = await import(
      "@/lib/globalcomix-queries"
    );
    const rows = await queryGlobalComixCampaigns("globalcomix", FROM, TO);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.spend).toBe(500);
    // numberish coerces null to 0 for totals, numberOrNull keeps null for
    // optional cohort fields so the UI can render "—" honestly.
    expect(r.sub_d7).toBeNull();
    expect(r.sub_start_d7).toBeNull();
    expect(r.cpa_d7).toBeNull();
    // ROI D7 uses numberish (0 when missing) so the column stays numeric.
    expect(r.roi_d7).toBe(0);
  });

  it("emits the cohort's Google iOS exclusion filter inside the curr_cohort CTE", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCampaigns } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCampaigns("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/NOT \(_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios'\)/);
  });
});
