import { NextRequest, NextResponse } from "next/server";
import { queryPayback } from "@/lib/bq-queries";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

/**
 * Cohort payback curve (D0 → D90) for the period. Returns up to 5
 * points; for non-multi-source clients the array is empty.
 */
export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, [
    "client",
    "from",
    "to",
  ]);
  if (params instanceof NextResponse) return params;
  try {
    const data = await queryPayback(params.client, params.from, params.to);
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "payback");
  }
}
