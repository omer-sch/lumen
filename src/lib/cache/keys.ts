import "server-only";

import { createHash } from "node:crypto";

/**
 * Canonical Redis key shape for the BigQuery cache layer:
 *
 *   lumen:cache:v1:{client}:{query}:{paramHash}
 *
 *   - `lumen:cache:v1:` is the global namespace prefix. The `v1` segment
 *     buys us a clean cutover if we ever change the key shape, value
 *     encoding, or serialization rules. Bumping to `v2` invalidates
 *     everything at once without paying for a scan/unlink sweep.
 *   - `{client}` is the per-tenant slug (e.g. `globalcomix`). Keying by
 *     client means a future webhook for one client's pipeline refresh
 *     can target `lumen:cache:v1:{client}:*` and leave everyone else
 *     alone.
 *   - `{query}` is the logical query name (`kpis`, `trend`, etc.). Lets
 *     us reason about cache hit rates per query type and lets the
 *     admin stats route group counters meaningfully.
 *   - `{paramHash}` is a deterministic 12-char sha1 prefix over a
 *     canonicalized JSON form of the params. Canonicalize so callers
 *     that pass `{from, to}` and callers that pass `{to, from}` resolve
 *     to the same key. 12 chars of hex (48 bits) is plenty of collision
 *     space for a per-(client, query) namespace; the global key still
 *     differs in `{client}:{query}` so two clients can never alias.
 */
export function cacheKey(opts: {
  client: string;
  query: string;
  params: unknown;
}): string {
  return `lumen:cache:v1:${opts.client}:${opts.query}:${paramHash(opts.params)}`;
}

/**
 * Deterministic param fingerprint. Always returns the first 12 chars of
 * sha1 over the canonical JSON encoding of `params`. Two structurally
 * equal inputs with different key insertion order produce the same hash.
 */
export function paramHash(params: unknown): string {
  const canonical = JSON.stringify(canonicalize(params));
  return createHash("sha1").update(canonical).digest("hex").slice(0, 12);
}

/**
 * Recursively sort object keys so `JSON.stringify` is deterministic.
 * Arrays preserve their order (order is part of the meaning for arrays).
 * Primitives pass through. `undefined` is dropped to match JSON
 * semantics. `Date` is rendered as an ISO string so the hash is stable
 * regardless of whether the caller passed `new Date(...)` or its ISO
 * representation.
 */
function canonicalize(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canonicalize);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const canon = canonicalize(obj[key]);
      if (canon !== undefined) out[key] = canon;
    }
    return out;
  }
  return v;
}

/**
 * Wildcard prefix for one client's entire cache footprint. Phase 2's
 * Rivery webhook handler will call `scan` with this prefix to drop a
 * client's cache when their warehouse tables refresh. Exposed here so
 * the key shape lives in exactly one file.
 */
export function clientKeyPrefix(client: string): string {
  return `lumen:cache:v1:${client}:*`;
}
