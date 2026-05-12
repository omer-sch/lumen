import { NextResponse } from "next/server";

import {
  addPinForUser,
  listPinsForUser,
  type IncomingPin,
} from "@/lib/db/pins";
import { getUserId } from "@/lib/db/user";
import { isSupabaseConfigured } from "@/lib/env.server";

export async function GET() {
  if (!isSupabaseConfigured()) {
    // No DB in preview — design view starts with an empty list and
    // local state covers the session.
    return NextResponse.json({ tiles: [] });
  }
  const userId = await getUserId();
  const tiles = await listPinsForUser(userId);
  return NextResponse.json({ tiles });
}

export async function POST(req: Request) {
  const body = (await req.json()) as IncomingPin;
  if (!body?.config) {
    return NextResponse.json({ error: "config required" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, persisted: false, tile: null });
  }
  const userId = await getUserId();
  const tile = await addPinForUser(userId, body);
  return NextResponse.json({ ok: true, persisted: true, tile });
}
