// Layer 2 (lib-unit). File under test: src/lib/cache/stats.ts.
//
// Lightweight in-process counter. The interesting behavior is the
// per-query bucketing and the totals roll-up. Reset between tests so
// the singleton doesn't leak counts across cases.
import { beforeEach, describe, expect, it } from "vitest";

import { readCacheStats, recordCacheEvent, resetCacheStatsForTests } from "@/lib/cache/stats";

beforeEach(() => {
  resetCacheStatsForTests();
});

describe("cache stats counter", () => {
  it("buckets events by kind and query", () => {
    recordCacheEvent("hit", "kpis");
    recordCacheEvent("hit", "kpis");
    recordCacheEvent("miss", "kpis");
    recordCacheEvent("hit", "trend");

    const stats = readCacheStats();
    expect(stats.counters.hit).toEqual({ kpis: 2, trend: 1 });
    expect(stats.counters.miss).toEqual({ kpis: 1 });
  });

  it("rolls up totals across queries", () => {
    recordCacheEvent("hit", "kpis");
    recordCacheEvent("hit", "trend");
    recordCacheEvent("miss", "campaigns");
    recordCacheEvent("error", "trend");
    recordCacheEvent("bypass", "kpis");

    const stats = readCacheStats();
    expect(stats.totals).toEqual({ hit: 2, miss: 1, error: 1, bypass: 1 });
  });

  it("starts at zero after reset", () => {
    recordCacheEvent("hit", "kpis");
    resetCacheStatsForTests();
    const stats = readCacheStats();
    expect(stats.totals).toEqual({ hit: 0, miss: 0, error: 0, bypass: 0 });
  });

  it("exposes a lastUpdated ISO timestamp", () => {
    recordCacheEvent("hit", "kpis");
    const stats = readCacheStats();
    expect(typeof stats.lastUpdated).toBe("string");
    expect(Number.isFinite(Date.parse(stats.lastUpdated))).toBe(true);
  });
});
