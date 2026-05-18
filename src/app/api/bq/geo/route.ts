import { NextRequest, NextResponse } from "next/server";
import { queryGlobalComixGeo } from "@/lib/globalcomix-queries";
import { getSchemaForClient } from "@/lib/bq-security";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

/** GET /api/bq/geo — Per-country cohort slice (paid vs organic). */
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
    const data = await queryGlobalComixGeo(
      params.client,
      params.from,
      params.to,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "geo");
  }
}
