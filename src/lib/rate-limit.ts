import "server-only";

/**
 * Best-effort in-memory sliding-window rate limiter.
 *
 * Per-instance only — Vercel may run several Function instances in
 * parallel, so the effective limit is `MAX × <concurrent instances>`.
 * Good enough as a defence-in-depth speed bump in front of paid
 * third-party APIs (HF, FAL, …); a real distributed limiter (Vercel
 * KV / Upstash) should replace this when one of those routes goes to
 * heavy use.
 */
type Hit = number;
const buckets = new Map<string, Hit[]>();

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const live = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (live.length >= maxRequests) {
    const oldest = live[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000),
    );
    buckets.set(key, live);
    return { allowed: false, retryAfterSeconds };
  }

  live.push(now);
  buckets.set(key, live);

  // Cheap GC: about 1% of calls walk the map and drop expired buckets
  // so the Map doesn't grow unbounded over a long-lived instance.
  if (Math.random() < 0.01) {
    for (const [k, list] of buckets) {
      const stillLive = list.filter((t) => t > cutoff);
      if (stillLive.length === 0) buckets.delete(k);
      else if (stillLive.length !== list.length) buckets.set(k, stillLive);
    }
  }

  return { allowed: true, remaining: maxRequests - live.length };
}
