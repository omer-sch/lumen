import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/admin";
import { cacheEnabled } from "@/lib/cache/redis";
import { readCacheStats } from "@/lib/cache/stats";

export const runtime = "nodejs";

/**
 * Lightweight observability surface for the cache layer.
 *
 * Returns the per-query hit/miss/error/bypass counts the wrapper has
 * accumulated since this function instance booted, plus the totals
 * across all queries. Stats reset on cold start — fine for now; we are
 * not building a metrics pipeline this sprint, just a "is the cache
 * working" probe a human can hit.
 *
 * Admin-gated: nothing here is secret, but exposing hit-rate trends on
 * an unauthenticated URL invites someone to wedge our cache by
 * scraping it. Same auth model as the manual refresh route.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = readCacheStats();
  return NextResponse.json({
    enabled: cacheEnabled(),
    ...stats,
  });
}
