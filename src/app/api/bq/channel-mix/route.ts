import { NextRequest, NextResponse } from "next/server";
import { queryChannelMix } from "@/lib/bq-queries";
import { bqErrorResponse, requireParams } from "../_lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (params instanceof NextResponse) return params;
  try {
    const data = await queryChannelMix(params.client, params.from, params.to);
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "channel-mix");
  }
}
