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
  it("UNION ALL'd spend over the five per-network tables", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("dwh_fb2_globalcomix_adjust");
    expect(query).toContain("dwh_google_ads_globalcomix_adjust");
    expect(query).toContain("dwh_tik_tok_globalcomix_adjust");
    expect(query).toContain("dwh_apple_globalcomix_adjust");
    expect(query).toContain("dwh_applovin_globalcomix_adjust");
    // The legs are unioned, not joined.
    expect(query).toContain("UNION ALL");
  });

  it("applies the No Breakdown dedupe predicate on every spend leg", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Five spend legs * (curr + prev) = predicate appears 10 times.
    const occurrences = query.match(/breakdown_type = 'No Breakdown'/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(10);
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
    // One subquery per per-network spend table (5 after AppLovin wire-in).
    expect((query.match(/MAX\(date\)/g) ?? []).length).toBe(5);
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

// ── WS1.B / WS3 — Cohort attribution buckets + parameterized API ───────────
describe("buildCohortSubquery: attribution-bucket CASE", () => {
  it("maps the Axon AppLovin strings into the 'AppLovin' bucket (always-on)", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("'Axon by AppLovin Android'");
    expect(query).toContain("'Axon by AppLovin iOS'");
    expect(query).toMatch(/THEN 'AppLovin'/);
  });

  it("paid-only path (default): Organic strings fall through to NULL", async () => {
    // WS3 design: KPI / Trend / NetworkBreakdown call buildCohortSubquery
    // with the default includeOrganic=false to avoid contaminating their
    // paid-only totals. The three Organic strings should not appear as
    // a `THEN 'Organic'` branch in the emitted SQL.
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).not.toMatch(/THEN 'Organic'/);
    expect(query).not.toContain("'Google Organic Search'");
  });

  it("opted-in path: includeOrganic=true emits the 'Organic' branch", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", { includeOrganic: true });
    expect(sql).toContain("'Organic'");
    expect(sql).toContain("'Google Organic Search'");
    expect(sql).toContain("'Untrusted Devices'");
    expect(sql).toMatch(/THEN 'Organic'/);
  });

  it("leaves a TODO marker for Pubmint regardless of includeOrganic", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const paidOnly = buildCohortSubquery("globalcomix");
    const withOrganic = buildCohortSubquery("globalcomix", { includeOrganic: true });
    for (const sql of [paidOnly, withOrganic]) {
      expect(sql).not.toMatch(/THEN 'Pubmint'/);
      expect(sql).toContain("TODO(open-q-2)");
    }
  });

  it("keeps the Google iOS attribution filter regardless of includeOrganic", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const paidOnly = buildCohortSubquery("globalcomix");
    const withOrganic = buildCohortSubquery("globalcomix", { includeOrganic: true });
    for (const sql of [paidOnly, withOrganic]) {
      expect(sql).toMatch(/NOT \(_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios'\)/);
    }
  });
});

// ── WS3 — Parameterized groupBy + new metric projections ───────────────────
describe("buildCohortSubquery: groupBy parameterization", () => {
  it("defaults to GROUP BY (date, network) for back-compat", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix");
    expect(sql).toMatch(/_Day_Date AS date/);
    expect(sql).toMatch(/END AS network/);
    expect(sql).toMatch(/GROUP BY 1, 2/);
  });

  it("projects only the requested dimensions when groupBy is custom", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", { groupBy: ["country"] });
    expect(sql).toMatch(/_Country AS country/);
    // Network CASE should not appear in a country-only query.
    expect(sql).not.toMatch(/END AS network/);
    expect(sql).toMatch(/GROUP BY 1/);
  });

  it("emits CAST(_Campaign_ID AS STRING) for the campaign_id dimension", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", {
      groupBy: ["campaign_id"],
    });
    expect(sql).toMatch(/CAST\(_Campaign_ID AS STRING\) AS campaign_id/);
  });

  it("emits _OS_name AS os when groupBy includes os", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", { groupBy: ["os"] });
    expect(sql).toMatch(/_OS_name AS os/);
  });

  it("emits _Ad_ID and _Creative_Attribution for the creatives dimensions", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", {
      groupBy: ["ad_id", "creative"],
    });
    expect(sql).toMatch(/CAST\(_Ad_ID AS STRING\) AS ad_id/);
    expect(sql).toMatch(/_Creative_Attribution AS creative_name/);
    expect(sql).toMatch(/GROUP BY 1, 2/);
  });

  it("emits _Adgroup_Attribution AS adset_name when groupBy includes adset", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", { groupBy: ["adset"] });
    expect(sql).toMatch(/_Adgroup_Attribution AS adset_name/);
    expect(sql).toMatch(/GROUP BY 1/);
  });

  it("combines adset with ad_id when both are requested (creative-breakdown shape)", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix", {
      groupBy: ["date", "ad_id", "adset", "network"],
    });
    expect(sql).toMatch(/CAST\(_Ad_ID AS STRING\) AS ad_id/);
    expect(sql).toMatch(/_Adgroup_Attribution AS adset_name/);
    expect(sql).toMatch(/GROUP BY 1, 2, 3, 4/);
  });

  it("always projects the expanded metric set (sub_start D0/D7/D14, trial_start, sub D14/D30/D90)", async () => {
    const { buildCohortSubquery } = await import("@/lib/globalcomix-queries");
    const sql = buildCohortSubquery("globalcomix");
    expect(sql).toMatch(/AS sub_start_d0/);
    expect(sql).toMatch(/AS sub_start_d7/);
    expect(sql).toMatch(/AS sub_start_d14/);
    expect(sql).toMatch(/AS trial_start_d0/);
    expect(sql).toMatch(/AS trial_start_d7/);
    expect(sql).toMatch(/AS trial_start_d14/);
    expect(sql).toMatch(/AS sub_d14/);
    expect(sql).toMatch(/AS sub_d30/);
    expect(sql).toMatch(/AS sub_d90/);
  });
});

// ── WS3 — sub_start source switch (spend ftd_d7 -> cohort _7D_subscription_start_Events) ──
describe("queryGlobalComixKPIs: sub_start sources from cohort", () => {
  it("does NOT alias spend ftd_d7 as sub_start in the spend CTEs", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Pre-WS3 the spend CTEs emitted `SUM(ftd_d7) AS sub_start`. Post-WS3
    // sub_start comes from cohort sub_start_d7; the spend CTEs only keep
    // ftd_d7 for back-compat consumers and shouldn't double-alias it.
    expect(query).not.toMatch(/SUM\(ftd_d7\)\s+AS sub_start\b/);
  });

  it("reads sub_start from the cohort CTE (rc.sub_start_d7) in the SELECT", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/rc\.sub_start_d7\s+AS sub_start\b/);
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

// ── WS5 — Weekends ─────────────────────────────────────────────────────────
describe("queryGlobalComixWeekends", () => {
  it("buckets by EXTRACT(DAYOFWEEK FROM date) IN (1, 7)", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixWeekends } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixWeekends("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/EXTRACT\(DAYOFWEEK FROM date\)/);
    expect(query).toMatch(/IN \(1, 7\)/);
    expect(query).toMatch(/'weekend'/);
    expect(query).toMatch(/'weekday'/);
  });

  it("recomputes rate metrics from bucket sums (not averages of daily rates)", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixWeekends } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixWeekends("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // CPA D7, install CVR, ROI D7 etc. are SAFE_DIVIDE of bucket SUMs.
    expect(query).toMatch(/SAFE_DIVIDE\(s\.spend, NULLIF\(c\.sub_d7, 0\)\)\s+AS cpa_d7/);
    expect(query).toMatch(/SAFE_DIVIDE\(c\.rev_d7, NULLIF\(s\.spend, 0\)\)\s+AS roi_d7/);
  });

  it("registers query id 'weekends' for cache + provenance", async () => {
    const mod = await import("@/lib/globalcomix-queries");
    queryFn.mockResolvedValue([[]]);
    await mod.queryGlobalComixWeekends("globalcomix", FROM, TO);
    const call = cacheCalls.find((c) => c.query === "weekends");
    expect(call).toBeDefined();
    expect(call!.ttlSeconds).toBe(60 * 60 * 12);
  });
});

// ── WS5 — Geo ──────────────────────────────────────────────────────────────
describe("queryGlobalComixGeo", () => {
  it("groups by country and includes the Organic bucket via buildCohortSubquery", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixGeo } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixGeo("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/_Country AS country/);
    // Organic branch should ship since the geo query opts in for the
    // paid-vs-organic per-country split.
    expect(query).toMatch(/THEN 'Organic'/);
    expect(query).toMatch(/GROUP BY country/);
  });

  it("translates cohort full names into ISO-2 country_code via the static map", async () => {
    queryFn.mockResolvedValue([
      [
        {
          country_name: "United States",
          sub_d7: 100,
          rev_d7: 1000,
          sub_paid: 60,
          sub_organic: 40,
        },
        {
          country_name: "Atlantis", // unknown — code falls back to name
          sub_d7: 5,
          rev_d7: 50,
          sub_paid: 5,
          sub_organic: 0,
        },
      ],
    ]);
    const { queryGlobalComixGeo } = await import("@/lib/globalcomix-queries");
    const rows = await queryGlobalComixGeo("globalcomix", FROM, TO);
    expect(rows[0].country_code).toBe("US");
    expect(rows[1].country_code).toBe("Atlantis"); // unknown ↦ raw name
  });
});

// ── WS5 — Creatives ────────────────────────────────────────────────────────
describe("queryGlobalComixCreatives", () => {
  it("joins ods_fb2_creatives_globalcomix on _Ad_ID = _creative_id", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCreatives("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("ods_fb2_creatives_globalcomix");
    expect(query).toMatch(/LEFT JOIN/);
    expect(query).toMatch(/c\.ad_id = CAST\(f\._creative_id AS STRING\)/);
  });

  it("orders by spend desc nulls last and limits to 100", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCreatives("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/ORDER BY SUM\(s\.cost_usd\) DESC NULLS LAST/);
    expect(query).toMatch(/LIMIT 100/);
  });

  it("joins per-ad spend on the Creatives slice from Meta, TikTok, AppLovin", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCreatives("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Each per-network leg projects ad_id and reads from the Creatives slice.
    expect(query).toMatch(/breakdown_type = 'Creatives'/);
    expect(query).toContain("dwh_fb2_globalcomix_adjust");
    expect(query).toContain("dwh_tik_tok_globalcomix_adjust");
    expect(query).toContain("dwh_applovin_globalcomix_adjust");
    // Google + Apple do NOT contribute legs to the spend Creatives sub —
    // the per-ad spend column doesn't exist on those tables. Their rows
    // surface from cohort with NULL spend.
    expect(query).not.toMatch(
      /SELECT\s+date,\s+'Google'\s+AS network,\s+CAST\(ad_id/,
    );
    expect(query).not.toMatch(
      /SELECT\s+date,\s+'Apple Search Ads'\s+AS network,\s+CAST\(ad_id/,
    );
  });

  it("computes CPI / CPA D7 / ROI D7 via SAFE_DIVIDE with a maturity gate on CPA", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCreatives("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // CPI = spend / installs.
    expect(query).toMatch(
      /SAFE_DIVIDE\(SUM\(s\.cost_usd\), NULLIF\(SUM\(s\.installs\), 0\)\)\s+AS cpi/,
    );
    // CPA D7 = spend / sub_d7, gated by maturity threshold.
    expect(query).toMatch(/WHEN SUM\(c\.sub_d7\) >= 10/);
    expect(query).toMatch(
      /SAFE_DIVIDE\(SUM\(s\.cost_usd\), NULLIF\(SUM\(c\.sub_d7\), 0\)\)/,
    );
    // ROI D7 = rev_d7 / spend.
    expect(query).toMatch(
      /SAFE_DIVIDE\(SUM\(c\.rev_d7\), NULLIF\(SUM\(s\.cost_usd\), 0\)\)\s+AS roi_d7/,
    );
  });

  it("returns Meta row with real spend / installs / CPI / CPA D7 / ROI D7", async () => {
    queryFn.mockResolvedValue([
      [
        {
          ad_id: "fb-1",
          ad_name: "YH_FB_APP_Sub_Romance_v1",
          creative_name: "Romance_v1",
          adset_name: "Adset_Romance",
          campaign_id: "12345",
          campaign_name: "YH_FB_APP_FULL_Sub_iOS_Romance",
          network: "Meta",
          thumbnail_url: "https://example.com/thumb.jpg",
          spend: 1000,
          installs: 100,
          clicks: 500,
          impressions: 50000,
          sub_start_d7: 25,
          sub_d7: 20,
          rev_d7: 80,
          cpi: 10,
          cpa_d7: 50,
          roi_d7: 0.08,
        },
      ],
    ]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    const rows = await queryGlobalComixCreatives("globalcomix", FROM, TO);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.network).toBe("Meta");
    expect(r.spend).toBe(1000);
    expect(r.installs).toBe(100);
    expect(r.cpi).toBe(10);
    expect(r.cpa_d7).toBe(50);
    expect(r.roi_d7).toBeCloseTo(0.08);
    expect(r.adset_name).toBe("Adset_Romance");
    expect(r.campaign_name).toBe("YH_FB_APP_FULL_Sub_iOS_Romance");
  });

  it("returns Google/Apple rows with null spend + null efficiency metrics", async () => {
    queryFn.mockResolvedValue([
      [
        {
          ad_id: "g-1",
          ad_name: "google-ad",
          creative_name: "",
          adset_name: "",
          campaign_id: null,
          campaign_name: null,
          network: "Google",
          thumbnail_url: null,
          spend: null,
          installs: null,
          clicks: null,
          impressions: null,
          sub_start_d7: 5,
          sub_d7: 3,
          rev_d7: 10,
          cpi: null,
          cpa_d7: null,
          roi_d7: null,
        },
      ],
    ]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    const rows = await queryGlobalComixCreatives("globalcomix", FROM, TO);
    expect(rows[0].spend).toBeNull();
    expect(rows[0].installs).toBeNull();
    expect(rows[0].cpi).toBeNull();
    expect(rows[0].cpa_d7).toBeNull();
    expect(rows[0].roi_d7).toBeNull();
    // Cohort side still present.
    expect(rows[0].sub_start_d7).toBe(5);
    expect(rows[0].sub_d7).toBe(3);
    expect(rows[0].rev_d7).toBe(10);
  });

  it("groups by adset_name and projects it into the per-ad row", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCreatives("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/_Adgroup_Attribution AS adset_name/);
    expect(query).toMatch(/COALESCE\(c\.adset_name, ''\)\s+AS adset_name/);
    expect(query).toMatch(/GROUP BY c\.ad_id, c\.creative_name, c\.adset_name/);
  });

  it("threads the OS filter through both the cohort and the spend-Creatives subqueries", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixCreatives } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixCreatives("globalcomix", FROM, TO, { os: "ios" });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Cohort side filters _OS_name.
    expect(query).toMatch(/LOWER\(_OS_name\) = 'ios'/);
    // Spend-Creatives side: Meta uses column strategy.
    expect(query).toMatch(/LOWER\(os\) = 'ios'/);
  });
});

// ── Top Ad trend (current vs prior 30d) ────────────────────────────────────
describe("queryGlobalComixTopAdTrend", () => {
  it("returns top_ad=null + empty points when no ad clears the $100 spend threshold", async () => {
    // First call (find top ad) returns empty rows -> no qualifying ad.
    queryFn.mockResolvedValueOnce([[]]);
    const { queryGlobalComixTopAdTrend } = await import(
      "@/lib/globalcomix-queries"
    );
    const out = await queryGlobalComixTopAdTrend("globalcomix", FROM, TO);
    expect(out.top_ad).toBeNull();
    expect(out.points).toEqual([]);
  });

  it("issues two queries: top-ad lookup then current+prior daily series", async () => {
    queryFn
      .mockResolvedValueOnce([
        [
          {
            ad_id: "fb-1",
            network: "Meta",
            campaign_name: "YH_FB_APP_Sub",
            spend: 2500,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { date: "2026-05-10", spend: 100, is_current: true },
          { date: "2026-04-10", spend: 80, is_current: false },
        ],
      ]);
    const { queryGlobalComixTopAdTrend } = await import(
      "@/lib/globalcomix-queries"
    );
    const out = await queryGlobalComixTopAdTrend("globalcomix", FROM, TO);
    expect(queryFn).toHaveBeenCalledTimes(2);
    const top = queryFn.mock.calls[0][0] as { query: string };
    expect(top.query).toMatch(/HAVING SUM\(cost_usd\) >= 100/);
    expect(top.query).toMatch(/ORDER BY SUM\(cost_usd\) DESC\s+LIMIT 1/);
    const series = queryFn.mock.calls[1][0] as { query: string };
    expect(series.query).toMatch(/WITH curr AS/);
    expect(series.query).toMatch(/prev AS/);
    expect(series.query).toMatch(
      /DATE_SUB\(DATE\(@from\), INTERVAL DATE_DIFF\(DATE\(@to\), DATE\(@from\), DAY\) \+ 1 DAY\)/,
    );
    expect(series.query).toMatch(/ad_id = 'fb-1'/);
    expect(out.top_ad).toEqual({
      ad_id: "fb-1",
      ad_name: "YH_FB_APP_Sub",
      network: "Meta",
    });
    expect(out.points).toHaveLength(2);
    expect(out.points[0].is_current).toBe(true);
    expect(out.points[1].is_current).toBe(false);
  });

  it("falls back to ad_id for ad_name when campaign_name is null", async () => {
    queryFn
      .mockResolvedValueOnce([
        [
          {
            ad_id: "tt-99",
            network: "TikTok",
            campaign_name: null,
            spend: 300,
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);
    const { queryGlobalComixTopAdTrend } = await import(
      "@/lib/globalcomix-queries"
    );
    const out = await queryGlobalComixTopAdTrend("globalcomix", FROM, TO);
    expect(out.top_ad?.ad_name).toBe("tt-99");
  });

  it("sanitizes the resolved ad_id before splicing into the series query", async () => {
    queryFn
      .mockResolvedValueOnce([
        [
          {
            ad_id: "ad'; DROP TABLE--",
            network: "Meta",
            campaign_name: null,
            spend: 500,
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);
    const { queryGlobalComixTopAdTrend } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixTopAdTrend("globalcomix", FROM, TO);
    const series = queryFn.mock.calls[1][0] as { query: string };
    // Quotes / semicolons / spaces stripped by sanitizeCampaignId.
    expect(series.query).toMatch(/ad_id = 'adDROPTABLE--'/);
    expect(series.query).not.toContain("'; DROP TABLE");
  });
});

// ── WS5 — Attribution Validation ───────────────────────────────────────────
describe("queryGlobalComixAttributionValidation", () => {
  it("unions per-network platform legs (Meta, Google, TikTok) and joins cohort iOS", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixAttributionValidation } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixAttributionValidation("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Three per-network legs.
    expect(query).toMatch(/'Meta'\s+AS network/);
    expect(query).toMatch(/'Google'\s+AS network/);
    expect(query).toMatch(/'TikTok'\s+AS network/);
    // Cohort side filters to iOS only (matches Looker page scope).
    expect(query).toMatch(/os = 'ios'/);
    // ISO week format token shows up so the per-(network, week_iso)
    // shape is correct.
    expect(query).toMatch(/%G-W%V/);
  });

  it("computes delta_pct as SAFE_DIVIDE so a zero adjust side reads NULL", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixAttributionValidation } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixAttributionValidation("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/SAFE_DIVIDE\(p\.platform_subs - COALESCE\(a\.adjust_subs, 0\), NULLIF\(a\.adjust_subs, 0\)\)\s+AS delta_pct/);
  });

  it("leaves an open-q-attribution TODO so unverified columns are visible to readers", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixAttributionValidation } = await import(
      "@/lib/globalcomix-queries"
    );
    await queryGlobalComixAttributionValidation("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("TODO(open-q-attribution)");
  });
});

// ── WS5 — ANALYST_QUERY_IDS registrations ──────────────────────────────────
describe("WS5 ANALYST_QUERY_IDS registrations", () => {
  it("registers weekends / geo / creatives / attribution-validation", async () => {
    const { ANALYST_QUERY_IDS } = await import("@/lib/analyst/types");
    expect(ANALYST_QUERY_IDS.WEEKENDS).toBe("weekends");
    expect(ANALYST_QUERY_IDS.GEO).toBe("geo");
    expect(ANALYST_QUERY_IDS.CREATIVES).toBe("creatives");
    expect(ANALYST_QUERY_IDS.ATTRIBUTION_VALIDATION).toBe("attribution-validation");
  });
});

// ── WS6 — buildSpendSubquery OS / platform predicates ─────────────────────
describe("buildSpendSubquery: OS predicate per source.osStrategy", () => {
  it("os='total' emits no OS predicate on any leg", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // No `LOWER(os) = ...` and no REGEXP_CONTAINS over campaign_name for OS.
    expect(query).not.toMatch(/LOWER\(os\)\s*=/);
    expect(query).not.toMatch(/REGEXP_CONTAINS\(LOWER\(campaign_name\)/);
  });

  it("os='ios' emits LOWER(os)='ios' on column-strategy sources (Meta, AppLovin)", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO, { os: "ios" });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/LOWER\(os\)\s*=\s*'ios'/);
  });

  it("os='ios' emits REGEXP_CONTAINS on campaign_name for the campaign_name-strategy sources (Google, TikTok)", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO, { os: "ios" });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // The classifier predicate uses (^|[_-])ios([_-]|$).
    expect(query).toMatch(
      /REGEXP_CONTAINS\(LOWER\(campaign_name\), r'\(\^\|\[_-\]\)ios\(\[_-\]\|\$\)'\)/,
    );
  });

  it("os='android' zeros the implicit_ios Apple leg via WHERE FALSE", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO, { os: "android" });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // The Apple leg's WHERE should contain AND FALSE so it contributes 0 rows.
    // Pattern: dwh_apple_globalcomix_adjust + breakdown filter + AND FALSE
    expect(query).toMatch(
      /dwh_apple_globalcomix_adjust[\s\S]*?WHERE \(breakdown_type = 'No Breakdown'\) AND FALSE/,
    );
  });

  it("platforms filter drops legs whose network slug isn't in the set", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO, { platforms: ["meta"] });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("dwh_fb2_globalcomix_adjust");
    expect(query).not.toContain("dwh_google_ads_globalcomix_adjust");
    expect(query).not.toContain("dwh_tik_tok_globalcomix_adjust");
    expect(query).not.toContain("dwh_apple_globalcomix_adjust");
    expect(query).not.toContain("dwh_applovin_globalcomix_adjust");
  });

  it("cohort side gains LOWER(_OS_name) when OS != total", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO, { os: "android" });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/LOWER\(_OS_name\)\s*=\s*'android'/);
  });

  it("cohort side filters attribution strings when platforms is non-empty", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryGlobalComixKPIs } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixKPIs("globalcomix", FROM, TO, {
      platforms: ["meta", "google"],
    });
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // The cohort WHERE picks up the meta + google attribution predicates.
    // Both strings already appear in the CASE block above, so the assertion
    // pins the predicate's UNION form via the OR concatenation the
    // cohortAttributionPredicate emits.
    expect(query).toMatch(
      /_Network_Attribution IN \('Facebook Installs', 'Instagram Installs', 'Off-Facebook Installs'\) OR _Network_Attribution LIKE 'Google Ads%'/,
    );
  });
});

// ── WS6 — Cache key continuity for the default filter ─────────────────────
describe("Cache-key continuity at the default filter state", () => {
  it("(os=total, platforms=[]) yields the same paramHash as the pre-WS6 call", async () => {
    const mod = await import("@/lib/globalcomix-queries");
    queryFn.mockResolvedValue([[]]);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO);
    const noFilterHash = paramHash(cacheCalls[0].params);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO, {
      os: "total",
      platforms: [],
    });
    const explicitDefaultHash = paramHash(cacheCalls[0].params);

    expect(explicitDefaultHash).toBe(noFilterHash);
  });

  it("non-default filters produce a different cache key", async () => {
    const mod = await import("@/lib/globalcomix-queries");
    queryFn.mockResolvedValue([[]]);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO);
    const defaultHash = paramHash(cacheCalls[0].params);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO, {
      os: "ios",
    });
    const iosHash = paramHash(cacheCalls[0].params);
    expect(iosHash).not.toBe(defaultHash);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO, {
      platforms: ["meta"],
    });
    const metaHash = paramHash(cacheCalls[0].params);
    expect(metaHash).not.toBe(defaultHash);
    expect(metaHash).not.toBe(iosHash);
  });

  it("canonicalizes platform order so the cache key is identical regardless of input order", async () => {
    const mod = await import("@/lib/globalcomix-queries");
    queryFn.mockResolvedValue([[]]);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO, {
      platforms: ["meta", "google"],
    });
    const aHash = paramHash(cacheCalls[0].params);

    cacheCalls.length = 0;
    await mod.queryGlobalComixKPIs("globalcomix", FROM, TO, {
      platforms: ["google", "meta"],
    });
    const bHash = paramHash(cacheCalls[0].params);

    expect(aHash).toBe(bHash);
  });
});
