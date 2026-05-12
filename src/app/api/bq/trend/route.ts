import { NextRequest, NextResponse } from "next/server";
import { queryTrend } from "@/lib/bq-queries";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (params instanceof NextResponse) return params;
  try {
    const data = await queryTrend(params.client, params.from, params.to);
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "trend");
  }
}
