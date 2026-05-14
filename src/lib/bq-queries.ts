import "server-only";

import { unstable_cache } from "next/cache";
import { getBigQueryClient } from "@/lib/bq";
import { toBounds } from "@/lib/bq-coerce";
// Re-export so `@/lib/bq-queries` remains the canonical surface for the
// helper — `bq-queries-100play.ts` and the unit tests import it from here.
export { toBounds } from "@/lib/bq-coerce";
import { getSchemaForClient, getTableForClient } from "@/lib/bq-security";
import { serverEnv } from "@/lib/env.server";
import {
  queryGlobalComixCampaigns,
  queryGlobalComixChannelMix,
  queryGlobalComixDataAsOf,
  queryGlobalComixDataBounds,
  queryGlobalComixKPIs,
  queryGlobalComixNetworkBreakdown,
  queryGlobalComixPayback,
  queryGlobalComixTrend,
} from "@/lib/globalcomix-queries";
import type {
  KPIData,
  BQTrendPoint,
  ChannelBreakdown,
  CampaignRow,
  FreshnessData,
  DataBounds,
  NetworkRow,
  PaybackPoint,
} from "@/types/dashboard";

/** Reject anything that isn't a YYYY-MM-DD date before it touches SQL. */
function assertIsoDate(val: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    throw new InvalidDateError(`Invalid ${name}: ${val}`);
  }
}

export class InvalidDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDateError";
  }
}

const BQ_LOCATION = "US";

/** Builds the trailing predicate appended to a WHERE clause: either ""
 *  (no dedupe needed) or " AND (<predicate>)" (e.g. Playw3's breakdown
 *  filter). The predicate text comes from `bq-security.ts` and is never
 *  derived from user input — safe to interpolate. */
function dedupeAnd(client: string): string {
  const { dedupePredicate } = getSchemaForClient(client);
  return dedupePredicate ? ` AND (${dedupePredicate})` : "";
}

// ── KPI totals + period-over-period deltas ─────────────────────────────────
async function _queryDashboardKPIs(
  client: string,
  from: string,
  to: string,
): Promise<KPIData> {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  // Multi-source clients (e.g. globalcomix) don't have a single table to
  // FROM — they UNION across per-network warehouse tables and join a
  // cohort for ROAS. The dispatch happens here so the cached export
  // surface stays a single function and the API routes don't have to
  // branch on client strategy.
  if (getSchemaForClient(client).strategy === "multi-source") {
    return queryGlobalComixKPIs(client, from, to);
  }
  const table = getTableForClient(client);
  const { spendCol, revenueCol } = getSchemaForClient(client);
  const dedupe = dedupeAnd(client);
  const bq = getBigQueryClient();

  // `current` is reserved at CTE position in BigQuery — use `curr`.
  const query = `
    WITH curr AS (
      SELECT
        SUM(${spendCol})   AS spend,
        SUM(installs)      AS installs,
        SAFE_DIVIDE(SUM(${spendCol}), NULLIF(SUM(installs), 0)) AS cpi,
        SAFE_DIVIDE(SUM(${revenueCol}), NULLIF(SUM(${spendCol}), 0)) AS roas
      FROM ${table}
      WHERE date BETWEEN @from AND @to${dedupe}
    ),
    prev AS (
      SELECT
        SUM(${spendCol})   AS spend,
        SUM(installs)      AS installs,
        SAFE_DIVIDE(SUM(${spendCol}), NULLIF(SUM(installs), 0)) AS cpi,
        SAFE_DIVIDE(SUM(${revenueCol}), NULLIF(SUM(${spendCol}), 0)) AS roas
      FROM ${table}
      WHERE date BETWEEN
        DATE_SUB(DATE(@from), INTERVAL DATE_DIFF(DATE(@to), DATE(@from), DAY) + 1 DAY)
        AND DATE_SUB(DATE(@from), INTERVAL 1 DAY)${dedupe}
    )
    SELECT
      c.spend,
      c.installs,
      c.cpi,
      c.roas,
      SAFE_DIVIDE(c.spend - p.spend, NULLIF(p.spend, 0)) AS spend_delta,
      SAFE_DIVIDE(c.installs - p.installs, NULLIF(p.installs, 0)) AS installs_delta,
      SAFE_DIVIDE(c.cpi - p.cpi, NULLIF(p.cpi, 0)) AS cpi_delta,
      SAFE_DIVIDE(c.roas - p.roas, NULLIF(p.roas, 0)) AS roas_delta
    FROM curr c, prev p
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  const r = rows[0] ?? {};
  return {
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    cpi: numberish(r.cpi),
    roas: numberish(r.roas),
    // Deltas stay `null` when the previous period was zero so the UI can
    // distinguish "no change" from "no prior baseline".
    spendDelta: numberOrNull(r.spend_delta),
    installsDelta: numberOrNull(r.installs_delta),
    cpiDelta: numberOrNull(r.cpi_delta),
    roasDelta: numberOrNull(r.roas_delta),
  };
}

// ── Daily trend series ──────────────────────────────────────────────────────
async function _queryTrend(
  client: string,
  from: string,
  to: string,
): Promise<BQTrendPoint[]> {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (getSchemaForClient(client).strategy === "multi-source") {
    return queryGlobalComixTrend(client, from, to);
  }
  const table = getTableForClient(client);
  const { spendCol, revenueCol } = getSchemaForClient(client);
  const dedupe = dedupeAnd(client);
  const bq = getBigQueryClient();

  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', date) AS date,
      SUM(${spendCol}) AS spend,
      SUM(installs)    AS installs,
      SAFE_DIVIDE(SUM(${spendCol}), NULLIF(SUM(installs), 0)) AS cpi,
      SAFE_DIVIDE(SUM(${revenueCol}), NULLIF(SUM(${spendCol}), 0)) AS roas
    FROM ${table}
    WHERE date BETWEEN @from AND @to${dedupe}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    date: String(r.date),
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    cpi: numberish(r.cpi),
    roas: numberish(r.roas),
  }));
}

// ── Channel mix: spend share by network ────────────────────────────────────
async function _queryChannelMix(
  client: string,
  from: string,
  to: string,
): Promise<ChannelBreakdown[]> {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (getSchemaForClient(client).strategy === "multi-source") {
    return queryGlobalComixChannelMix(client, from, to);
  }
  const table = getTableForClient(client);
  const { spendCol } = getSchemaForClient(client);
  const dedupe = dedupeAnd(client);
  const bq = getBigQueryClient();

  const query = `
    WITH totals AS (
      SELECT SUM(${spendCol}) AS grand_total
      FROM ${table}
      WHERE date BETWEEN @from AND @to${dedupe}
    )
    SELECT
      network,
      SUM(${spendCol}) AS spend,
      SAFE_DIVIDE(SUM(${spendCol}), MAX(totals.grand_total)) AS share
    FROM ${table}, totals
    WHERE date BETWEEN @from AND @to${dedupe}
    GROUP BY network
    ORDER BY spend DESC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    network: normalizeNetwork(String(r.network ?? "Unknown")),
    spend: numberish(r.spend),
    share: numberish(r.share),
  }));
}

/**
 * Maps the underlying provider IDs from the agent tables (e.g. "facebook",
 * "apple") to the display labels yellowHEAD analysts expect ("Meta",
 * "Apple Search Ads"). Anything we don't know about is title-cased so the
 * dashboard stays presentable instead of leaking the raw column value.
 */
function normalizeNetwork(raw: string): string {
  const key = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    facebook: "Meta",
    meta: "Meta",
    fb: "Meta",
    google: "Google",
    googleads: "Google",
    tiktok: "TikTok",
    appsflyer: "AppsFlyer",
    apple: "Apple Search Ads",
    asa: "Apple Search Ads",
    twitter: "Twitter",
    x: "Twitter",
  };
  if (map[key]) return map[key];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Campaign table (top 100 by spend) ──────────────────────────────────────
async function _queryCampaigns(
  client: string,
  from: string,
  to: string,
): Promise<CampaignRow[]> {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (getSchemaForClient(client).strategy === "multi-source") {
    return queryGlobalComixCampaigns(client, from, to);
  }
  const table = getTableForClient(client);
  const { spendCol, revenueCol } = getSchemaForClient(client);
  const dedupe = dedupeAnd(client);
  const bq = getBigQueryClient();

  const query = `
    WITH curr AS (
      SELECT
        campaign_id,
        ANY_VALUE(campaign_name) AS campaign_name,
        ANY_VALUE(network) AS network,
        SUM(${spendCol}) AS spend,
        SUM(installs) AS installs,
        SAFE_DIVIDE(SUM(${spendCol}), NULLIF(SUM(installs), 0)) AS cpi,
        SAFE_DIVIDE(SUM(${revenueCol}), NULLIF(SUM(${spendCol}), 0)) AS roas
      FROM ${table}
      WHERE date BETWEEN @from AND @to${dedupe}
      GROUP BY campaign_id
    ),
    prev AS (
      SELECT
        campaign_id,
        SUM(${spendCol}) AS spend
      FROM ${table}
      WHERE date BETWEEN
        DATE_SUB(DATE(@from), INTERVAL DATE_DIFF(DATE(@to), DATE(@from), DAY) + 1 DAY)
        AND DATE_SUB(DATE(@from), INTERVAL 1 DAY)${dedupe}
      GROUP BY campaign_id
    )
    SELECT
      c.campaign_id,
      c.campaign_name,
      c.network,
      c.spend,
      c.installs,
      c.cpi,
      c.roas,
      SAFE_DIVIDE(c.spend - p.spend, NULLIF(p.spend, 0)) AS spend_delta
    FROM curr c
    LEFT JOIN prev p USING (campaign_id)
    ORDER BY c.spend DESC
    LIMIT 100
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    campaign_id: String(r.campaign_id ?? ""),
    campaign_name: String(r.campaign_name ?? ""),
    network: normalizeNetwork(String(r.network ?? "")),
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    cpi: numberish(r.cpi),
    roas: numberish(r.roas),
    spendDelta: numberOrNull(r.spend_delta),
  }));
}

// ── Per-network full performance row ───────────────────────────────────────
// Multi-source only. Agent-strategy clients return an empty array — they
// don't have the click/impression/multi-window-revenue fields the
// network-breakdown table renders.
async function _queryNetworkBreakdown(
  client: string,
  from: string,
  to: string,
): Promise<NetworkRow[]> {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (getSchemaForClient(client).strategy !== "multi-source") {
    return [];
  }
  return queryGlobalComixNetworkBreakdown(client, from, to);
}

// ── Cohort payback curve (D0 → D90) ────────────────────────────────────────
async function _queryPayback(
  client: string,
  from: string,
  to: string,
): Promise<PaybackPoint[]> {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (getSchemaForClient(client).strategy !== "multi-source") {
    return [];
  }
  return queryGlobalComixPayback(client, from, to);
}

// ── Earliest/latest dates with spend > 0 for a client ──────────────────────
// Used by the dashboard to auto-snap the active window when the user is
// looking at a date range with no data at all. Bounds change slowly, so the
// cache TTL is long (24h) vs the per-window KPI cache (30 min).
async function _queryDataBounds(client: string): Promise<DataBounds> {
  if (getSchemaForClient(client).strategy === "multi-source") {
    return queryGlobalComixDataBounds(client);
  }
  const table = getTableForClient(client);
  const { spendCol } = getSchemaForClient(client);
  const dedupe = dedupeAnd(client);
  const bq = getBigQueryClient();

  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', MIN(date)) AS earliest,
      FORMAT_DATE('%Y-%m-%d', MAX(date)) AS latest
    FROM ${table}
    WHERE ${spendCol} > 0${dedupe}
  `;
  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  return toBounds(rows[0]);
}

// ── Data freshness from Rivery telemetry ────────────────────────────────────
async function _queryFreshness(client?: string): Promise<FreshnessData> {
  const bq = getBigQueryClient();

  // Note the dataset is literally `rivery_activity_anlytics` (typo upstream
  // — confirmed in BQ). The view exposes one row per river/date; the
  // freshest `date` is the closest signal we have to "data last landed".
  const query = `
    SELECT MAX(date) AS last_updated
    FROM \`${serverEnv.BQ_PROJECT}.rivery_activity_anlytics.v_rivery_activity_check\`
    WHERE date IS NOT NULL
  `;

  // Per-client `dataAsOf`: MAX(date) across the warehouse tables that back
  // this client. Runs in parallel with the Rivery query. Errors are
  // swallowed and surface as `null` in the response — the UI degrades to
  // hiding the date label, the dot still shows the Rivery signal.
  const dataAsOfPromise: Promise<string | null> =
    client && getSchemaForClient(client).strategy === "multi-source"
      ? queryGlobalComixDataAsOf(client).catch((err) => {
          console.error(
            "[bq:freshness:data-as-of]",
            err instanceof Error ? err.message : err,
          );
          return null;
        })
      : Promise.resolve(null);

  try {
    const [[rows], dataAsOf] = await Promise.all([
      bq.query({ query, location: BQ_LOCATION }),
      dataAsOfPromise,
    ]);
    const raw = rows[0]?.last_updated;
    // BQ DATE columns come back as `{ value: "YYYY-MM-DD" }`.
    const dateStr =
      raw && typeof raw === "object" && "value" in raw
        ? (raw as { value: string }).value
        : (raw as string | null | undefined);
    if (!dateStr) throw new Error("no timestamp");
    // Treat the BQ DATE as UTC midnight to anchor the "hours ago" math.
    const ts = new Date(`${dateStr}T00:00:00Z`).getTime();
    if (!Number.isFinite(ts)) throw new Error("invalid date");
    const lastUpdated = new Date(ts).toISOString();
    const hoursAgo = Math.max(0, Math.round((Date.now() - ts) / 3_600_000));
    return { lastUpdated, hoursAgo, dataAsOf };
  } catch (err) {
    // Don't crash the dashboard if freshness fails; surface -1 for the UI
    // gray-dot state, log server-side for debugging. `dataAsOf` may still
    // resolve, so we surface whatever the per-client query returned.
    console.error("[bq:freshness]", err instanceof Error ? err.message : err);
    const dataAsOf = await dataAsOfPromise.catch(() => null);
    return {
      lastUpdated: new Date().toISOString(),
      hoursAgo: -1,
      dataAsOf,
    };
  }
}

// ── Cached exports (Next route-handler cache, 30 min TTL) ──────────────────
// Each query is keyed by the variable arguments via the cache-key array so
// switching client or date range produces a separate cache entry.

const REVALIDATE_SECONDS = 1800;

export const queryDashboardKPIs = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(_queryDashboardKPIs, ["bq:kpis", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const queryTrend = (client: string, from: string, to: string) =>
  unstable_cache(_queryTrend, ["bq:trend", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const queryChannelMix = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(_queryChannelMix, ["bq:channel-mix", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const queryCampaigns = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(_queryCampaigns, ["bq:campaigns", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const queryNetworkBreakdown = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(
    _queryNetworkBreakdown,
    ["bq:network-breakdown", client, from, to],
    { revalidate: REVALIDATE_SECONDS, tags: ["bq", `bq:${client}`] },
  )(client, from, to);

export const queryPayback = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(
    _queryPayback,
    ["bq:payback", client, from, to],
    { revalidate: REVALIDATE_SECONDS, tags: ["bq", `bq:${client}`] },
  )(client, from, to);

// `client` is part of the cache key so each client gets its own dataAsOf;
// when undefined (e.g. a generic freshness ping with no active client),
// the cache key still differs from the per-client entries.
export const queryFreshness = (client?: string) =>
  unstable_cache(
    _queryFreshness,
    ["bq:freshness", client ?? "_anon"],
    {
      revalidate: 600,
      tags: ["bq", "bq:freshness"],
    },
  )(client);

export const queryDataBounds = (client: string) =>
  unstable_cache(_queryDataBounds, ["bq:data-bounds", client], {
    revalidate: 86_400,
    tags: ["bq", `bq:${client}`],
  })(client);

// BigQuery returns numerics in three shapes:
//  - plain number (FLOAT64 in the small-int range),
//  - string (NUMERIC / BIGNUMERIC for precision),
//  - `{ value: "..." }` object (the legacy BigQueryInt path),
//  - BigQueryInt class instance (has `.toNumber()` and `.value`).
// `numberish` coerces all of them to a plain number and treats null/NaN
// as zero — for KPI totals where "missing" should read as "0 spend".
function numberish(v: unknown): number {
  const n = toNumber(v);
  return n == null || !Number.isFinite(n) ? 0 : n;
}

// Same coercion but preserves `null` for fields where "no value" needs to
// be distinguished from "zero" (deltas, where a null prev-period must not
// render as "+0.0%").
function numberOrNull(v: unknown): number | null {
  const n = toNumber(v);
  return n == null || !Number.isFinite(n) ? null : n;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (typeof v === "object") {
    // BigQueryInt class instance: prefer `toNumber()` so very large 64-bit
    // ints don't round through `Number(stringValue)`.
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
