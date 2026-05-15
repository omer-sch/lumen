import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Upstash Redis singleton for the BigQuery query cache layer.
 *
 * Why a REST-backed Redis here and not Next's `unstable_cache`:
 *   1. `unstable_cache` is in-memory and per-instance. Vercel can spin up
 *      multiple function instances and a fresh one always misses, which
 *      means BigQuery scans the warehouse for the first user that lands
 *      on each new instance. With Upstash the cache survives instance
 *      churn and the first request after a cold start hits Redis.
 *   2. `unstable_cache` cannot be invalidated from outside the Next
 *      runtime. A future Rivery webhook needs to be able to blow a
 *      client's cache out of band, and Upstash's `scan`/`unlink` give us
 *      that primitive without coupling the invalidator to a Next route.
 *
 * Failure mode:
 *   If either env var is missing (local dev without an Upstash account,
 *   CI without a test instance, a temporarily revoked token), `redis` is
 *   `null` and the wrapper falls back to direct BigQuery calls. We never
 *   crash the dashboard because the cache is unreachable; degraded
 *   latency is preferable to a blank page.
 *
 * Both env vars are read inside the IIFE so this module is import-safe
 * in places that never touch Redis (e.g. type-only re-exports, the
 * vitest test runner picking the file up via coverage globs).
 */
const { client, enabled } = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { client: null as Redis | null, enabled: false };
  }
  return {
    client: new Redis({ url, token }),
    enabled: true,
  };
})();

export const redis: Redis | null = client;

/** Whether the cache layer is wired up. Drives log lines and the admin stats route. */
export function cacheEnabled(): boolean {
  return enabled;
}
