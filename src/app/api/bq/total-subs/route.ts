import { NextRequest, NextResponse } from "next/server";
import {
  queryGlobalComixSubsDaily,
  queryGlobalComixSubsOsMix,
  queryGlobalComixNetSubTrend,
} from "@/lib/globalcomix-subs-queries";
import { getSchemaForClient } from "@/lib/bq-security";
import { isOsFilter, type OsFilter } from "@/lib/filters/types";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

/**
 * GET /api/bq/total-subs
 *
 * Returns the subscriber lifecycle payload that the Lifecycle frame on
 * /dashboard reads. Source: `dwh_total_subs_globalcomix`.
 *
 * Query params:
 *   client   required, allowlisted slug
 *   from     required, YYYY-MM-DD
 *   to       required, YYYY-MM-DD
 *   os       optional, total | ios | android | web (default total)
 *   view     optional, daily | os-mix | net-sub-trend (default daily)
 *
 * Non-multi-source clients (playw3, 100play) return an empty array — the
 * lifecycle table is GlobalComix-only today; the dashboard hides the
 * frame for those clients.
 */
export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, [
    "client",
    "from",
    "to",
  ]);
  if (params instanceof NextResponse) return params;

  const osRaw = req.nextUrl.searchParams.get("os")?.trim().toLowerCase();
  let os: OsFilter = "total";
  if (osRaw) {
    if (!isOsFilter(osRaw)) {
      return NextResponse.json(
        { error: `Invalid os filter: ${osRaw}` },
        { status: 400 },
      );
    }
    os = osRaw;
  }

  const view =
    req.nextUrl.searchParams.get("view")?.trim().toLowerCase() ?? "daily";
  if (view !== "daily" && view !== "os-mix" && view !== "net-sub-trend") {
    return NextResponse.json(
      { error: `Invalid view: ${view}` },
      { status: 400 },
    );
  }

  try {
    // Lifecycle data lives on the per-client sub-table; other clients
    // (playw3 / 100play) return [] so the frame degrades gracefully.
    if (getSchemaForClient(params.client).strategy !== "multi-source") {
      return NextResponse.json([]);
    }

    if (view === "os-mix") {
      const data = await queryGlobalComixSubsOsMix(
        params.client,
        params.from,
        params.to,
      );
      return NextResponse.json(data);
    }

    if (view === "net-sub-trend") {
      const data = await queryGlobalComixNetSubTrend(
        params.client,
        params.from,
        params.to,
        os,
      );
      return NextResponse.json(data);
    }

    const data = await queryGlobalComixSubsDaily(
      params.client,
      params.from,
      params.to,
      os,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "total-subs");
  }
}
