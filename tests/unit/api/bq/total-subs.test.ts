// Layer 3 (API route-handler). File under test:
// src/app/api/bq/total-subs/route.ts. Priority: P1.
//
// Same shape as the other bq/* route tests: parse params, dispatch the
// right query for the requested view, translate errors. Auth lives in
// middleware.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryGlobalComixSubsDaily, queryGlobalComixSubsOsMix, queryGlobalComixNetSubTrend } =
  vi.hoisted(() => ({
    queryGlobalComixSubsDaily: vi.fn(),
    queryGlobalComixSubsOsMix: vi.fn(),
    queryGlobalComixNetSubTrend: vi.fn(),
  }));

vi.mock("@/lib/globalcomix-subs-queries", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/globalcomix-subs-queries")
  >("@/lib/globalcomix-subs-queries");
  return {
    ...actual,
    queryGlobalComixSubsDaily,
    queryGlobalComixSubsOsMix,
    queryGlobalComixNetSubTrend,
  };
});

beforeEach(() => {
  vi.resetModules();
  queryGlobalComixSubsDaily.mockReset();
  queryGlobalComixSubsOsMix.mockReset();
  queryGlobalComixNetSubTrend.mockReset();
  vi.stubEnv("ALLOWED_CLIENTS", "globalcomix,playw3,100play");
  vi.stubEnv("BQ_PROJECT", "test-project");
  vi.stubEnv("BQ_DATASET", "test_dataset");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/bq/total-subs", () => {
  it("dispatches to the daily query by default", async () => {
    queryGlobalComixSubsDaily.mockResolvedValue([
      { date: "2026-05-01", os: "iOS", subs: 12, churn: 1, netSub: 11 },
    ]);
    const { GET } = await import("@/app/api/bq/total-subs/route");
    const res = await GET(
      buildRequest(
        "/api/bq/total-subs?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toHaveLength(1);
    expect(queryGlobalComixSubsDaily).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-15",
      "2026-05-14",
      "total",
    );
  });

  it("threads the os param through to the daily query", async () => {
    queryGlobalComixSubsDaily.mockResolvedValue([]);
    const { GET } = await import("@/app/api/bq/total-subs/route");
    await GET(
      buildRequest(
        "/api/bq/total-subs?client=globalcomix&from=2026-04-15&to=2026-05-14&os=ios",
      ),
    );
    expect(queryGlobalComixSubsDaily).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-15",
      "2026-05-14",
      "ios",
    );
  });

  it("dispatches to os-mix when view=os-mix (ignores the os param for this view)", async () => {
    queryGlobalComixSubsOsMix.mockResolvedValue([
      { os: "iOS", subs: 100, share: 0.5 },
    ]);
    const { GET } = await import("@/app/api/bq/total-subs/route");
    const res = await GET(
      buildRequest(
        "/api/bq/total-subs?client=globalcomix&from=2026-04-15&to=2026-05-14&view=os-mix",
      ),
    );
    await expectJson<unknown[]>(res, 200);
    expect(queryGlobalComixSubsOsMix).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-15",
      "2026-05-14",
    );
    expect(queryGlobalComixSubsDaily).not.toHaveBeenCalled();
  });

  it("dispatches to net-sub-trend with os when view=net-sub-trend", async () => {
    queryGlobalComixNetSubTrend.mockResolvedValue([]);
    const { GET } = await import("@/app/api/bq/total-subs/route");
    await GET(
      buildRequest(
        "/api/bq/total-subs?client=globalcomix&from=2026-04-15&to=2026-05-14&os=android&view=net-sub-trend",
      ),
    );
    expect(queryGlobalComixNetSubTrend).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-15",
      "2026-05-14",
      "android",
    );
  });

  it("returns [] for non-multi-source clients (playw3, 100play)", async () => {
    const { GET } = await import("@/app/api/bq/total-subs/route");
    const res = await GET(
      buildRequest(
        "/api/bq/total-subs?client=playw3&from=2026-04-15&to=2026-05-14",
      ),
    );
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toEqual([]);
    expect(queryGlobalComixSubsDaily).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid os value", async () => {
    const { GET } = await import("@/app/api/bq/total-subs/route");
    const res = await GET(
      buildRequest(
        "/api/bq/total-subs?client=globalcomix&from=2026-04-15&to=2026-05-14&os=desktop",
      ),
    );
    await expectSafeError(res, 400, /Invalid os filter/);
    expect(queryGlobalComixSubsDaily).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid view value", async () => {
    const { GET } = await import("@/app/api/bq/total-subs/route");
    const res = await GET(
      buildRequest(
        "/api/bq/total-subs?client=globalcomix&from=2026-04-15&to=2026-05-14&view=cumulative",
      ),
    );
    await expectSafeError(res, 400, /Invalid view/);
  });
});
