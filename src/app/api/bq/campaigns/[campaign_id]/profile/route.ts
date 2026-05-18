import { NextRequest, NextResponse } from "next/server";
import { queryCampaignProfile } from "@/lib/bq-queries";
import { bqErrorResponse, requireParams } from "../../../_lib/handle";

export const runtime = "nodejs";

/**
 * GET /api/bq/campaigns/<campaign_id>/profile?client=...&from=...&to=...
 *
 * Returns the composite `CampaignProfileData` shape for the drill-down
 * view. The dispatcher in `lib/bq-queries.ts` routes multi-source
 * clients (globalcomix) through the full orchestrator and gives
 * gaming-vocab clients an empty-shape fallback — either way the route
 * 200s with a structurally valid body. Unknown / out-of-window
 * campaigns resolve to `summary: null`, never a 404.
 *
 * OS / Platforms filters are intentionally NOT honored on this route:
 * a campaign profile is "everything we know about one campaign", and
 * narrowing by OS / Platform would either be coherent (campaign exists
 * on one platform only — filter is a no-op) or contradictory (filter
 * narrows to a platform the campaign doesn't run on — empty result).
 * The TopBar on /campaigns/[id] hides those chips entirely.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const { campaign_id } = await params;
  if (!campaign_id || !/^[a-zA-Z0-9_-]+$/.test(campaign_id)) {
    return NextResponse.json(
      { error: "Invalid campaign_id" },
      { status: 400 },
    );
  }
  const queryParams = requireParams(req.nextUrl.searchParams, [
    "client",
    "from",
    "to",
  ]);
  if (queryParams instanceof NextResponse) return queryParams;
  try {
    const data = await queryCampaignProfile(
      queryParams.client,
      campaign_id,
      queryParams.from,
      queryParams.to,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "campaign-profile");
  }
}
