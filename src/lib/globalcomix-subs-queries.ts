import "server-only";

import { withRedisCache } from "@/lib/cache/with-redis-cache";
import { getBigQueryClient } from "@/lib/bq";
import { qualifyTable } from "@/lib/bq-security";
import type { OsFilter } from "@/lib/filters/types";

/**
 * Subscriber lifecycle queries — sourced from `dwh_total_subs_globalcomix`.
 *
 * The table is a daily aggregate per `(event_date, os, sub_type)` where
 * `sub_type ∈ {'subscribe', 'unsubscribe'}` and `os ∈ {'iOS', 'Android',
 * 'Web'}`. Distinct from the cohort table — this one tracks ALL subs
 * (paid + organic), so the Lifecycle frame on the dashboard reads the
 * total Sub / Churn / Net Sub story rather than the paid-cohort slice.
 *
 * Future-date guard: the warehouse has rows with `event_date` up to
 * 2027-03-17 (open question — see Lumen Vault BQ investigation report).
 * Filter to `event_date <= CURRENT_DATE()` on every query so those rows
 * don't quietly inflate forward-looking totals.
 */

const BQ_LOCATION = "US";

// Table identifier is server-side, never client-controlled — safe to
// interpolate into SQL. The WS3 investigation confirmed this is the only
// reachable Sub / Churn rollup; the v_agent_globalcomix path is dead.
const SUBS_TABLE_NAME = "dwh_total_subs_globalcomix";

const DAILY_TTL_S = 60 * 60 * 12; // 12h, same as the dashboard's other queries

/** Filter clause for an OS slice. `total` emits no predicate. */
function osPredicate(os: OsFilter): string {
  if (os === "total") return "";
  // OS column is stored with mixed casing ("iOS" / "Android" / "Web"); we
  // normalize to lowercase in the predicate. The `os` value is whitelisted
  // by the `OsFilter` type so it cannot inject SQL.
  return ` AND LOWER(os) = '${os}'`;
}

export type SubsDailyRow = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Canonical OS label as the warehouse stores it ("iOS", "Android", "Web"). */
  os: string;
  /** New subscribers landed this day for this OS. */
  subs: number;
  /** Cancellations / churns this day for this OS. */
  churn: number;
  /** subs - churn. Can be negative. */
  netSub: number;
};

async function _queryGlobalComixSubsDaily(
  client: string,
  from: string,
  to: string,
  os: OsFilter = "total",
): Promise<SubsDailyRow[]> {
  const bq = getBigQueryClient();
  const fq = qualifyTable(SUBS_TABLE_NAME);

  // Per-day, per-OS pivot of subscribe vs unsubscribe. Net Sub is
  // derived in the SELECT so consumers don't have to re-derive from the
  // pivot. The future-date guard runs even when the caller's `to` is in
  // the past, because a partial backfill could leave 2027-XX rows mixed
  // into a near-term window.
  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', event_date) AS date,
      os,
      SUM(CASE WHEN sub_type = 'subscribe'   THEN sub_count ELSE 0 END) AS subs,
      SUM(CASE WHEN sub_type = 'unsubscribe' THEN sub_count ELSE 0 END) AS churn,
      SUM(CASE WHEN sub_type = 'subscribe'   THEN sub_count ELSE 0 END)
        - SUM(CASE WHEN sub_type = 'unsubscribe' THEN sub_count ELSE 0 END) AS net_sub
    FROM ${fq}
    WHERE event_date BETWEEN @from AND @to
      AND event_date <= CURRENT_DATE()${osPredicate(os)}
    GROUP BY event_date, os
    ORDER BY event_date, os
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    date: String(r.date),
    os: String(r.os ?? "Unknown"),
    subs: numberish(r.subs),
    churn: numberish(r.churn),
    netSub: numberish(r.net_sub),
  }));
}

export type SubsOsMixRow = {
  /** Canonical OS label. */
  os: string;
  /** Total new subs landed in the period for this OS. */
  subs: number;
  /** Share of total subs (0..1). */
  share: number;
};

async function _queryGlobalComixSubsOsMix(
  client: string,
  from: string,
  to: string,
): Promise<SubsOsMixRow[]> {
  const bq = getBigQueryClient();
  const fq = qualifyTable(SUBS_TABLE_NAME);

  // OS donut: subs by iOS / Android / Web in the active window. The
  // Lifecycle frame ignores the dashboard's global OS filter (you want
  // to see all three rings even when the rest of the dashboard is iOS-
  // only) so this query takes no os param.
  const query = `
    WITH per_os AS (
      SELECT
        os,
        SUM(sub_count) AS subs
      FROM ${fq}
      WHERE event_date BETWEEN @from AND @to
        AND event_date <= CURRENT_DATE()
        AND sub_type = 'subscribe'
      GROUP BY os
    ),
    total AS (
      SELECT SUM(subs) AS total FROM per_os
    )
    SELECT
      p.os,
      p.subs,
      SAFE_DIVIDE(p.subs, NULLIF(t.total, 0)) AS share
    FROM per_os p, total t
    WHERE p.subs > 0
    ORDER BY p.subs DESC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    os: String(r.os ?? "Unknown"),
    subs: numberish(r.subs),
    share: numberish(r.share),
  }));
}

export type NetSubPoint = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** subs - churn across all OS (or filtered to `os` when set). */
  netSub: number;
};

async function _queryGlobalComixNetSubTrend(
  client: string,
  from: string,
  to: string,
  os: OsFilter = "total",
): Promise<NetSubPoint[]> {
  const bq = getBigQueryClient();
  const fq = qualifyTable(SUBS_TABLE_NAME);

  // One point per day. The OS filter, when applied, narrows both subs
  // and churns to that platform; the chart legend on the dashboard reads
  // "Net Sub (iOS)" etc. so the meaning of the bar is unambiguous.
  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', event_date) AS date,
      SUM(CASE WHEN sub_type = 'subscribe'   THEN sub_count ELSE 0 END)
        - SUM(CASE WHEN sub_type = 'unsubscribe' THEN sub_count ELSE 0 END) AS net_sub
    FROM ${fq}
    WHERE event_date BETWEEN @from AND @to
      AND event_date <= CURRENT_DATE()${osPredicate(os)}
    GROUP BY event_date
    ORDER BY event_date
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    date: String(r.date),
    netSub: numberish(r.net_sub),
  }));
}

// ── Cached exports (Upstash Redis, per-client keys) ────────────────────────

export const queryGlobalComixSubsDaily = (
  client: string,
  from: string,
  to: string,
  os: OsFilter = "total",
) =>
  withRedisCache(
    {
      client,
      query: "total-subs-daily",
      params: { from, to, os },
      ttlSeconds: DAILY_TTL_S,
    },
    () => _queryGlobalComixSubsDaily(client, from, to, os),
  );

export const queryGlobalComixSubsOsMix = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "total-subs-os-mix",
      params: { from, to },
      ttlSeconds: DAILY_TTL_S,
    },
    () => _queryGlobalComixSubsOsMix(client, from, to),
  );

export const queryGlobalComixNetSubTrend = (
  client: string,
  from: string,
  to: string,
  os: OsFilter = "total",
) =>
  withRedisCache(
    {
      client,
      query: "net-sub-trend",
      params: { from, to, os },
      ttlSeconds: DAILY_TTL_S,
    },
    () => _queryGlobalComixNetSubTrend(client, from, to, os),
  );

// ── BigQuery number coercion (shared shape with globalcomix-queries.ts) ────

function numberish(v: unknown): number {
  const n = toNumber(v);
  return n == null || !Number.isFinite(n) ? 0 : n;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (typeof v === "object") {
    const maybe = v as { toNumber?: () => number; value?: unknown };
    if (typeof maybe.toNumber === "function") {
      try {
        return maybe.toNumber();
      } catch {
        /* fall through */
      }
    }
    if ("value" in maybe) return Number(maybe.value);
  }
  return null;
}
