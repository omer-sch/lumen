// Layer 2 (lib-unit). File under test: src/lib/cache/keys.ts.
//
// `cacheKey` is the canonical key shape every cached query writes to
// Redis. The contract is:
//   1. The key path layout is `lumen:cache:v1:{client}:{query}:{paramHash}`.
//   2. `paramHash` is deterministic — the same params (regardless of key
//      insertion order, regardless of nesting) hash to the same digest.
//   3. Different params hash differently.
// Future cache-invalidation code reads `clientKeyPrefix` to match every
// key for a client, so we lock that shape too.
import { describe, expect, it } from "vitest";

import { cacheKey, clientKeyPrefix, paramHash } from "@/lib/cache/keys";

describe("cacheKey", () => {
  it("includes namespace, version, client, query, and hash", () => {
    const key = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { from: "2026-04-15", to: "2026-05-15" },
    });
    expect(key.startsWith("lumen:cache:v1:globalcomix:kpis:")).toBe(true);
    // The trailing segment is the 12-char hash; assert length, not value.
    const segments = key.split(":");
    expect(segments.length).toBe(6);
    expect(segments[5]).toMatch(/^[0-9a-f]{12}$/);
  });

  it("produces the same key for equivalent params with different key order", () => {
    const a = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { from: "2026-04-15", to: "2026-05-15" },
    });
    const b = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { to: "2026-05-15", from: "2026-04-15" },
    });
    expect(a).toBe(b);
  });

  it("produces the same key for nested objects with different key order", () => {
    const a = cacheKey({
      client: "globalcomix",
      query: "trend",
      params: { window: { from: "2026-04-15", to: "2026-05-15" }, group: "network" },
    });
    const b = cacheKey({
      client: "globalcomix",
      query: "trend",
      params: { group: "network", window: { to: "2026-05-15", from: "2026-04-15" } },
    });
    expect(a).toBe(b);
  });

  it("produces different keys for different param values", () => {
    const a = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { from: "2026-04-15", to: "2026-05-15" },
    });
    const b = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { from: "2026-04-16", to: "2026-05-15" },
    });
    expect(a).not.toBe(b);
  });

  it("treats Date values as ISO strings so callers can pass either", () => {
    const iso = "2026-04-15T00:00:00.000Z";
    const a = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { when: new Date(iso) },
    });
    const b = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { when: iso },
    });
    expect(a).toBe(b);
  });
});

describe("paramHash", () => {
  it("is deterministic", () => {
    const inp = { from: "2026-04-15", to: "2026-05-15" };
    expect(paramHash(inp)).toBe(paramHash(inp));
  });

  it("returns 12 hex chars", () => {
    expect(paramHash({})).toMatch(/^[0-9a-f]{12}$/);
  });

  it("handles arrays positionally — order matters", () => {
    const a = paramHash({ networks: ["meta", "google"] });
    const b = paramHash({ networks: ["google", "meta"] });
    expect(a).not.toBe(b);
  });
});

describe("clientKeyPrefix", () => {
  it("matches the same client segment cacheKey writes", () => {
    const key = cacheKey({
      client: "globalcomix",
      query: "kpis",
      params: { from: "x", to: "y" },
    });
    const prefix = clientKeyPrefix("globalcomix");
    // The Upstash `scan` MATCH pattern is glob-style; strip the trailing
    // `*` and assert the literal prefix matches the start of `key`.
    expect(key.startsWith(prefix.slice(0, -1))).toBe(true);
  });
});
