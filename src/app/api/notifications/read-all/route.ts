import "server-only";

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/env.server";
import { markAllRead } from "@/lib/notifications/server";

export const runtime = "nodejs";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }
  const authResult = await requireUser({
    scope: "notifications.read-all",
    maxPerWindow: 60,
  });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  try {
    await markAllRead(authResult.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Mark-all-read failed",
      },
      { status: 500 },
    );
  }
}
