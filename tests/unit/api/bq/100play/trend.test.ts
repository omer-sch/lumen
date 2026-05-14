// Layer 3 (API route-handler). File under test:
// src/app/api/bq/100play/trend/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query100playTrend } = vi.hoisted(() => ({
  query100playTrend: vi.fn(),
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
  return { ...actual, query100playTrend };
});

beforeEach(() => {
  vi.resetModules();
  query100playTrend.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL =
  "/api/bq/100play/trend?client=100play&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/100play/trend", () => {
  it("returns 200 with the trend points", async () => {
    query100playTrend.mockResolvedValue([
      { date: "2026-04-15", spend: 100, installs: 0, cpi: 0, roas: 0 },
    ]);
    const { GET } = await import("@/app/api/bq/100play/trend/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toHaveLength(1);
  });

  it("returns 403 when client is not 100play", async () => {
    const { GET } = await import("@/app/api/bq/100play/trend/route");
    const res = await GET(
      buildRequest(
        "/api/bq/100play/trend?client=playw3&from=2026-04-15&to=2026-05-14",
      ),
    );
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("returns 400 when to is missing", async () => {
    const { GET } = await import("@/app/api/bq/100play/trend/route");
    const res = await GET(
      buildRequest("/api/bq/100play/trend?client=100play&from=2026-04-15"),
    );
    await expectSafeError(res, 400, /Missing required param: to/);
  });

  it("returns 500 safely on generic throw", async () => {
    query100playTrend.mockImplementation(async () => { throw new Error("BQ leak this"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/100play/trend/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/leak this/);
  });
});
