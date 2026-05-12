import { NextRequest, NextResponse } from "next/server";
import { query100playChannelMix } from "@/lib/bq-queries-100play";
import { bqErrorResponse, requireParams } from "../../_lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (params instanceof NextResponse) return params;
  if (params.client !== "100play") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = await query100playChannelMix(
      params.client,
      params.from,
      params.to,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "100play:channel-mix");
  }
}
