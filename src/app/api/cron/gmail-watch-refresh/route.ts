import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { isGmailConfigured } from "@/lib/env.server";
import { listExpiringWatches, markWatchFailed, registerWatch } from "@/lib/gmail/watch";
import { pushNotification } from "@/lib/notifications/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily-ish cron that re-registers Gmail watches within 36h of expiry.
// Gmail watches expire after ~7 days (Google guarantees at least 1 day
// remaining when you watch); a daily sweep keeps them comfortably
// fresh. Failed re-registrations are marked status=failed and the
// user gets an in-app notification.

function isValidSecret(header: string): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || !header) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!isValidSecret(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isGmailConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const expiring = await listExpiringWatches(36);
  const results: Array<{
    userId: string;
    status: "refreshed" | "failed";
    error?: string;
  }> = [];

  for (const watch of expiring) {
    try {
      await registerWatch(watch.userId);
      results.push({ userId: watch.userId, status: "refreshed" });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await markWatchFailed(watch.userId, error).catch(() => {});
      await pushNotification({
        userId: watch.userId,
        kind: "gmail_watch_failed",
        title: "Gmail watch could not be re-registered",
        body: `${error.slice(0, 240)}. Reconnect at /settings/integrations.`,
        link: "/settings/integrations",
      }).catch(() => {});
      results.push({ userId: watch.userId, status: "failed", error });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: expiring.length,
    refreshed: results.filter((r) => r.status === "refreshed").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}
