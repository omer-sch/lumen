import { NextResponse } from "next/server";

import { removePinForUser } from "@/lib/db/pins";
import { getUserId } from "@/lib/db/user";
import { isSupabaseConfigured } from "@/lib/env.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, persisted: false });
  }
  const userId = await getUserId();
  await removePinForUser(userId, id);
  return NextResponse.json({ ok: true, persisted: true });
}
