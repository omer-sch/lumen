// Layer 3 (API route-handler). File under test:
// src/app/api/bq/campaigns/[campaign_id]/profile/route.ts. Priority: P1.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryCampaignProfile } = vi.hoisted(() => ({
  queryCampaignProfile: vi.fn(),
}));

vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryCampaignProfile };
});

beforeEach(() => {
  vi.resetModules();
  queryCampaignProfile.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL =
  "/api/bq/campaigns/12345/profile?client=globalcomix&from=2026-04-15&to=2026-05-14";

const PARAMS = (id: string) => Promise.resolve({ campaign_id: id });

const EMPTY_PAYLOAD = {
  summary: null,
  trend: [],
  adsets: [],
  creatives: [],
  geo: [],
};

describe("GET /api/bq/campaigns/[campaign_id]/profile", () => {
  it("returns 200 with the composite profile payload", async () => {
    queryCampaignProfile.mockResolvedValue({
      ...EMPTY_PAYLOAD,
      summary: {
        campaign_id: "12345",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW",
        network: "Meta",
        campaign_status: "running",
        family: "Sub Evergreen",
        geo: "WW",
        campaignType: "Evergreen",
        platform: "iOS",
        spend: 1000,
        installs: 100,
        cpi: 10,
        cpa_d7: 40,
        roi_d7: 1.2,
        sub_d7: 25,
        sub_start_d7: 30,
        spendDelta: 0.05,
        installsDelta: 0.1,
        cpiDelta: -0.05,
        cpaD7Delta: -0.1,
        roiD7Delta: 0.08,
      },
    });
    const { GET } = await import(
      "@/app/api/bq/campaigns/[campaign_id]/profile/route"
    );
    const res = await GET(buildRequest(URL), { params: PARAMS("12345") });
    const body = await expectJson<{ summary: { campaign_name: string } }>(
      res,
      200,
    );
    expect(body.summary.campaign_name).toContain("YH_FB_APP_FULL_IAP_Sub_iOS");
    expect(queryCampaignProfile).toHaveBeenCalledWith(
      "globalcomix",
      "12345",
      "2026-04-15",
      "2026-05-14",
    );
  });

  it("returns 200 with summary=null for unknown campaign (dispatcher returns empty)", async () => {
    queryCampaignProfile.mockResolvedValue(EMPTY_PAYLOAD);
    const { GET } = await import(
      "@/app/api/bq/campaigns/[campaign_id]/profile/route"
    );
    const res = await GET(buildRequest(URL), { params: PARAMS("99999") });
    const body = await expectJson<{ summary: unknown }>(res, 200);
    expect(body.summary).toBeNull();
  });

  it("returns 400 when client is missing", async () => {
    const { GET } = await import(
      "@/app/api/bq/campaigns/[campaign_id]/profile/route"
    );
    const res = await GET(
      buildRequest(
        "/api/bq/campaigns/12345/profile?from=2026-04-15&to=2026-05-14",
      ),
      { params: PARAMS("12345") },
    );
    await expectSafeError(res, 400, /Missing required param: client/);
  });

  it("returns 400 when campaign_id contains illegal characters", async () => {
    const { GET } = await import(
      "@/app/api/bq/campaigns/[campaign_id]/profile/route"
    );
    const res = await GET(buildRequest(URL), { params: PARAMS("foo bar; DROP--") });
    await expectSafeError(res, 400, /Invalid campaign_id/);
    expect(queryCampaignProfile).not.toHaveBeenCalled();
  });

  it("returns 500 safely when the dispatcher throws", async () => {
    queryCampaignProfile.mockImplementation(async () => {
      throw new Error("BQ schema column missing");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import(
      "@/app/api/bq/campaigns/[campaign_id]/profile/route"
    );
    const res = await GET(buildRequest(URL), { params: PARAMS("12345") });
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/schema column/);
  });
});
