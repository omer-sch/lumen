import "server-only";

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { isGmailConfigured } from "@/lib/env.server";
import { deleteGmailTokens } from "@/lib/gmail/tokens";
import { stopAndDeleteWatch } from "@/lib/gmail/watch";

export const runtime = "nodejs";

// Disconnects Gmail: stops the Gmail watch on Google's side, drops the
// tokens, drops the watch row. Idempotent; safe to call when not
// connected. Clerk-authed.
export async function POST() {
  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "Gmail integration not configured" },
      { status: 503 },
    );
  }
  const authResult = await requireUser({
    scope: "gmail.disconnect",
    maxPerWindow: 10,
  });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  // Best-effort stop on Google's side (token may already be revoked);
  // delete the row either way.
  await stopAndDeleteWatch(authResult.userId).catch(() => {});
  await deleteGmailTokens(authResult.userId);
  return NextResponse.json({ ok: true });
}
