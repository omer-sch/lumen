import { NextRequest, NextResponse } from "next/server";
import { queryGlobalComixTopAdTrend } from "@/lib/globalcomix-queries";
import { getSchemaForClient } from "@/lib/bq-security";
import { bqErrorResponse, parseGlobalFilter, requireParams } from "../../_lib/handle";

export const runtime = "nodejs";

/**
 * GET /api/bq/creatives/top-ad-trend
 *
 * Returns the #1 ad by total spend in the active window plus a daily
 * spend series for it (current period + equivalent prior 30 days). Used
 * by the Creative Breakdown view's top-of-page trend chart. Returns
 * `{ top_ad: null, points: [] }` when no ad clears the spend threshold
 * so the UI can render an honest empty state.
 *
 * Only multi-source clients (currently GlobalComix) return data. Other
 * clients get an empty payload back so the UI degrades silently.
 */
export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, [
    "client",
    "from",
    "to",
  ]);
  if (params instanceof NextResponse) return params;
  const filter = parseGlobalFilter(req.nextUrl.searchParams);
  if (filter instanceof NextResponse) return filter;
  try {
    if (getSchemaForClient(params.client).strategy !== "multi-source") {
      return NextResponse.json({ top_ad: null, points: [] });
    }
    const data = await queryGlobalComixTopAdTrend(
      params.client,
      params.from,
      params.to,
      filter,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "top-ad-trend");
  }
}
