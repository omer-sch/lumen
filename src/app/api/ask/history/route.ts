import { NextResponse } from "next/server";

import {
  listAskQueries,
  recordAskQuery,
  type AskHistoryInput,
} from "@/lib/db/ask";
import { getUserId } from "@/lib/db/user";
import { isSupabaseConfigured } from "@/lib/env.server";

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ entries: [] });
  }
  const url = new URL(req.url);
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") ?? 20)),
  );
  const userId = await getUserId();
  const entries = await listAskQueries(userId, limit);
  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const body = (await req.json()) as AskHistoryInput;
  if (!body?.answer?.question) {
    return NextResponse.json({ error: "answer required" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    // No DB in preview — accept the call so the client doesn't show
    // an error toast, but skip persistence.
    return NextResponse.json({ ok: true, persisted: false, id: null });
  }
  const userId = await getUserId();
  const { id } = await recordAskQuery(userId, body);
  return NextResponse.json({ ok: true, persisted: true, id });
}
