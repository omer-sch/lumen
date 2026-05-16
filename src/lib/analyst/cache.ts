import "server-only";

import { cacheKey } from "@/lib/cache/keys";
import { withRedisCache } from "@/lib/cache/with-redis-cache";

import type { Intent } from "./types";

// Analyst-layer cache. Wraps the per-query BQ cache one level up so a
// repeat ReadyData request for the same (client, period, platforms,
// channels, focus) does not re-run anomstack / rankings / comparisons
// even if every BQ query under the hood is a cache hit.
//
// TTL: 5 minutes. Chosen short on purpose. The per-query BQ cache
// already absorbs the cost of the BigQuery latency (12 hour TTL); the
// only cost this layer saves is the analyst-side computation and the
// allocation of the ReadyData object. A short TTL keeps the freshness
// window tight, which matters for the Feed / notifications path that
// will read this same cache. If freshness becomes the bottleneck the
// per-query layer is the right place to add invalidation, not here.
export const ANALYST_CACHE_TTL_MS = 5 * 60 * 1000;
export const ANALYST_CACHE_TTL_SECONDS = ANALYST_CACHE_TTL_MS / 1000;

const ANALYST_CACHE_QUERY = "analyst-ready-data" as const;

export type AnalystCacheParams = {
  isoStart: string;
  isoEnd: string;
  platforms: Intent["platforms"];
  channels: Intent["channels"];
  focus: Intent["focus"];
};

/**
 * Build the canonical cache params for a given intent. Arrays are
 * sorted so two intents that differ only in platform / channel order
 * resolve to the same key.
 */
export function deriveAnalystCacheParams(intent: Intent): AnalystCacheParams {
  return {
    isoStart: intent.period.iso_start ?? "unknown-start",
    isoEnd: intent.period.iso_end ?? "unknown-end",
    platforms: [...intent.platforms].sort(),
    channels: [...intent.channels].sort(),
    focus: intent.focus ?? null,
  };
}

/**
 * Compute the cache key string a getReadyData call will use. Exposed
 * so getReadyData can stamp it on ReadyData.provenance.cacheKey before
 * handing off to withRedisCache.
 */
export function deriveAnalystCacheKey(intent: Intent): string {
  return cacheKey({
    client: intent.client,
    query: ANALYST_CACHE_QUERY,
    params: deriveAnalystCacheParams(intent),
  });
}

/**
 * Read-through cache wrapper for getReadyData. Falls back to the
 * loader directly when Redis is unconfigured (the same semantics the
 * BQ cache uses).
 */
export function withAnalystCache<T>(
  intent: Intent,
  loader: () => Promise<T>,
): Promise<T> {
  return withRedisCache(
    {
      client: intent.client,
      query: ANALYST_CACHE_QUERY,
      params: deriveAnalystCacheParams(intent),
      ttlSeconds: ANALYST_CACHE_TTL_SECONDS,
    },
    loader,
  );
}
