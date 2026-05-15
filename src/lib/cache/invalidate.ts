import "server-only";

import { clientKeyPrefix } from "@/lib/cache/keys";
import { cacheEnabled, redis } from "@/lib/cache/redis";

/**
 * Drop every cache entry owned by a single client.
 *
 * Used by:
 *   - The admin "Sync now" route, which invalidates then re-warms to
 *     give the user a fresh read on demand.
 *   - The future Rivery webhook (Phase 2), which will call this when a
 *     client's warehouse sync lands so the next dashboard load reflects
 *     the new data instead of waiting out the 12h TTL.
 *
 * Implementation notes:
 *   - We iterate with Upstash's cursor-based `scan` so a client with a
 *     thousand cached keys doesn't fill a single response payload. The
 *     batch size of 100 is a compromise between request count and
 *     payload size; tune later if Upstash limits change.
 *   - We use `unlink` rather than `del`. Same effect for the caller; on
 *     Redis-the-server `unlink` happens off the main thread so large
 *     deletes don't block other clients. Upstash maps both to the same
 *     network call, so it's a no-cost defensive choice.
 *   - When Redis is disabled the function is a no-op that returns 0.
 *     This way callers don't have to branch on `cacheEnabled()`.
 */
export async function invalidateClientCache(client: string): Promise<number> {
  if (!cacheEnabled() || redis == null) return 0;

  const match = clientKeyPrefix(client);
  let cursor: string | number = 0;
  let removed = 0;
  // Guard against pathological responses by capping iterations. Even at
  // 100 keys per round, this gives us up to 50k keys per invalidation —
  // multiple orders of magnitude above our expected footprint.
  for (let i = 0; i < 500; i++) {
    const [nextCursor, batch] = (await redis.scan(cursor, {
      match,
      count: 100,
    })) as [string | number, string[]];
    if (batch.length > 0) {
      // `unlink` is variadic in Upstash; the Redis client we use spreads
      // the array onto the underlying command. Empty batch (possible on
      // intermediate `scan` rounds) is skipped above so we don't issue
      // a zero-arg unlink (which would error on some Redis versions).
      removed += await redis.unlink(...(batch as [string, ...string[]]));
    }
    if (nextCursor === 0 || nextCursor === "0") break;
    cursor = nextCursor;
  }
  return removed;
}
