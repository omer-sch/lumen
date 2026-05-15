import "server-only";

import {
  queryGlobalComixCampaigns,
  queryGlobalComixChannelMix,
  queryGlobalComixDataBounds,
  queryGlobalComixKPIs,
  queryGlobalComixNetworkBreakdown,
  queryGlobalComixPayback,
  queryGlobalComixTrend,
} from "@/lib/globalcomix-queries";

/**
 * Result row for a single warmed query inside one client's pass.
 *   - `query` is the logical name (`kpis`, `trend`, etc.) — matches the
 *     `query` segment of the cache key so failures here line up with
 *     stats counters in the admin route.
 *   - `ok` is false when the loader threw. We swallow errors deliberately
 *     so a transient BigQuery flake on one query doesn't poison the
 *     whole client's warm pass; the cron will try again on the next
 *     tick.
 *   - `latencyMs` is wall-clock for the call (cached or not). Useful
 *     for spotting a query that's drifting toward the 12h TTL boundary.
 */
export type WarmResult = {
  query: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

/**
 * Warm a single client's cache by replaying the queries the dashboard
 * makes on its first page load.
 *
 * Param defaults mirror the "last 30 days" preset that
 * `useGlobalFilters` falls back to when the URL carries no explicit
 * range — the most common dashboard entry. The trailing day is today
 * in UTC so the keys we write here are the keys the next real request
 * will read.
 *
 * This module is shared by the Vercel cron (`/api/cron/warm-cache`)
 * and the admin "Sync now" route (`/api/cache/refresh`) so the two
 * paths cannot drift. If we ever add a new cached query, this is the
 * single function to update.
 */
export async function warmClientCache(client: string): Promise<WarmResult[]> {
  const today = todayUtc();
  const thirtyDaysAgo = isoDateUtc(addDaysUtc(today, -29));
  const to = isoDateUtc(today);
  const from = thirtyDaysAgo;

  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: "kpis", run: () => queryGlobalComixKPIs(client, from, to) },
    { name: "trend", run: () => queryGlobalComixTrend(client, from, to) },
    {
      name: "channel-mix",
      run: () => queryGlobalComixChannelMix(client, from, to),
    },
    {
      name: "network-breakdown",
      run: () => queryGlobalComixNetworkBreakdown(client, from, to),
    },
    { name: "payback", run: () => queryGlobalComixPayback(client, from, to) },
    {
      name: "campaigns",
      run: () => queryGlobalComixCampaigns(client, from, to),
    },
    { name: "data-bounds", run: () => queryGlobalComixDataBounds(client) },
  ];

  // Run them in parallel — these queries don't share state and BigQuery
  // happily handles concurrent reads from the same project. The wall
  // clock on the cron route is what gates Vercel's per-invocation
  // timeout, so parallelism is what keeps us under the limit when the
  // active-client list grows past one.
  const settled = await Promise.allSettled(
    tasks.map(async (t) => {
      const start = Date.now();
      try {
        await t.run();
        return { query: t.name, ok: true, latencyMs: Date.now() - start };
      } catch (err) {
        return {
          query: t.name,
          ok: false,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : { query: "unknown", ok: false, latencyMs: 0, error: String(s.reason) },
  );
}

/** Today, anchored to UTC so the cron and the dashboard agree on "today". */
function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
