// Layer 3 (API route-handler). File under test:
// src/app/api/bq/payback/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryPayback } = vi.hoisted(() => ({
  queryPayback: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryPayback };
});

beforeEach(() => {
  vi.resetModules();
  queryPayback.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL = "/api/bq/payback?client=globalcomix&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/payback", () => {
  it("returns 200 with the payback points", async () => {
    queryPayback.mockResolvedValue([
      { window: "D0", roas: 0.05 },
      { window: "D7", roas: 0.3 },
      { window: "D30", roas: 0.65 },
    ]);
    const { GET } = await import("@/app/api/bq/payback/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<{ window: string }[]>(res, 200);
    expect(body.map((p) => p.window)).toEqual(["D0", "D7", "D30"]);
  });

  it("returns 200 with [] for non-multi-source clients", async () => {
    queryPayback.mockResolvedValue([]);
    const { GET } = await import("@/app/api/bq/payback/route");
    const res = await GET(
      buildRequest("/api/bq/payback?client=playw3&from=2026-04-15&to=2026-05-14"),
    );
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toEqual([]);
  });

  it("returns 400 when from is missing", async () => {
    const { GET } = await import("@/app/api/bq/payback/route");
    const res = await GET(
      buildRequest("/api/bq/payback?client=globalcomix&to=2026-05-14"),
    );
    await expectSafeError(res, 400, /Missing required param: from/);
  });

  it("returns 500 safely on generic throw", async () => {
    queryPayback.mockImplementation(async () => { throw new Error("BQ cohort missing column XYZ"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/payback/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/XYZ/);
  });
});
