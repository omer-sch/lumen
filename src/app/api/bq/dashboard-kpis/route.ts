import { NextRequest, NextResponse } from "next/server";
import { queryDashboardKPIs } from "@/lib/bq-queries";
import { bqErrorResponse, parseGlobalFilter, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (params instanceof NextResponse) return params;
  const filter = parseGlobalFilter(req.nextUrl.searchParams);
  if (filter instanceof NextResponse) return filter;
  try {
    const data = await queryDashboardKPIs(
      params.client,
      params.from,
      params.to,
      filter,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "dashboard-kpis");
  }
}
