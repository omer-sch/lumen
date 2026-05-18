// Layer 3 (API route-handler). File under test:
// src/app/api/bq/campaigns/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryCampaigns } = vi.hoisted(() => ({
  queryCampaigns: vi.fn(),
}));

// Pass-through next/cache so the real export's `unstable_cache(fn, ...)`
// wrapper doesn't intercept the spy. Without this the rejection routed
// through the cache layer escapes our try/catch as an unhandled promise.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryCampaigns };
});

beforeEach(() => {
  vi.resetModules();
  queryCampaigns.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL = "/api/bq/campaigns?client=globalcomix&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/campaigns", () => {
  it("returns 200 with the campaign array", async () => {
    queryCampaigns.mockResolvedValue([
      { campaign_id: "c1", campaign_name: "Meta_Promo", network: "Meta", spend: 1, installs: 1, cpi: 1, roi_d7: 1, spendDelta: 0 },
    ]);
    const { GET } = await import("@/app/api/bq/campaigns/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toHaveLength(1);
  });

  it("returns 400 when `from` is missing", async () => {
    const { GET } = await import("@/app/api/bq/campaigns/route");
    const res = await GET(
      buildRequest("/api/bq/campaigns?client=globalcomix&to=2026-05-14"),
    );
    await expectSafeError(res, 400, /Missing required param: from/);
    expect(queryCampaigns).not.toHaveBeenCalled();
  });

  it("returns 403 when the lib rejects an unallowlisted client", async () => {
    const { ClientNotPermittedError } = await import("@/lib/bq-security");
    queryCampaigns.mockImplementation(async () => { throw new ClientNotPermittedError("x"); });
    const { GET } = await import("@/app/api/bq/campaigns/route");
    const res = await GET(buildRequest(URL));
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("returns 500 with a safe error when BQ throws", async () => {
    queryCampaigns.mockImplementation(async () => { throw new Error("BQ table not found XYZ"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/campaigns/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/XYZ/);
  });
});
