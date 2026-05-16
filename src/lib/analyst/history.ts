import "server-only";

import { queryGlobalComixNetworkBreakdown } from "@/lib/globalcomix-queries";
import type { NetworkRow } from "@/types/dashboard";

import { ANALYST_QUERY_IDS, type WeeklyHistoryRow } from "./types";

// Multi-week trailing-history pull.
//
// Anchored on the intent's period: the four (HISTORY_WEEKS) ISO weeks
// immediately PRECEDING `periodIsoStart`. The current week is NOT
// included here; consumers already have the current week in
// ReadyData.networks and the Weekly Breakdown table stacks "current"
// on top of trailing rows.
//
// Each historical week is fetched via the existing per-period network
// breakdown query (same cache layer, same metrics). Four parallel calls
// is acceptable for Phase 0: warm-cache reads cost a single Redis hit
// each, cold reads are bounded at ~2s and run in parallel so wall-clock
// stays under one query's worth of latency. A future PR can fold the
// four into one SQL window if BQ cost becomes a bottleneck.
//
// Period-agnostic by design: the anchor is whatever ISO start the
// caller passes. No literal week number, no hardcoded reference date.

// Number of trailing weeks to surface. The Week 18 reference deck shows
// three to four trailing weeks on the Weekly Breakdown slide; four
// gives the prose-writer (Phase 1) enough range to reference both
// "last week" and "Week N-2/N-3 levels" without losing context.
export const HISTORY_WEEKS = 4;

// ISO-8601 week length. Named so the date math reads as intent, not
// magic numbers.
const ISO_WEEK_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export type FetchHistoryArgs = {
  client: string;
  /** ISO date 'YYYY-MM-DD' of the CURRENT period's start. The first
   *  trailing week ends one day before this. */
  periodIsoStart: string;
  /** Number of trailing weeks to fetch. Defaults to HISTORY_WEEKS. */
  weeks?: number;
};

/**
 * Returns up to `weeks` trailing-week rows per network. Output is flat
 * (one row per network per week); ReadyData stamps it on
 * `history.networks`.
 *
 * Empty array when periodIsoStart is unparseable; the caller still
 * gets a well-formed ReadyData but with an empty history (renderer
 * falls back to no trailing rows, the prose-writer falls back to "no
 * historical context" framing).
 */
export async function fetchTrailingWeeks(
  args: FetchHistoryArgs,
): Promise<WeeklyHistoryRow[]> {
  const weeks = args.weeks ?? HISTORY_WEEKS;
  if (weeks <= 0) return [];

  const anchorMs = Date.parse(`${args.periodIsoStart}T00:00:00Z`);
  if (Number.isNaN(anchorMs)) return [];

  // Build the [start, end] ISO pair for each trailing week.
  //   Week k (k = 1..weeks):
  //     end   = anchor - ((k-1) * 7 + 1) days
  //     start = anchor - (k * 7)         days
  //   Concretely with k=1: end = anchor - 1 day, start = anchor - 7 days,
  //   so week 1 is the seven days immediately preceding `periodIsoStart`.
  const ranges: { isoStart: string; isoEnd: string; weekNumber: number }[] = [];
  for (let k = 1; k <= weeks; k++) {
    const endIso = formatIsoDate(
      new Date(anchorMs - ((k - 1) * ISO_WEEK_DAYS + 1) * MS_PER_DAY),
    );
    const startIso = formatIsoDate(
      new Date(anchorMs - k * ISO_WEEK_DAYS * MS_PER_DAY),
    );
    ranges.push({
      isoStart: startIso,
      isoEnd: endIso,
      weekNumber: isoWeekNumber(new Date(`${endIso}T00:00:00Z`)),
    });
  }

  // Parallel fetch. The per-query Redis cache absorbs repeats, so this
  // is at most four cold BQ trips on the first ever run for a given
  // client + period anchor.
  const results = await Promise.all(
    ranges.map((r) =>
      queryGlobalComixNetworkBreakdown(args.client, r.isoStart, r.isoEnd)
        .catch(() => [] as NetworkRow[]),
    ),
  );

  const rows: WeeklyHistoryRow[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const networks = results[i];
    for (const net of networks) {
      rows.push({
        network: net.network,
        weekIsoStart: range.isoStart,
        weekIsoEnd: range.isoEnd,
        weekNumber: range.weekNumber,
        weekLabel: buildWeekLabel(range.isoStart, range.isoEnd, range.weekNumber),
        metrics: net,
      });
    }
  }
  return rows;
}

/** queryId catalogue export so callers know which BQ query underpins history. */
export const HISTORY_QUERY_IDS = [
  ANALYST_QUERY_IDS.NETWORK_BREAKDOWN,
] as const;

// ── helpers ────────────────────────────────────────────────────────────

function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ISO-8601 week number. Standard algorithm: shift to nearest Thursday,
// then count weeks since the Thursday of week 1 of that year. Returns
// an integer in 1..53.
function isoWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7,
  );
}

// Builds a deck-friendly label: "Apr 27 to May 3 (Week 18)".
// Period-agnostic: the dates and week number are derived from the
// range, never from a hardcoded reference.
function buildWeekLabel(
  isoStart: string,
  isoEnd: string,
  weekNumber: number,
): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(isoStart)} to ${fmt(isoEnd)} (Week ${weekNumber})`;
}
