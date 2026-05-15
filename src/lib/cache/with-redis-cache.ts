import "server-only";

import { cacheKey } from "@/lib/cache/keys";
import { cacheEnabled, redis } from "@/lib/cache/redis";
import { recordCacheEvent } from "@/lib/cache/stats";

/**
 * Read-through cache wrapper for BigQuery query functions.
 *
 * Semantics:
 *   1. If Redis isn't configured or the GET fails, we *bypass* the cache
 *      and call the loader directly. Cache failures must never block the
 *      dashboard from rendering — degraded latency beats a blank screen.
 *   2. On cache HIT, parse the stored JSON and return it. We trust the
 *      shape we stored — the wrapper is generic over `T`, so callers are
 *      responsible for keeping the on-wire shape stable across versions.
 *      (When that contract breaks, bump the `v1` segment in keys.ts.)
 *   3. On cache MISS, call the loader, store the result with `EX
 *      ttlSeconds`, and return. A SET failure is logged but not thrown
 *      — same reason as (1): user-facing reads are the priority.
 *
 * `hardCeilingSeconds` is a defense-in-depth cap. Even if a caller
 * passes a wildly long TTL by mistake, Redis won't hold a key for more
 * than 24h by default. The product agreement with the BI team is that a
 * fresh Rivery sync should be visible within a day at the latest.
 */
export type WithRedisCacheOpts = {
  client: string;
  query: string;
  params: unknown;
  ttlSeconds: number;
  hardCeilingSeconds?: number;
};

export async function withRedisCache<T>(
  opts: WithRedisCacheOpts,
  loader: () => Promise<T>,
): Promise<T> {
  const key = cacheKey({
    client: opts.client,
    query: opts.query,
    params: opts.params,
  });
  const ttl = Math.min(
    opts.ttlSeconds,
    opts.hardCeilingSeconds ?? 86_400,
  );

  if (!cacheEnabled() || redis == null) {
    recordCacheEvent("bypass", opts.query);
    console.info({
      event: "cache.bypass",
      reason: "redis_disabled",
      key,
      query: opts.query,
      client: opts.client,
    });
    return loader();
  }

  // 1. Read-through. Upstash returns `null` for a miss; for a hit it
  //    returns the original value (it auto-deserializes JSON, so we
  //    accept either the parsed object or a string we have to parse).
  try {
    const raw = await redis.get<unknown>(key);
    if (raw != null) {
      const parsed = decodeCached<T>(raw);
      recordCacheEvent("hit", opts.query);
      console.info({
        event: "cache.hit",
        key,
        query: opts.query,
        client: opts.client,
      });
      return parsed;
    }
  } catch (err) {
    // GET failed — treat as a miss so the user still gets data, but log
    // it as `cache.error` so the admin stats route can surface chronic
    // Redis flakiness. We do NOT return here; we fall through to the
    // loader and try to SET the result on the way back out (which may
    // also fail, also fine).
    recordCacheEvent("error", opts.query);
    console.warn({
      event: "cache.error",
      stage: "get",
      key,
      query: opts.query,
      client: opts.client,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Miss path. Load fresh data and try to populate the cache.
  const start = Date.now();
  const value = await loader();
  const latencyMs = Date.now() - start;
  recordCacheEvent("miss", opts.query);
  console.info({
    event: "cache.miss",
    key,
    query: opts.query,
    client: opts.client,
    latencyMs,
  });

  try {
    // `JSON.stringify` is explicit so Date values become ISO strings on
    // the wire — Upstash will round-trip the string verbatim on the
    // next GET and our decoders treat dates as ISO. The query functions
    // already normalize to primitives or ISO strings (see
    // `types/dashboard.ts`), so this is the simple, safe encoding.
    await redis.set(key, JSON.stringify(value), { ex: ttl });
  } catch (err) {
    recordCacheEvent("error", opts.query);
    console.warn({
      event: "cache.error",
      stage: "set",
      key,
      query: opts.query,
      client: opts.client,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return value;
}

/**
 * Upstash auto-parses JSON when it can; for callers that stored a string
 * (or for backends that don't auto-parse), accept both shapes.
 */
function decodeCached<T>(raw: unknown): T {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  return raw as T;
}
