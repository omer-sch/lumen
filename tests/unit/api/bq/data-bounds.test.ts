// Layer 3 (API route-handler). File under test:
// src/app/api/bq/data-bounds/route.ts. Priority: P0.
// Note: this route requires only `client` (no from/to) since data bounds
// describe the *range* of dates that exist in the warehouse.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryDataBounds } = vi.hoisted(() => ({
  queryDataBounds: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryDataBounds };
});

beforeEach(() => {
  vi.resetModules();
  queryDataBounds.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/bq/data-bounds", () => {
  it("returns 200 with the { earliest, latest } shape", async () => {
    queryDataBounds.mockResolvedValue({
      earliest: "2024-01-01",
      latest: "2026-05-14",
    });
    const { GET } = await import("@/app/api/bq/data-bounds/route");
    const res = await GET(
      buildRequest("/api/bq/data-bounds?client=globalcomix"),
    );
    const body = await expectJson<{ earliest: string; latest: string }>(
      res,
      200,
    );
    expect(body).toEqual({ earliest: "2024-01-01", latest: "2026-05-14" });
    expect(queryDataBounds).toHaveBeenCalledWith("globalcomix");
  });

  it("returns 400 when client is missing", async () => {
    const { GET } = await import("@/app/api/bq/data-bounds/route");
    const res = await GET(buildRequest("/api/bq/data-bounds"));
    await expectSafeError(res, 400, /Missing required param: client/);
  });

  it("returns 403 for an unallowlisted client", async () => {
    const { ClientNotPermittedError } = await import("@/lib/bq-security");
    queryDataBounds.mockImplementation(async () => { throw new ClientNotPermittedError("x"); });
    const { GET } = await import("@/app/api/bq/data-bounds/route");
    const res = await GET(buildRequest("/api/bq/data-bounds?client=x"));
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("returns 500 safely on generic throw", async () => {
    queryDataBounds.mockImplementation(async () => { throw new Error("BQ schema mismatch foo"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/data-bounds/route");
    const res = await GET(
      buildRequest("/api/bq/data-bounds?client=globalcomix"),
    );
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/schema mismatch/);
  });
});
