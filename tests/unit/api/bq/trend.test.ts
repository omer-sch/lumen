// Layer 3 (API route-handler). File under test: src/app/api/bq/trend/route.ts.
// Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryTrend } = vi.hoisted(() => ({
  queryTrend: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryTrend };
});

beforeEach(() => {
  vi.resetModules();
  queryTrend.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL = "/api/bq/trend?client=globalcomix&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/trend", () => {
  it("returns 200 with the trend point array", async () => {
    queryTrend.mockResolvedValue([
      { date: "2026-04-15", spend: 100, installs: 50, cpi: 2, roas: 1 },
      { date: "2026-04-16", spend: 120, installs: 55, cpi: 2.2, roas: 0.9 },
    ]);
    const { GET } = await import("@/app/api/bq/trend/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toHaveLength(2);
    expect(queryTrend).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-15",
      "2026-05-14",
      {},
    );
  });

  it("returns 400 when no params are provided", async () => {
    const { GET } = await import("@/app/api/bq/trend/route");
    const res = await GET(buildRequest("/api/bq/trend"));
    await expectSafeError(res, 400, /Missing required param/);
  });

  it("translates InvalidDateError to 400", async () => {
    const { InvalidDateError } = await import("@/lib/bq-queries");
    queryTrend.mockImplementation(async () => { throw new InvalidDateError("2026/01/01"); });
    const { GET } = await import("@/app/api/bq/trend/route");
    const res = await GET(buildRequest(URL));
    await expectSafeError(res, 400, /Bad request/);
  });

  it("returns 500 safely on generic throw", async () => {
    queryTrend.mockImplementation(async () => { throw new Error("internal BQ error"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/trend/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/internal BQ error/);
  });
});
