import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getAdminUserId } from "@/lib/auth/admin";
import { invalidateClientCache } from "@/lib/cache/invalidate";
import { warmClientCache } from "@/lib/cache/warm";
import { queryGlobalComixDataAsOf } from "@/lib/globalcomix-queries";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin-triggered cache refresh for one client.
 *
 * Flow:
 *   1. Auth gate: must be a signed-in Clerk user AND on the admin
 *      allowlist (`LUMEN_ADMIN_USER_IDS`). The cron secret path is
 *      separate (`/api/cron/warm-cache`) — this route is the
 *      logged-in-user path and we want the audit log keyed to a real
 *      user id, not a shared header.
 *   2. Invalidate every key under `lumen:cache:v1:{client}:*`. Phase 2
 *      will trigger this from a Rivery webhook; today's button reuses
 *      the same primitive.
 *   3. Re-warm with the same `warmClientCache` the cron uses so the
 *      keys we just deleted come back populated before the user's
 *      `router.refresh()` lands.
 *   4. Surface the new `dataAsOf` so the toast/inline indicator can
 *      tell the user what they got.
 */
export async function POST(req: NextRequest) {
  // 401 first — the unauthenticated path should never hit the admin
  // allowlist read because there's no point logging the env touch for
  // a request that has no identity to attribute it to.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUserId = await getAdminUserId();
  if (!adminUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = (req.nextUrl.searchParams.get("client") ?? "globalcomix")
    .trim()
    .toLowerCase();
  if (!client) {
    return NextResponse.json(
      { error: "Missing required param: client" },
      { status: 400 },
    );
  }

  const start = Date.now();
  const invalidatedKeys = await invalidateClientCache(client);
  // queryFreshness is wrapped in unstable_cache with a 10-min revalidate
  // and the `bq:freshness` tag. Without this, the freshness bar holds the
  // pre-sync value for up to 10 minutes after the user clicks Sync Now,
  // even though Redis is fresh. Tag invalidation is in-process; this is
  // the right primitive for the Next cache layer.
  revalidateTag("bq:freshness");
  const warmed = await warmClientCache(client);

  // `dataAsOf` is uncached on purpose (see globalcomix-queries header
  // comment), but we surface it here so the UI can show the user the
  // newly-active value without a second round-trip. Swallow errors —
  // a flaky DataAsOf shouldn't bury the success of the refresh.
  let dataAsOf: string | null = null;
  try {
    dataAsOf = await queryGlobalComixDataAsOf(client);
  } catch (err) {
    console.warn({
      event: "cache.manual_refresh.data_as_of_failed",
      client,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const warmedQueries = warmed.filter((w) => w.ok).length;
  const latencyMs = Date.now() - start;

  console.info({
    event: "cache.manual_refresh",
    userId: adminUserId,
    client,
    invalidatedKeys,
    warmedQueries,
    totalQueries: warmed.length,
    latencyMs,
  });

  return NextResponse.json({
    client,
    invalidatedKeys,
    warmedQueries,
    dataAsOf,
    latencyMs,
  });
}
