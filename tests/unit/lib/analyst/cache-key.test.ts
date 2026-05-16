// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/cache.ts.
// Cache-key correctness is what makes shadow-mode and live-mode share
// the same Redis entries; if two consumers compute a different key for
// the same logical request, the cache is useless and the provenance
// linkage breaks. These tests lock the key contract.
import { describe, expect, it } from "vitest";

import {
  deriveAnalystCacheKey,
  deriveAnalystCacheParams,
} from "@/lib/analyst/cache";
import type { Intent } from "@/lib/analyst/types";

function intent(over: Partial<Intent> = {}): Intent {
  return {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: {
      label: "last 7 days",
      iso_start: "2026-05-01",
      iso_end: "2026-05-07",
    },
    focus: null,
    confidence: 1,
    doubts: [],
    ...over,
  };
}

describe("deriveAnalystCacheParams", () => {
  it("sorts platforms and channels so call-site ordering does not differ", () => {
    const a = deriveAnalystCacheParams(
      intent({ platforms: ["ios", "android"], channels: ["tiktok", "meta"] }),
    );
    const b = deriveAnalystCacheParams(
      intent({ platforms: ["android", "ios"], channels: ["meta", "tiktok"] }),
    );
    expect(a).toEqual(b);
  });

  it("falls back to unknown sentinels when iso bounds are absent", () => {
    const p = deriveAnalystCacheParams(
      intent({ period: { label: "x", iso_start: null, iso_end: null } }),
    );
    expect(p.isoStart).toBe("unknown-start");
    expect(p.isoEnd).toBe("unknown-end");
  });

  it("nulls a missing focus instead of leaving it undefined", () => {
    const p = deriveAnalystCacheParams(intent({ focus: undefined }));
    expect(p.focus).toBeNull();
  });
});

describe("deriveAnalystCacheKey", () => {
  it("matches the lumen:cache:v1:{client}:{query}:{paramHash} shape", () => {
    const key = deriveAnalystCacheKey(intent());
    expect(key).toMatch(
      /^lumen:cache:v1:globalcomix:analyst-ready-data:[0-9a-f]{12}$/,
    );
  });

  it("is the same key when the intent differs only in platform / channel order", () => {
    const k1 = deriveAnalystCacheKey(
      intent({ platforms: ["ios", "android"], channels: ["tiktok", "meta"] }),
    );
    const k2 = deriveAnalystCacheKey(
      intent({ platforms: ["android", "ios"], channels: ["meta", "tiktok"] }),
    );
    expect(k1).toBe(k2);
  });

  it("is a different key when the client differs", () => {
    const k1 = deriveAnalystCacheKey(intent({ client: "globalcomix" }));
    const k2 = deriveAnalystCacheKey(intent({ client: "playw3" }));
    expect(k1).not.toBe(k2);
  });

  it("is a different key when the period differs", () => {
    const k1 = deriveAnalystCacheKey(intent());
    const k2 = deriveAnalystCacheKey(
      intent({
        period: { label: "x", iso_start: "2026-04-01", iso_end: "2026-04-07" },
      }),
    );
    expect(k1).not.toBe(k2);
  });

  it("is a different key when the focus differs", () => {
    const k1 = deriveAnalystCacheKey(intent({ focus: null }));
    const k2 = deriveAnalystCacheKey(intent({ focus: "ios push" }));
    expect(k1).not.toBe(k2);
  });
});
