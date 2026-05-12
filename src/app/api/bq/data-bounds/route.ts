import { NextRequest, NextResponse } from "next/server";
import { queryDataBounds } from "@/lib/bq-queries";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client"]);
  if (params instanceof NextResponse) return params;
  try {
    const data = await queryDataBounds(params.client);
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "data-bounds");
  }
}
