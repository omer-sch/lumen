import { NextRequest, NextResponse } from "next/server";
import { query100playKPIs } from "@/lib/bq-queries-100play";
import { bqErrorResponse, requireParams } from "../../_lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (params instanceof NextResponse) return params;
  // Lumen-union routes are tied 1:1 to a single warehouse table. Refuse
  // any other allowlisted slug at the boundary so the access shape stays
  // coherent (otherwise this returns 100play data under the requested
  // slug's cache key — H1 in security-scan-2026-05-12).
  if (params.client !== "100play") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = await query100playKPIs(params.client, params.from, params.to);
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "100play:dashboard-kpis");
  }
}
