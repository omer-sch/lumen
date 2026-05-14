import { NextRequest, NextResponse } from "next/server";
import { queryFreshness } from "@/lib/bq-queries";
import { bqErrorResponse } from "../_lib/handle";

export const runtime = "nodejs";

/**
 * Freshness endpoint. The optional `?client=` query param scopes the
 * `dataAsOf` field to that client's warehouse tables — the Rivery
 * `hoursAgo` signal is client-agnostic and always reflects the loader's
 * heartbeat. Unknown / disallowed clients are rejected upstream by
 * `assertClientAllowed` inside the query module.
 */
export async function GET(req: NextRequest) {
  const client = req.nextUrl.searchParams.get("client") ?? undefined;
  try {
    const data = await queryFreshness(client);
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "freshness");
  }
}
