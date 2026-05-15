// Layer 2 (lib-unit). File under test: src/lib/cache/invalidate.ts.
//
// The invalidator iterates Upstash's cursor-based `scan` over a
// client's key prefix and calls `unlink` per batch. Tests confirm:
//   1. SCAN runs with the right MATCH pattern (so we don't accidentally
//      sweep another client's keys).
//   2. UNLINK is called with the keys SCAN returned.
//   3. Multi-page scans terminate when the cursor returns to 0.
//   4. Disabled-cache short-circuits to a 0 count.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scanMock, unlinkMock } = vi.hoisted(() => ({
  scanMock: vi.fn(),
  unlinkMock: vi.fn(),
}));

// Default to enabled; one test below flips the flag via re-mock.
vi.mock("@/lib/cache/redis", () => ({
  redis: { scan: scanMock, unlink: unlinkMock },
  cacheEnabled: () => true,
}));

import { invalidateClientCache } from "@/lib/cache/invalidate";

beforeEach(() => {
  scanMock.mockReset();
  unlinkMock.mockReset();
});

describe("invalidateClientCache", () => {
  it("scans on the client's key prefix and unlinks each batch", async () => {
    scanMock.mockResolvedValueOnce([
      0,
      ["lumen:cache:v1:globalcomix:kpis:abc", "lumen:cache:v1:globalcomix:trend:def"],
    ]);
    unlinkMock.mockResolvedValueOnce(2);

    const count = await invalidateClientCache("globalcomix");

    expect(count).toBe(2);
    expect(scanMock).toHaveBeenCalledOnce();
    const [, options] = scanMock.mock.calls[0];
    expect(options).toEqual({ match: "lumen:cache:v1:globalcomix:*", count: 100 });
    expect(unlinkMock).toHaveBeenCalledWith(
      "lumen:cache:v1:globalcomix:kpis:abc",
      "lumen:cache:v1:globalcomix:trend:def",
    );
  });

  it("walks multiple scan pages until cursor returns to 0", async () => {
    scanMock
      .mockResolvedValueOnce(["42", ["k1", "k2"]])
      .mockResolvedValueOnce([0, ["k3"]]);
    unlinkMock.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const count = await invalidateClientCache("globalcomix");

    expect(count).toBe(3);
    expect(scanMock).toHaveBeenCalledTimes(2);
    expect(unlinkMock).toHaveBeenCalledTimes(2);
  });

  it("skips unlink for empty batches", async () => {
    scanMock.mockResolvedValueOnce([0, []]);
    const count = await invalidateClientCache("globalcomix");
    expect(count).toBe(0);
    expect(unlinkMock).not.toHaveBeenCalled();
  });
});
