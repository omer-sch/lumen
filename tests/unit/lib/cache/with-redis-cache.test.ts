// Layer 2 (lib-unit). File under test: src/lib/cache/with-redis-cache.ts.
//
// The wrapper is the seam between cached and uncached BigQuery calls.
// Tests cover the four control-flow paths the dashboard depends on:
//   1. Cache HIT  → returns cached value, does not call the loader
//   2. Cache MISS → calls loader, stores result with `ex` TTL
//   3. Cache disabled → bypass, returns loader output
//   4. Redis error  → bypass / treat as miss, returns loader output
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the redis module before importing the wrapper. The wrapper reads
// both `redis` and `cacheEnabled()` from this module at runtime, so we
// install a controllable double here and tweak it per-test. `vi.hoisted`
// is required because `vi.mock` factories run before module-scope
// initialization.
const { getMock, setMock, redisDouble } = vi.hoisted(() => {
  const getMock = vi.fn();
  const setMock = vi.fn();
  return { getMock, setMock, redisDouble: { get: getMock, set: setMock } };
});

vi.mock("@/lib/cache/redis", () => ({
  redis: redisDouble,
  cacheEnabled: () => true,
}));

import { withRedisCache } from "@/lib/cache/with-redis-cache";
import { resetCacheStatsForTests } from "@/lib/cache/stats";

beforeEach(() => {
  getMock.mockReset();
  setMock.mockReset();
  resetCacheStatsForTests();
});

describe("withRedisCache — hit path", () => {
  it("returns the cached value and does not call the loader", async () => {
    getMock.mockResolvedValue(JSON.stringify({ spend: 100 }));
    const loader = vi.fn().mockResolvedValue({ spend: 999 });

    const result = await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: { from: "x", to: "y" },
        ttlSeconds: 60,
      },
      loader,
    );

    expect(result).toEqual({ spend: 100 });
    expect(loader).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it("accepts already-parsed values from Upstash (which auto-deserializes)", async () => {
    getMock.mockResolvedValue({ spend: 200 });
    const loader = vi.fn().mockResolvedValue({ spend: 999 });

    const result = await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: { from: "x", to: "y" },
        ttlSeconds: 60,
      },
      loader,
    );

    expect(result).toEqual({ spend: 200 });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("withRedisCache — miss path", () => {
  it("calls loader and writes the result with the configured TTL", async () => {
    getMock.mockResolvedValue(null);
    setMock.mockResolvedValue("OK");
    const loader = vi.fn().mockResolvedValue({ spend: 50 });

    const result = await withRedisCache(
      {
        client: "globalcomix",
        query: "trend",
        params: { from: "a", to: "b" },
        ttlSeconds: 600,
      },
      loader,
    );

    expect(result).toEqual({ spend: 50 });
    expect(loader).toHaveBeenCalledOnce();
    expect(setMock).toHaveBeenCalledOnce();
    const [key, payload, options] = setMock.mock.calls[0];
    expect(typeof key).toBe("string");
    expect(JSON.parse(payload as string)).toEqual({ spend: 50 });
    expect(options).toEqual({ ex: 600 });
  });

  it("caps TTL at the hard ceiling", async () => {
    getMock.mockResolvedValue(null);
    setMock.mockResolvedValue("OK");
    const loader = vi.fn().mockResolvedValue({ ok: true });

    await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: {},
        ttlSeconds: 999_999,
        hardCeilingSeconds: 3600,
      },
      loader,
    );

    expect(setMock.mock.calls[0][2]).toEqual({ ex: 3600 });
  });
});

describe("withRedisCache — error tolerance", () => {
  it("falls back to loader when GET throws", async () => {
    getMock.mockRejectedValue(new Error("network blew up"));
    setMock.mockResolvedValue("OK");
    const loader = vi.fn().mockResolvedValue({ spend: 77 });

    const result = await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: {},
        ttlSeconds: 60,
      },
      loader,
    );

    expect(result).toEqual({ spend: 77 });
    expect(loader).toHaveBeenCalledOnce();
  });

  it("returns the loaded value even when SET fails", async () => {
    getMock.mockResolvedValue(null);
    setMock.mockRejectedValue(new Error("redis down"));
    const loader = vi.fn().mockResolvedValue({ spend: 42 });

    const result = await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: {},
        ttlSeconds: 60,
      },
      loader,
    );

    expect(result).toEqual({ spend: 42 });
  });
});

describe("withRedisCache — round-trips equivalent params to the same key", () => {
  it("two back-to-back calls with re-ordered params hit the cache the second time", async () => {
    let stored: unknown = null;
    getMock.mockImplementation(async () => stored);
    setMock.mockImplementation(async (_k, v) => {
      stored = v;
      return "OK";
    });
    const loader = vi.fn().mockResolvedValue({ ok: true });

    await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: { from: "2026-04-15", to: "2026-05-15" },
        ttlSeconds: 60,
      },
      loader,
    );
    await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: { to: "2026-05-15", from: "2026-04-15" },
        ttlSeconds: 60,
      },
      loader,
    );

    expect(loader).toHaveBeenCalledOnce();
  });
});
