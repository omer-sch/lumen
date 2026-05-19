// Layer 2 (backend lib unit). File under test: src/lib/bq-queries.ts. Priority: P0.
// The generated SQL is the contract between Lumen and BigQuery. These tests
// snapshot the shape of each query and verify the date guard fires before any
// query is dispatched. We do NOT execute SQL against BQ.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pass-through unstable_cache: invokes the inner function directly so we can
// inspect the captured query without dealing with Next's cache layer.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

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

describe("bq-queries: date guard", () => {
  it.each([
    "not-a-date",
    "2026/01/01",
    "2026-1-1",
    "20260101",
    "'; DROP TABLE--",
    "",
  ])("rejects %s before any SQL is sent", async (badDate) => {
    queryFn.mockResolvedValue([[]]);
    const { queryDashboardKPIs, InvalidDateError } = await import(
      "@/lib/bq-queries"
    );
    await expect(
      queryDashboardKPIs("globalcomix", badDate, "2026-05-12"),
    ).rejects.toThrow(InvalidDateError);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("InvalidDateError carries the bad value in the message", async () => {
    const { queryTrend, InvalidDateError } = await import("@/lib/bq-queries");
    try {
      await queryTrend("globalcomix", "bogus", "2026-05-12");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidDateError);
      expect((err as Error).message).toContain("bogus");
    }
  });
});

describe("bq-queries: queryCampaignProfile dispatch", () => {
  it("returns an empty profile shape for gaming-vocab clients (playw3) without hitting BQ", async () => {
    const { queryCampaignProfile } = await import("@/lib/bq-queries");
    const data = await queryCampaignProfile(
      "playw3",
      "abc-123",
      "2026-05-01",
      "2026-05-14",
    );
    expect(data).toEqual({
      summary: null,
      trend: [],
      adsets: [],
      creatives: [],
      geo: [],
    });
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("rejects an invalid `from` date before any SQL is sent", async () => {
    const { queryCampaignProfile, InvalidDateError } = await import(
      "@/lib/bq-queries"
    );
    await expect(
      queryCampaignProfile("playw3", "abc-123", "not-a-date", "2026-05-14"),
    ).rejects.toBeInstanceOf(InvalidDateError);
    expect(queryFn).not.toHaveBeenCalled();
  });
});

describe("bq-queries: client allowlist", () => {
  it("rejects an unknown client before any SQL is sent", async () => {
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    await expect(
      queryDashboardKPIs("evil_client", "2026-05-01", "2026-05-12"),
    ).rejects.toThrow(/not permitted|forbidden/i);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("rejects 100play on the agent-layer path (no agent view)", async () => {
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    await expect(
      queryDashboardKPIs("100play", "2026-05-01", "2026-05-12"),
    ).rejects.toThrow();
    expect(queryFn).not.toHaveBeenCalled();
  });
});

describe("bq-queries: SQL shape (queryDashboardKPIs)", () => {
  it("builds the GlobalComix KPI query as a UNION of the four dwh_*_adjust tables with No Breakdown dedupe and cohort-side D7 revenue", async () => {
    queryFn.mockResolvedValue([
      [{ spend: 1, installs: 2, cpi: 0.5, roas: 1.1 }],
    ]);
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    await queryDashboardKPIs("globalcomix", "2026-05-01", "2026-05-12");
    expect(queryFn).toHaveBeenCalledTimes(1);
    const opts = queryFn.mock.calls[0][0] as { query: string; params: object };
    // All five per-network warehouse tables are present in the UNION
    expect(opts.query).toContain("dwh_fb2_globalcomix_adjust");
    expect(opts.query).toContain("dwh_google_ads_globalcomix_adjust");
    expect(opts.query).toContain("dwh_tik_tok_globalcomix_adjust");
    expect(opts.query).toContain("dwh_apple_globalcomix_adjust");
    expect(opts.query).toContain("dwh_applovin_globalcomix_adjust");
    // No legacy agent view
    expect(opts.query).not.toContain("v_agent_globalcomix");
    // Spend aggregation reads from cost_usd
    expect(opts.query).toContain("SUM(cost_usd)");
    // Breakdown dedupe collapses the 3x fan-out
    expect(opts.query).toContain("breakdown_type = 'No Breakdown'");
    // Cohort table is joined for D7 ROAS revenue
    expect(opts.query).toContain("uni_adjust_cohort_report_globalcomix");
    expect(opts.query).toContain("_7D_Revenue_Total");
    // Google iOS attribution-gap exclusion
    expect(opts.query).toContain("_OS_name = 'ios'");
    expect(opts.params).toEqual({ from: "2026-05-01", to: "2026-05-12" });
  });

  it("builds the Playw3 KPI query with spend_usd, revenue_usd, and the No Breakdown dedupe", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    await queryDashboardKPIs("playw3", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("SUM(spend_usd)");
    expect(opts.query).toContain("SUM(revenue_usd)");
    expect(opts.query).toContain("`test-project.test_dataset.v_playw3_agent`");
    expect(opts.query).toContain("breakdown_type = 'No Breakdown'");
  });

  it("uses parameterized @from / @to placeholders, never inline strings", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    await queryDashboardKPIs("globalcomix", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("@from");
    expect(opts.query).toContain("@to");
    expect(opts.query).not.toContain("'2026-05-01'");
    expect(opts.query).not.toContain('"2026-05-12"');
  });
});

describe("bq-queries: numeric coercion (queryDashboardKPIs)", () => {
  it("treats nullish numerics as 0 for totals; preserves null on deltas", async () => {
    queryFn.mockResolvedValue([
      [
        {
          spend: null,
          installs: undefined,
          cpi: NaN,
          roas: "1.42",
          spend_delta: null,
          installs_delta: 0.05,
          cpi_delta: NaN,
          roas_delta: -0.1,
        },
      ],
    ]);
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    const result = await queryDashboardKPIs(
      "globalcomix",
      "2026-05-01",
      "2026-05-12",
    );
    expect(result.spend).toBe(0);
    expect(result.installs).toBe(0);
    expect(result.cpi).toBe(0);
    expect(result.roas).toBeCloseTo(1.42);
    expect(result.spendDelta).toBeNull();
    expect(result.installsDelta).toBeCloseTo(0.05);
    expect(result.cpiDelta).toBeNull();
    expect(result.roasDelta).toBeCloseTo(-0.1);
  });

  it("coerces BigQueryInt-style objects via toNumber()", async () => {
    queryFn.mockResolvedValue([
      [
        {
          spend: { toNumber: () => 12345 },
          installs: { value: "67" },
          cpi: 1.23,
          roas: 1.5,
        },
      ],
    ]);
    const { queryDashboardKPIs } = await import("@/lib/bq-queries");
    const result = await queryDashboardKPIs(
      "globalcomix",
      "2026-05-01",
      "2026-05-12",
    );
    expect(result.spend).toBe(12345);
    expect(result.installs).toBe(67);
  });
});

describe("bq-queries: queryTrend / queryChannelMix / queryCampaigns", () => {
  it("queryTrend orders ascending by date (Playw3 agent path)", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryTrend } = await import("@/lib/bq-queries");
    await queryTrend("playw3", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("GROUP BY 1");
    expect(opts.query).toMatch(/ORDER BY 1 ASC/);
  });

  it("queryTrend on globalcomix groups by date and orders ascending across the UNION", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryTrend } = await import("@/lib/bq-queries");
    await queryTrend("globalcomix", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    // Multi-source trend groups by date in a CTE and joins cohort revenue
    expect(opts.query).toContain("GROUP BY date");
    expect(opts.query).toMatch(/ORDER BY date ASC/);
    // Cohort revenue is joined per day for daily ROAS
    expect(opts.query).toContain("uni_adjust_cohort_report_globalcomix");
  });

  it("queryChannelMix on Playw3 joins against a totals CTE and orders by spend desc", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryChannelMix } = await import("@/lib/bq-queries");
    await queryChannelMix("playw3", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("WITH totals AS");
    expect(opts.query).toContain("ORDER BY spend DESC");
  });

  it("queryChannelMix on globalcomix groups the UNION by network and orders by spend desc", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryChannelMix } = await import("@/lib/bq-queries");
    await queryChannelMix("globalcomix", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("GROUP BY network");
    expect(opts.query).toContain("ORDER BY p.spend DESC");
  });

  it("queryChannelMix normalizes Playw3 network labels: facebook -> Meta, x -> Twitter", async () => {
    queryFn.mockResolvedValue([
      [
        { network: "facebook", spend: 10, share: 0.5 },
        { network: "x", spend: 5, share: 0.25 },
      ],
    ]);
    const { queryChannelMix } = await import("@/lib/bq-queries");
    const out = await queryChannelMix("playw3", "2026-05-01", "2026-05-12");
    expect(out.map((r) => r.network)).toEqual(["Meta", "Twitter"]);
  });

  it("queryCampaigns caps at 100 rows and orders by current-period spend desc (globalcomix multi-source)", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryCampaigns } = await import("@/lib/bq-queries");
    await queryCampaigns("globalcomix", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("LIMIT 100");
    expect(opts.query).toContain("ORDER BY c.spend DESC");
  });
});

describe("bq-queries: queryFreshness", () => {
  // Helper — when client is "globalcomix", queryFreshness runs the
  // freshness SQL *and* the dataAsOf SQL in parallel. Both go through the
  // mocked queryFn. Pick the freshness call by content.
  function freshnessCall(): { query: string } {
    const call = queryFn.mock.calls.find((c) => {
      const opts = c[0] as { query: string };
      return opts.query.includes("__TABLES__");
    });
    if (!call) throw new Error("no __TABLES__ query was dispatched");
    return call[0] as { query: string };
  }

  it("queries __TABLES__.last_modified_time across the client's spend tables", async () => {
    queryFn.mockResolvedValue([
      [{ last_updated: { value: "2026-05-19T07:03:45.000Z" } }],
    ]);
    const { queryFreshness } = await import("@/lib/bq-queries");
    await queryFreshness("globalcomix");
    const opts = freshnessCall();
    // Real BQ metadata table, not the lagging Rivery view.
    expect(opts.query).toContain("__TABLES__");
    expect(opts.query).toContain("last_modified_time");
    // All five GlobalComix spend tables must be in the IN-list, otherwise
    // a single laggy network would not be detected.
    expect(opts.query).toContain("dwh_fb2_globalcomix_adjust");
    expect(opts.query).toContain("dwh_google_ads_globalcomix_adjust");
    expect(opts.query).toContain("dwh_tik_tok_globalcomix_adjust");
    expect(opts.query).toContain("dwh_apple_globalcomix_adjust");
    expect(opts.query).toContain("dwh_applovin_globalcomix_adjust");
    // No anchor-at-midnight DATE math anywhere in the freshness query.
    expect(opts.query).not.toContain("T00:00:00Z");
    expect(opts.query).not.toContain("rivery_activity_anlytics");
  });

  it("computes hoursAgo from the real timestamp, not midnight-UTC of a DATE", async () => {
    // Freeze time so the math is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T11:03:45.000Z"));
    // No client → only the freshness query fires (dataAsOf is skipped).
    queryFn.mockResolvedValue([
      // Table was written 4 hours before "now".
      [{ last_updated: { value: "2026-05-19T07:03:45.000Z" } }],
    ]);
    const { queryFreshness } = await import("@/lib/bq-queries");
    const out = await queryFreshness();
    expect(out.hoursAgo).toBe(4);
    expect(out.lastUpdated).toBe("2026-05-19T07:03:45.000Z");
    vi.useRealTimers();
  });

  it("falls back to globalcomix spend tables when no client is passed", async () => {
    queryFn.mockResolvedValue([
      [{ last_updated: { value: "2026-05-19T07:03:45.000Z" } }],
    ]);
    const { queryFreshness } = await import("@/lib/bq-queries");
    await queryFreshness();
    const opts = freshnessCall();
    expect(opts.query).toContain("dwh_fb2_globalcomix_adjust");
  });

  it("returns hoursAgo: -1 when BQ throws (graceful degrade)", async () => {
    queryFn.mockRejectedValue(new Error("BQ permission denied for table xyz"));
    const { queryFreshness } = await import("@/lib/bq-queries");
    const out = await queryFreshness();
    expect(out.hoursAgo).toBe(-1);
    expect(typeof out.lastUpdated).toBe("string");
  });

  it("returns hoursAgo: -1 when BQ returns a malformed timestamp", async () => {
    queryFn.mockResolvedValue([[{ last_updated: { value: "not-a-date" } }]]);
    const { queryFreshness } = await import("@/lib/bq-queries");
    const out = await queryFreshness();
    expect(out.hoursAgo).toBe(-1);
    expect(typeof out.lastUpdated).toBe("string");
  });

  it("returns hoursAgo: -1 when BQ returns a null timestamp", async () => {
    queryFn.mockResolvedValue([[{ last_updated: null }]]);
    const { queryFreshness } = await import("@/lib/bq-queries");
    const out = await queryFreshness();
    expect(out.hoursAgo).toBe(-1);
  });
});

describe("bq-queries: toBounds coercion", () => {
  it("passes through string YYYY-MM-DD values", async () => {
    const { toBounds } = await import("@/lib/bq-queries");
    expect(
      toBounds({ earliest: "2024-01-01", latest: "2026-05-12" }),
    ).toEqual({ earliest: "2024-01-01", latest: "2026-05-12" });
  });

  it("unwraps BQ DATE { value: 'YYYY-MM-DD' } shape", async () => {
    const { toBounds } = await import("@/lib/bq-queries");
    expect(
      toBounds({
        earliest: { value: "2024-01-01" },
        latest: { value: "2026-05-12" },
      }),
    ).toEqual({ earliest: "2024-01-01", latest: "2026-05-12" });
  });

  it("returns null for missing / wrong-shape values", async () => {
    const { toBounds } = await import("@/lib/bq-queries");
    expect(toBounds(undefined)).toEqual({ earliest: null, latest: null });
    expect(toBounds({})).toEqual({ earliest: null, latest: null });
    expect(toBounds({ earliest: 123, latest: true })).toEqual({
      earliest: null,
      latest: null,
    });
  });
});
