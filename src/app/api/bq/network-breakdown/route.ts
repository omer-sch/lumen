import { NextRequest, NextResponse } from "next/server";
import { queryNetworkBreakdown } from "@/lib/bq-queries";
import { bqErrorResponse, parseGlobalFilter, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

/**
 * Per-network full performance row for the period. Same auth / param
 * shape as `/api/bq/channel-mix` plus optional `os` + `platforms`.
 * Empty array for clients that aren't multi-source.
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
    const data = await queryNetworkBreakdown(
      params.client,
      params.from,
      params.to,
      filter,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "network-breakdown");
  }
}
