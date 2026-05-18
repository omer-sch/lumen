// Layer 2 (backend lib unit). File under test: src/lib/globalcomix-subs-queries.ts.
//
// The subs module reads `dwh_total_subs_globalcomix` for the dashboard's
// Lifecycle frame. These tests pin the SQL shape (future-date guard, OS
// predicate, per-day grouping, sub_type pivot) and the cache contract
// without ever hitting BigQuery.

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

type CacheCall = {
  client: string;
  query: string;
  params: unknown;
  ttlSeconds: number;
};
const cacheCalls: CacheCall[] = [];

vi.mock("@/lib/cache/with-redis-cache", () => ({
  withRedisCache: async <T>(opts: CacheCall, loader: () => Promise<T>) => {
    cacheCalls.push(opts);
    return loader();
  },
}));

beforeEach(() => {
  queryFn.mockReset();
  cacheCalls.length = 0;
  vi.stubEnv("BQ_PROJECT", "test-project");
  vi.stubEnv("BQ_DATASET", "test_dataset");
  vi.stubEnv("ALLOWED_CLIENTS", "globalcomix");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const FROM = "2026-04-15";
const TO = "2026-05-14";

describe("queryGlobalComixSubsDaily", () => {
  it("emits a sub_type pivot with net_sub derived in the SELECT", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixSubsDaily } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixSubsDaily("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toContain("'subscribe'");
    expect(query).toContain("'unsubscribe'");
    expect(query).toMatch(/AS subs/);
    expect(query).toMatch(/AS churn/);
    expect(query).toMatch(/AS net_sub/);
    expect(query).toMatch(/GROUP BY event_date, os/);
  });

  it("filters future-dated rows with event_date <= CURRENT_DATE()", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixSubsDaily } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixSubsDaily("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    // Guard against the warehouse's future-dated rows (up to 2027-03-17).
    expect(query).toMatch(/event_date\s*<=\s*CURRENT_DATE\(\)/);
  });

  it("applies an OS predicate only when os !== 'total'", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixSubsDaily } = await import(
      "@/lib/globalcomix-subs-queries"
    );

    await queryGlobalComixSubsDaily("globalcomix", FROM, TO, "total");
    const totalQuery = (queryFn.mock.calls[0][0] as { query: string }).query;
    expect(totalQuery).not.toMatch(/LOWER\(os\)\s*=/);

    queryFn.mockReset();
    queryFn.mockResolvedValue([[]]);
    await queryGlobalComixSubsDaily("globalcomix", FROM, TO, "ios");
    const iosQuery = (queryFn.mock.calls[0][0] as { query: string }).query;
    expect(iosQuery).toMatch(/LOWER\(os\)\s*=\s*'ios'/);

    queryFn.mockReset();
    queryFn.mockResolvedValue([[]]);
    await queryGlobalComixSubsDaily("globalcomix", FROM, TO, "web");
    const webQuery = (queryFn.mock.calls[0][0] as { query: string }).query;
    expect(webQuery).toMatch(/LOWER\(os\)\s*=\s*'web'/);
  });

  it("coerces nullish counts to 0 in the JS row mapper", async () => {
    queryFn.mockResolvedValue([
      [
        { date: "2026-05-01", os: "iOS", subs: 12, churn: null, net_sub: 12 },
        { date: "2026-05-01", os: "Android", subs: "5", churn: "1", net_sub: 4 },
      ],
    ]);
    const { queryGlobalComixSubsDaily } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    const rows = await queryGlobalComixSubsDaily("globalcomix", FROM, TO);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: "2026-05-01",
      os: "iOS",
      subs: 12,
      churn: 0,
      netSub: 12,
    });
    expect(rows[1]).toEqual({
      date: "2026-05-01",
      os: "Android",
      subs: 5,
      churn: 1,
      netSub: 4,
    });
  });
});

describe("queryGlobalComixSubsOsMix", () => {
  it("filters to sub_type='subscribe' and computes per-os share", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixSubsOsMix } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixSubsOsMix("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/sub_type\s*=\s*'subscribe'/);
    expect(query).toMatch(/SAFE_DIVIDE\(p\.subs, NULLIF\(t\.total, 0\)\) AS share/);
    expect(query).toMatch(/GROUP BY os/);
  });

  it("never applies the OS predicate (lifecycle ignores the dashboard OS filter)", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixSubsOsMix } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixSubsOsMix("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).not.toMatch(/LOWER\(os\)\s*=/);
  });

  it("future-date guard applies here too", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixSubsOsMix } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixSubsOsMix("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/event_date\s*<=\s*CURRENT_DATE\(\)/);
  });
});

describe("queryGlobalComixNetSubTrend", () => {
  it("emits one row per day with derived net_sub", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixNetSubTrend } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixNetSubTrend("globalcomix", FROM, TO);
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/GROUP BY event_date/);
    expect(query).toMatch(/AS net_sub/);
    expect(query).toMatch(/ORDER BY event_date/);
  });

  it("respects the OS filter when set", async () => {
    queryFn.mockResolvedValue([[]]);
    const { queryGlobalComixNetSubTrend } = await import(
      "@/lib/globalcomix-subs-queries"
    );
    await queryGlobalComixNetSubTrend("globalcomix", FROM, TO, "android");
    const { query } = queryFn.mock.calls[0][0] as { query: string };
    expect(query).toMatch(/LOWER\(os\)\s*=\s*'android'/);
  });
});

describe("subs queries cache-wrapping contract", () => {
  it("each export hands withRedisCache the registered query id and a 12h TTL", async () => {
    const TWELVE_HOURS = 60 * 60 * 12;
    const mod = await import("@/lib/globalcomix-subs-queries");
    queryFn.mockResolvedValue([[]]);
    await mod.queryGlobalComixSubsDaily("globalcomix", FROM, TO, "ios");
    await mod.queryGlobalComixSubsOsMix("globalcomix", FROM, TO);
    await mod.queryGlobalComixNetSubTrend("globalcomix", FROM, TO, "total");

    const byQuery = Object.fromEntries(cacheCalls.map((c) => [c.query, c]));
    for (const name of [
      "total-subs-daily",
      "total-subs-os-mix",
      "net-sub-trend",
    ] as const) {
      const call = byQuery[name];
      expect(call, name).toBeDefined();
      expect(call.client).toBe("globalcomix");
      expect(call.ttlSeconds).toBe(TWELVE_HOURS);
    }

    // Daily and trend keys include the OS in their params so different
    // OS filters land on different Redis keys.
    expect(byQuery["total-subs-daily"].params).toMatchObject({ os: "ios" });
    expect(byQuery["net-sub-trend"].params).toMatchObject({ os: "total" });
  });
});

describe("ANALYST_QUERY_IDS registration", () => {
  it("registers the three subs query ids so Hermes / Smart Reports can cite them", async () => {
    const { ANALYST_QUERY_IDS } = await import("@/lib/analyst/types");
    expect(ANALYST_QUERY_IDS.TOTAL_SUBS_DAILY).toBe("total-subs-daily");
    expect(ANALYST_QUERY_IDS.TOTAL_SUBS_OS_MIX).toBe("total-subs-os-mix");
    expect(ANALYST_QUERY_IDS.NET_SUB_TREND).toBe("net-sub-trend");
  });
});
