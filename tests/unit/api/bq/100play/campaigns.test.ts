// Layer 3 (API route-handler). File under test:
// src/app/api/bq/100play/campaigns/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query100playCampaigns } = vi.hoisted(() => ({
  query100playCampaigns: vi.fn(),
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
  return { ...actual, query100playCampaigns };
});

beforeEach(() => {
  vi.resetModules();
  query100playCampaigns.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL =
  "/api/bq/100play/campaigns?client=100play&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/100play/campaigns", () => {
  it("returns 200 with the campaign array", async () => {
    query100playCampaigns.mockResolvedValue([
      { campaign_id: "c1", campaign_name: "c1", network: "Meta", spend: 1, installs: 0, cpi: 0, roi_d7: 0, spendDelta: null },
    ]);
    const { GET } = await import("@/app/api/bq/100play/campaigns/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toHaveLength(1);
  });

  it("returns 403 when client is not 100play", async () => {
    const { GET } = await import("@/app/api/bq/100play/campaigns/route");
    const res = await GET(
      buildRequest(
        "/api/bq/100play/campaigns?client=playw3&from=2026-04-15&to=2026-05-14",
      ),
    );
    await expectSafeError(res, 403, /Forbidden/);
    expect(query100playCampaigns).not.toHaveBeenCalled();
  });

  it("returns 400 when params are missing", async () => {
    const { GET } = await import("@/app/api/bq/100play/campaigns/route");
    const res = await GET(buildRequest("/api/bq/100play/campaigns"));
    await expectSafeError(res, 400, /Missing required param/);
  });

  it("returns 500 safely on generic throw", async () => {
    query100playCampaigns.mockImplementation(async () => { throw new Error("BQ secret_value here"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/100play/campaigns/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/secret_value/);
  });
});
