import { NextResponse } from "next/server";
import { queryFreshness } from "@/lib/bq-queries";
import { bqErrorResponse } from "../_lib/handle";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await queryFreshness();
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "freshness");
  }
}
