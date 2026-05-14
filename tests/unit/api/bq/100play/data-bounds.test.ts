// Layer 3 (API route-handler). File under test:
// src/app/api/bq/100play/data-bounds/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query100playDataBounds } = vi.hoisted(() => ({
  query100playDataBounds: vi.fn(),
}));

import {
  buildRequest,
  expectJson,
  expectSafeError,
} from "../../_lib/route-test-utils";


vi.mock("@/lib/bq-queries-100play", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/bq-queries-100play")
  >("@/lib/bq-queries-100play");
  return { ...actual, query100playDataBounds };
});

beforeEach(() => {
  vi.resetModules();
  query100playDataBounds.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/bq/100play/data-bounds", () => {
  it("returns 200 with { earliest, latest }", async () => {
    query100playDataBounds.mockResolvedValue({
      earliest: "2025-06-01",
      latest: "2026-05-14",
    });
    const { GET } = await import("@/app/api/bq/100play/data-bounds/route");
    const res = await GET(
      buildRequest("/api/bq/100play/data-bounds?client=100play"),
    );
    const body = await expectJson<{ earliest: string; latest: string }>(
      res,
      200,
    );
    expect(body.earliest).toBe("2025-06-01");
  });

  it("returns 403 when client is not 100play", async () => {
    const { GET } = await import("@/app/api/bq/100play/data-bounds/route");
    const res = await GET(
      buildRequest("/api/bq/100play/data-bounds?client=globalcomix"),
    );
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("returns 400 when client is missing", async () => {
    const { GET } = await import("@/app/api/bq/100play/data-bounds/route");
    const res = await GET(buildRequest("/api/bq/100play/data-bounds"));
    await expectSafeError(res, 400, /Missing required param: client/);
  });

  it("returns 500 safely on generic throw", async () => {
    query100playDataBounds.mockImplementation(async () => { throw new Error("BQ private detail"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/100play/data-bounds/route");
    const res = await GET(
      buildRequest("/api/bq/100play/data-bounds?client=100play"),
    );
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/private detail/);
  });
});
