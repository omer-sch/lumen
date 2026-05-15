// Companion to invalidate.test.ts that flips the redis mock to disabled
// so the no-op short-circuit branch is covered without polluting the
// enabled-state test file.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache/redis", () => ({
  redis: null,
  cacheEnabled: () => false,
}));

import { invalidateClientCache } from "@/lib/cache/invalidate";

describe("invalidateClientCache — disabled cache", () => {
  it("short-circuits to 0 without throwing", async () => {
    await expect(invalidateClientCache("globalcomix")).resolves.toBe(0);
  });
});
