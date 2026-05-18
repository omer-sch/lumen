import { NextRequest, NextResponse } from "next/server";
import { queryGlobalComixCreatives } from "@/lib/globalcomix-queries";
import { getSchemaForClient } from "@/lib/bq-security";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

/** GET /api/bq/creatives — Top-100 ads by Sub D7 (cohort-only in Phase 1). */
export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, [
    "client",
    "from",
    "to",
  ]);
  if (params instanceof NextResponse) return params;
  try {
    if (getSchemaForClient(params.client).strategy !== "multi-source") {
      return NextResponse.json([]);
    }
    const data = await queryGlobalComixCreatives(
      params.client,
      params.from,
      params.to,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "creatives");
  }
}
