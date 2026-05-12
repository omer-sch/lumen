import "server-only";

import { unstable_cache } from "next/cache";
import { getBigQueryClient } from "@/lib/bq";
import { assertClientAllowed, assertIs100playClient } from "@/lib/bq-security";
import { serverEnv } from "@/lib/env.server";
import { InvalidDateError, toBounds } from "@/lib/bq-queries";
import type {
  KPIData,
  BQTrendPoint,
  ChannelBreakdown,
  CampaignRow,
  DataBounds,
} from "@/types/dashboard";

/**
 * 100play query layer — Lumen-union strategy.
 *
 * 100play does NOT have an agent view in BigQuery. Lumen queries the raw
 * warehouse table directly and normalizes the output to the same wire shape
 * the agent-layer clients produce, so `useDashboardData` stays branchless.
 *
 * ── Phase 2 decisions, anchored in `100play_schema.md` ──────────────────────
 *
 *  Q1 — Does the primary table have spend AND installs with non-null values?
 *       NO. `dwh_fb2_ios14_appsflyer_100play` has `cost_usd` (3.3% null) but
 *       NO `installs` column at all, despite the table name suggesting an
 *       AppsFlyer join. `rev_lifetime_usd` exists but is 93% NULL and the
 *       remaining rows sum to 0 — treat as no revenue. So this client is
 *       SPEND-ONLY: Installs / CPI / ROAS tiles are not meaningful and must
 *       be hidden in the UI (mirrored by `getClientCoverage("100play")`).
 *
 *  Q2 — Do the two dwh tables cover non-overlapping date ranges?
 *       NO — the secondary `dwh_fb2_100play` stopped landing on 2023-12-12
 *       (2+ years stale). The primary covers 2023-09-27 → 2026-05-10. The
 *       38 overlap days have wildly different aggregation grain (primary is
 *       a per-(date, account) rollup; secondary is ad-level fan-out), so a
 *       UNION would double-count spend on those days while contributing
 *       nothing new for any date since Dec 2023. Use the primary ALONE.
 *
 *  Q3 — Does the primary have campaign_id / campaign_name / network?
 *       NO. None of the three exist on the primary. Channel-mix is therefore
 *       synthesized as a single "Meta = 100%" row; campaigns returns an
 *       empty list. When 100play needs a working Campaigns page, it'll need
 *       a new pre-joined table from the data team — out of scope here.
 *
 * The `date` column is STRING (YYYY-MM-DD), not DATE — comparisons stay on
 * the string side and prev-period bounds are computed in JS to avoid casting
 * the column on every row.
 */

const BQ_LOCATION = "US";

// Column identifiers, all server-side constants — never client-controlled.
const PRIMARY_TABLE = "dwh_fb2_ios14_appsflyer_100play";
const SPEND_COL = "cost_usd";
const DATE_COL = "date";
// `rev_lifetime_usd` exists but is empty in practice; keep the constant for
// the day it starts landing, but ROAS will read as 0 until then.
const REVENUE_COL = "rev_lifetime_usd";

function assertIsoDate(val: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    throw new InvalidDateError(`Invalid ${name}: ${val}`);
  }
}

function fqTable(): string {
  return `\`${serverEnv.BQ_PROJECT}.${serverEnv.BQ_DATASET}.${PRIMARY_TABLE}\``;
}

/** Inclusive previous window of the same length, ending the day before `from`. */
function prevWindow(from: string, to: string): { prevFrom: string; prevTo: string } {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(fromDate);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  return {
    prevFrom: prevFrom.toISOString().slice(0, 10),
    prevTo: prevTo.toISOString().slice(0, 10),
  };
}

// ── KPI totals + period-over-period deltas ─────────────────────────────────
async function _queryDashboardKPIs(
  client: string,
  from: string,
  to: string,
): Promise<KPIData> {
  assertClientAllowed(client);
  assertIs100playClient(client);
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");

  const { prevFrom, prevTo } = prevWindow(from, to);
  const table = fqTable();
  const bq = getBigQueryClient();

  // No installs column → installs / cpi expressions return NULL → numberish
  // coerces to 0 → UI hides those tiles via `getClientCoverage`.
  const query = `
    WITH curr AS (
      SELECT
        SUM(${SPEND_COL})                                              AS spend,
        SAFE_DIVIDE(SUM(${REVENUE_COL}), NULLIF(SUM(${SPEND_COL}), 0)) AS roas
      FROM ${table}
      WHERE ${DATE_COL} BETWEEN @from AND @to
    ),
    prev AS (
      SELECT
        SUM(${SPEND_COL})                                              AS spend,
        SAFE_DIVIDE(SUM(${REVENUE_COL}), NULLIF(SUM(${SPEND_COL}), 0)) AS roas
      FROM ${table}
      WHERE ${DATE_COL} BETWEEN @prev_from AND @prev_to
    )
    SELECT
      c.spend,
      CAST(NULL AS INT64)   AS installs,
      CAST(NULL AS FLOAT64) AS cpi,
      c.roas,
      SAFE_DIVIDE(c.spend - p.spend, NULLIF(p.spend, 0)) AS spend_delta,
      CAST(NULL AS FLOAT64) AS installs_delta,
      CAST(NULL AS FLOAT64) AS cpi_delta,
      SAFE_DIVIDE(c.roas  - p.roas,  NULLIF(p.roas,  0)) AS roas_delta
    FROM curr c, prev p
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to, prev_from: prevFrom, prev_to: prevTo },
    location: BQ_LOCATION,
  });
  const r = rows[0] ?? {};
  return {
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    cpi: numberish(r.cpi),
    roas: numberish(r.roas),
    spendDelta: numberOrNull(r.spend_delta),
    installsDelta: numberOrNull(r.installs_delta),
    cpiDelta: numberOrNull(r.cpi_delta),
    roasDelta: numberOrNull(r.roas_delta),
  };
}

// ── Daily trend series ─────────────────────────────────────────────────────
async function _queryTrend(
  client: string,
  from: string,
  to: string,
): Promise<BQTrendPoint[]> {
  assertClientAllowed(client);
  assertIs100playClient(client);
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  const table = fqTable();
  const bq = getBigQueryClient();

  const query = `
    SELECT
      ${DATE_COL}      AS date,
      SUM(${SPEND_COL}) AS spend,
      0                 AS installs,
      0                 AS cpi,
      SAFE_DIVIDE(SUM(${REVENUE_COL}), NULLIF(SUM(${SPEND_COL}), 0)) AS roas
    FROM ${table}
    WHERE ${DATE_COL} BETWEEN @from AND @to
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });
  return rows.map((r: Record<string, unknown>) => ({
    date: String(r.date ?? ""),
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    cpi: numberish(r.cpi),
    roas: numberish(r.roas),
  }));
}

// ── Channel mix: synthesized single-network row ────────────────────────────
async function _queryChannelMix(
  client: string,
  from: string,
  to: string,
): Promise<ChannelBreakdown[]> {
  assertClientAllowed(client);
  assertIs100playClient(client);
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  const table = fqTable();
  const bq = getBigQueryClient();

  // No `network` column on the primary — 100play is Meta-only. Return the
  // total as a single Meta row so the ChannelMix component still renders.
  const query = `
    SELECT SUM(${SPEND_COL}) AS spend
    FROM ${table}
    WHERE ${DATE_COL} BETWEEN @from AND @to
  `;
  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });
  const spend = numberish(rows[0]?.spend);
  if (spend <= 0) return [];
  return [{ network: "Meta", spend, share: 1 }];
}

// ── Earliest/latest dates with non-null spend ───────────────────────────────
// The primary table extends to 2026 but ~97% of rows have NULL `cost_usd`.
// Bounds let the dashboard auto-snap to the date window that actually has
// data — see `useDashboardData` for the trigger.
async function _queryDataBounds(client: string): Promise<DataBounds> {
  assertClientAllowed(client);
  assertIs100playClient(client);
  const bq = getBigQueryClient();
  const query = `
    SELECT MIN(${DATE_COL}) AS earliest, MAX(${DATE_COL}) AS latest
    FROM ${fqTable()}
    WHERE ${SPEND_COL} IS NOT NULL AND ${SPEND_COL} > 0
  `;
  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  return toBounds(rows[0]);
}

// ── Campaigns: not available for 100play ───────────────────────────────────
async function _queryCampaigns(
  client: string,
  _from: string,
  _to: string,
): Promise<CampaignRow[]> {
  // Allowlist still enforced even though we return empty — keeps the
  // 403/forbidden path consistent across routes.
  assertClientAllowed(client);
  assertIs100playClient(client);
  // Primary has no campaign_id / campaign_name / network. Returning an empty
  // list lets the API route succeed; the page renders its empty state.
  return [];
}

// ── Cached exports — same TTL and tag shape as the agent-layer queries ────
const REVALIDATE_SECONDS = 1800;

export const query100playKPIs = (client: string, from: string, to: string) =>
  unstable_cache(_queryDashboardKPIs, ["bq:kpis:100play", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const query100playTrend = (client: string, from: string, to: string) =>
  unstable_cache(_queryTrend, ["bq:trend:100play", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const query100playChannelMix = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(_queryChannelMix, ["bq:channel-mix:100play", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const query100playCampaigns = (
  client: string,
  from: string,
  to: string,
) =>
  unstable_cache(_queryCampaigns, ["bq:campaigns:100play", client, from, to], {
    revalidate: REVALIDATE_SECONDS,
    tags: ["bq", `bq:${client}`],
  })(client, from, to);

export const query100playDataBounds = (client: string) =>
  unstable_cache(_queryDataBounds, ["bq:data-bounds:100play", client], {
    revalidate: 86_400,
    tags: ["bq", `bq:${client}`],
  })(client);

// Numeric coercion — same semantics as bq-queries.ts. Kept local so this
// module has no internal-only imports from the agent-layer file.
function numberish(v: unknown): number {
  const n = toNumber(v);
  return n == null || !Number.isFinite(n) ? 0 : n;
}
function numberOrNull(v: unknown): number | null {
  const n = toNumber(v);
  return n == null || !Number.isFinite(n) ? null : n;
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
