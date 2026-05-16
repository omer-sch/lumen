import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/env.server";
import { listReportsForOwner } from "@/lib/reports/server-store";

export const runtime = "nodejs";

// GET /api/reports lists the caller's reports (most recent first, up
// to 50). Powers the Reports sidebar after the localStorage to Supabase
// migration in v0.5-A chunk 2.
export async function GET(_req: NextRequest) {
  if (!isSupabaseConfigured()) {
    // Lets the client fall back to localStorage in environments without
    // a configured Supabase project (some preview / CI runs).
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }
  const authResult = await requireUser({
    scope: "reports.list",
    maxPerWindow: 240,
  });
  if (!authResult.ok) {
    const headers: Record<string, string> = {};
    if (authResult.status === 429) {
      headers["Retry-After"] = String(authResult.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status, headers },
    );
  }
  try {
    const reports = await listReportsForOwner(authResult.userId);
    return NextResponse.json({ reports });
  } catch (err) {
    console.error({
      event: "reports.list.failed",
      userId: authResult.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "List failed" }, { status: 500 });
  }
}
