// Companion to with-redis-cache.test.ts. Same file under test, but the
// redis module mock is flipped to "disabled" so we exercise the bypass
// branch in isolation. Separate file because `vi.mock(...)` lives at
// module scope — the disabled-state test would otherwise contaminate
// the hit/miss tests.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache/redis", () => ({
  redis: null,
  cacheEnabled: () => false,
}));

import { withRedisCache } from "@/lib/cache/with-redis-cache";

describe("withRedisCache — bypass when redis is disabled", () => {
  it("calls the loader and returns its value without touching redis", async () => {
    const loader = vi.fn().mockResolvedValue({ spend: 5 });
    const result = await withRedisCache(
      {
        client: "globalcomix",
        query: "kpis",
        params: {},
        ttlSeconds: 60,
      },
      loader,
    );
    expect(result).toEqual({ spend: 5 });
    expect(loader).toHaveBeenCalledOnce();
  });
});
