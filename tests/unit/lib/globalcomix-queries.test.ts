// Layer 2 (backend lib unit). File under test: src/lib/globalcomix-queries.ts.
// Priority: P0.
// GlobalComix is the multi-source path: spend is UNION'd across four per-
// network dwh_* tables and revenue comes from the cohort table. These tests
// pin the SQL shape (UNION leg presence, dedupe predicate, cohort join,
// Google iOS exclusion, parameter binding) without ever hitting BigQuery.
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

beforeEach(() => {
  queryFn.mockReset();
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
  it("queryGlobalComixTrend groups by date and orders ascending", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixTrend } = await import("@/lib/globalcomix-queries");
    await queryGlobalComixTrend("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("GROUP BY date");
    expect(query).toMatch(/ORDER BY date ASC/);
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
