// Integration test: API route → bq-queries dispatcher → globalcomix-queries
// wrapper → withRedisCache → fake Redis. The only mocked seams are the two
// outer-edge resources we shouldn't actually touch from a unit run: Redis
// (an in-memory fake that records every GET/SET) and BigQuery (counts loader
// invocations and returns deterministic rows).
//
// What this guards against:
//   1. A future refactor that unwraps a query export — the second call would
//      become a second BQ call and this test fails.
//   2. A future refactor that swaps the dispatcher to bypass globalcomix-
//      queries — same failure mode, the wrap never runs.
//   3. Subtle key-shape changes — e.g. swapping `params: {from, to}` for an
//      array changes the paramHash, breaking warmer/dashboard convergence.
//      The hit-on-second-call assertion would still pass, but the Redis
//      key assertion (single key written for one query) would catch the
//      surrounding regression class.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../api/_lib/route-test-utils";

// ── Fake BigQuery ──────────────────────────────────────────────────────────
// Records every `bq.query()` call. Returns a single deterministic row that
// satisfies the KPI / trend SELECT shape — the lib coerces missing fields
// to 0, so a minimal row is enough.
const bqQuery = vi.fn();
vi.mock("@google-cloud/bigquery", () => {
  class BigQuery {
    query(opts: unknown) {
      return bqQuery(opts);
    }
  }
  return { BigQuery };
});

// ── Fake Redis ─────────────────────────────────────────────────────────────
// In-memory map with a tiny GET/SET/scan/unlink surface — enough for
// withRedisCache and the invalidator. Records counts for assertions.
type FakeRedisCounters = {
  gets: number;
  sets: number;
  hits: number;
  misses: number;
};
const counters: FakeRedisCounters = { gets: 0, sets: 0, hits: 0, misses: 0 };
const store = new Map<string, string>();

const fakeRedis = {
  async get<T>(key: string): Promise<T | null> {
    counters.gets += 1;
    const raw = store.get(key);
    if (raw == null) {
      counters.misses += 1;
      return null;
    }
    counters.hits += 1;
    // Mirror @upstash/redis behavior: it auto-parses JSON values. The
    // wrapper's decoder tolerates either string or parsed input.
    return JSON.parse(raw) as T;
  },
  async set(key: string, value: string, _opts?: { ex?: number }): Promise<"OK"> {
    counters.sets += 1;
    store.set(key, value);
    return "OK";
  },
  async scan(
    _cursor: string | number,
    opts: { match: string; count?: number },
  ): Promise<[string | number, string[]]> {
    // Glob-to-regex: escape regex specials FIRST (the escape set excludes
    // `*` on purpose), THEN turn the literal `*` into `.*`. Doing it in
    // the reverse order would escape the dot we just inserted, leaving a
    // pattern that only matches literal dots.
    const escaped = opts.match.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    const matched = [...store.keys()].filter((k) => pattern.test(k));
    return [0, matched];
  },
  async unlink(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (store.delete(k)) n += 1;
    return n;
  },
};

vi.mock("@/lib/cache/redis", () => ({
  redis: fakeRedis,
  cacheEnabled: () => true,
}));

beforeEach(() => {
  // Reset the runtime between tests, but keep the module graph hot —
  // resetModules forces every route + lib import to re-evaluate so the
  // freshly-stubbed env propagates into the BigQuery client builder.
  vi.resetModules();
  bqQuery.mockReset();
  store.clear();
  counters.gets = 0;
  counters.sets = 0;
  counters.hits = 0;
  counters.misses = 0;
  vi.stubEnv("BQ_PROJECT", "test-project");
  vi.stubEnv("BQ_DATASET", "test_dataset");
  vi.stubEnv("ALLOWED_CLIENTS", "globalcomix");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("integration: /api/bq/dashboard-kpis → cache → loader", () => {
  it("first call misses cache + runs BQ once + writes the result", async () => {
    bqQuery.mockResolvedValue([
      [{ spend: 100_000, installs: 50_000, cpi: 2.0, roas: 1.5 }],
    ]);

    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const res = await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );

    await expectJson<Record<string, number>>(res, 200);
    expect(bqQuery).toHaveBeenCalledTimes(1);
    expect(counters.misses).toBe(1);
    expect(counters.sets).toBe(1);
    // Exactly one key under the globalcomix kpis prefix; canonical shape.
    const keys = [...store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(
      /^lumen:cache:v1:globalcomix:kpis:[0-9a-f]{12}$/,
    );
  });

  it("second call with the same params reuses the cache (no second BQ call)", async () => {
    bqQuery.mockResolvedValue([
      [{ spend: 100_000, installs: 50_000, cpi: 2.0, roas: 1.5 }],
    ]);

    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const url =
      "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14";

    const r1 = await GET(buildRequest(url));
    const b1 = await expectJson<Record<string, number>>(r1, 200);
    const r2 = await GET(buildRequest(url));
    const b2 = await expectJson<Record<string, number>>(r2, 200);

    expect(b2).toEqual(b1);
    expect(bqQuery).toHaveBeenCalledTimes(1);
    // Two GETs, one miss + one hit. One SET on the miss.
    expect(counters.gets).toBe(2);
    expect(counters.misses).toBe(1);
    expect(counters.hits).toBe(1);
    expect(counters.sets).toBe(1);
  });

  it("different date windows produce different keys (and both miss the first time)", async () => {
    bqQuery.mockResolvedValue([
      [{ spend: 100_000, installs: 50_000, cpi: 2.0, roas: 1.5 }],
    ]);

    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );
    await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-01&to=2026-04-30",
      ),
    );

    expect(bqQuery).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(2);
    // Both keys live under the same client/query prefix; only the hash
    // segment differs, proving paramHash is what fans them out.
    const keys = [...store.keys()].sort();
    expect(keys[0].startsWith("lumen:cache:v1:globalcomix:kpis:")).toBe(true);
    expect(keys[1].startsWith("lumen:cache:v1:globalcomix:kpis:")).toBe(true);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe("integration: cache-stats counter increments on real route traffic", () => {
  it("records hit + miss events that the admin stats route would surface", async () => {
    bqQuery.mockResolvedValue([
      [{ spend: 100_000, installs: 50_000, cpi: 2.0, roas: 1.5 }],
    ]);
    const { GET: kpisGET } = await import("@/app/api/bq/dashboard-kpis/route");
    const url =
      "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14";
    // First call: miss. Second: hit.
    await kpisGET(buildRequest(url));
    await kpisGET(buildRequest(url));

    const { readCacheStats } = await import("@/lib/cache/stats");
    const stats = readCacheStats();
    // The counter is process-global; we can't assert exact totals across
    // a shared test run, but the deltas after two same-window calls are
    // deterministic for this query name.
    expect(stats.counters.miss.kpis).toBeGreaterThanOrEqual(1);
    expect(stats.counters.hit.kpis).toBeGreaterThanOrEqual(1);
  });
});

describe("integration: multi-query shared paramHash on the same window", () => {
  it("KPIs and Trend produce keys with the SAME paramHash segment", async () => {
    bqQuery.mockResolvedValue([[]]);

    const { GET: kpisGET } = await import("@/app/api/bq/dashboard-kpis/route");
    const { GET: trendGET } = await import("@/app/api/bq/trend/route");
    const qs = "client=globalcomix&from=2026-04-15&to=2026-05-14";
    await kpisGET(buildRequest(`/api/bq/dashboard-kpis?${qs}`));
    await trendGET(buildRequest(`/api/bq/trend?${qs}`));

    const keys = [...store.keys()];
    expect(keys).toHaveLength(2);
    const kpisKey = keys.find((k) => k.includes(":kpis:"));
    const trendKey = keys.find((k) => k.includes(":trend:"));
    expect(kpisKey).toBeDefined();
    expect(trendKey).toBeDefined();
    // Last segment = paramHash. Same window → same hash across queries.
    const kpisHash = kpisKey!.split(":").pop();
    const trendHash = trendKey!.split(":").pop();
    expect(kpisHash).toBe(trendHash);
  });
});

describe("integration: invalidate then re-warm round-trip", () => {
  it("clearing the client's keys forces the next call to re-query BQ", async () => {
    bqQuery.mockResolvedValue([
      [{ spend: 100_000, installs: 50_000, cpi: 2.0, roas: 1.5 }],
    ]);
    const { GET: kpisGET } = await import("@/app/api/bq/dashboard-kpis/route");
    const url =
      "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14";

    // Populate.
    await kpisGET(buildRequest(url));
    expect(bqQuery).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    // Invalidate.
    const { invalidateClientCache } = await import("@/lib/cache/invalidate");
    const removed = await invalidateClientCache("globalcomix");
    expect(removed).toBe(1);
    expect(store.size).toBe(0);

    // Next call must hit BQ again.
    await kpisGET(buildRequest(url));
    expect(bqQuery).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(1);
  });
});
