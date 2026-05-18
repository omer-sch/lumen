import "server-only";

import {
  queryGlobalComixAttributionValidation,
  queryGlobalComixCampaigns,
  queryGlobalComixChannelMix,
  queryGlobalComixCreatives,
  queryGlobalComixDataBounds,
  queryGlobalComixGeo,
  queryGlobalComixKPIs,
  queryGlobalComixNetworkBreakdown,
  queryGlobalComixPayback,
  queryGlobalComixTrend,
  queryGlobalComixWeekends,
  type GlobalComixFilter,
} from "@/lib/globalcomix-queries";
import {
  queryGlobalComixNetSubTrend,
  queryGlobalComixSubsDaily,
  queryGlobalComixSubsOsMix,
} from "@/lib/globalcomix-subs-queries";
import type { OsFilter, PlatformFilter } from "@/lib/filters/types";

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
/**
 * Filter combinations the warmer prepays for. Eight combos chosen
 * deliberately (NOT the full 4 OS x 6 platform-subset cross-product):
 *
 *   1. Default (os=total, all platforms) - the URL with no filters.
 *   2. Each OS narrowed: ios, android, web.
 *   3. Each single-platform narrowing: meta, google, tiktok,
 *      apple_search_ads.
 *
 * AppLovin is not on the list because it has a coverageStart of
 * 2026-05-05 - warming a 30-day window today might cross that
 * threshold, but the cold-miss path is fine for it. The dashboard's
 * primary entry points cluster on (default, single-OS, single-platform)
 * per Looker access patterns; the full cross-product (40+ combos) earns
 * Redis pressure without matching real usage. Real usage data should
 * inform any future expansion.
 */
const WARM_FILTERS: ReadonlyArray<{ label: string; filter: GlobalComixFilter }> = [
  { label: "default", filter: {} },
  ...(["ios", "android", "web"] as OsFilter[]).map((os) => ({
    label: `os=${os}`,
    filter: { os },
  })),
  ...(["meta", "google", "tiktok", "apple_search_ads"] as PlatformFilter[]).map(
    (p) => ({ label: `platforms=${p}`, filter: { platforms: [p] } }),
  ),
];

export async function warmClientCache(client: string): Promise<WarmResult[]> {
  const today = todayUtc();
  const thirtyDaysAgo = isoDateUtc(addDaysUtc(today, -29));
  const to = isoDateUtc(today);
  const from = thirtyDaysAgo;

  // Tasks split into two layers:
  //   - "Filtered" queries get fan-out across WARM_FILTERS so each
  //     (OS, platform) combo lands a primed key.
  //   - "Filter-free" queries (data-bounds, subs lifecycle, OS-mix,
  //     attribution validation) run once per pass since they don't
  //     read the filter.
  const filteredTasks: Array<{ name: string; run: (f: GlobalComixFilter) => Promise<unknown> }> = [
    { name: "kpis", run: (f) => queryGlobalComixKPIs(client, from, to, f) },
    { name: "trend", run: (f) => queryGlobalComixTrend(client, from, to, f) },
    { name: "channel-mix", run: (f) => queryGlobalComixChannelMix(client, from, to, f) },
    { name: "network-breakdown", run: (f) => queryGlobalComixNetworkBreakdown(client, from, to, f) },
    { name: "payback", run: (f) => queryGlobalComixPayback(client, from, to, f) },
    { name: "campaigns", run: (f) => queryGlobalComixCampaigns(client, from, to, f) },
    { name: "weekends", run: (f) => queryGlobalComixWeekends(client, from, to, f) },
    { name: "geo", run: (f) => queryGlobalComixGeo(client, from, to, f) },
    { name: "creatives", run: (f) => queryGlobalComixCreatives(client, from, to, f) },
  ];

  const filterFreeTasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: "data-bounds", run: () => queryGlobalComixDataBounds(client) },
    { name: "total-subs-daily", run: () => queryGlobalComixSubsDaily(client, from, to) },
    { name: "total-subs-os-mix", run: () => queryGlobalComixSubsOsMix(client, from, to) },
    { name: "net-sub-trend", run: () => queryGlobalComixNetSubTrend(client, from, to) },
    { name: "attribution-validation", run: () => queryGlobalComixAttributionValidation(client, from, to) },
  ];

  // Build the full task list: each filtered task x each WARM_FILTERS
  // entry, plus the filter-free tasks once.
  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [];
  for (const t of filteredTasks) {
    for (const { label, filter } of WARM_FILTERS) {
      tasks.push({
        name: label === "default" ? t.name : `${t.name}[${label}]`,
        run: () => t.run(filter),
      });
    }
  }
  for (const t of filterFreeTasks) tasks.push(t);

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
