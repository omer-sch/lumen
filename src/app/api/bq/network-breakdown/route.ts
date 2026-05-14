import { NextRequest, NextResponse } from "next/server";
import { queryNetworkBreakdown } from "@/lib/bq-queries";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

/**
 * Per-network full performance row for the period. Same auth / param
 * shape as `/api/bq/channel-mix` — only the response payload is wider.
 * Empty array for clients that aren't multi-source.
 */
export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, [
    "client",
    "from",
    "to",
  ]);
  if (params instanceof NextResponse) return params;
  try {
    const data = await queryNetworkBreakdown(
      params.client,
      params.from,
      params.to,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "network-breakdown");
  }
}
