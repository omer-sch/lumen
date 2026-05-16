import "server-only";

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { isGmailConfigured } from "@/lib/env.server";
import { buildAuthUrl } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

// Starts the Google OAuth dance. Clerk-authed; the userId is embedded
// in the state param so the callback can re-derive the owner without
// a second sign-in round-trip. Setting promptConsent ensures Google
// returns a refresh_token even for previously-granted scope sets.
export async function GET() {
  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "Gmail integration not configured" },
      { status: 503 },
    );
  }
  const authResult = await requireUser({
    scope: "gmail.start",
    maxPerWindow: 20,
  });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  const url = buildAuthUrl({
    state: authResult.userId,
    promptConsent: true,
  });
  return NextResponse.redirect(url, { status: 302 });
}
