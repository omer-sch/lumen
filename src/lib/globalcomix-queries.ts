import "server-only";

import { withRedisCache } from "@/lib/cache/with-redis-cache";
import { getBigQueryClient } from "@/lib/bq";
import { getMultiSourceConfig, qualifyTable } from "@/lib/bq-security";
import type {
  BQTrendPointByNetwork,
  CampaignRow,
  ChannelBreakdown,
  DataBounds,
  KPIData,
  NetworkRow,
  PaybackPoint,
} from "@/types/dashboard";
import { toBounds } from "@/lib/bq-coerce";

/**
 * GlobalComix lives on the per-network warehouse tables
 * (`dwh_fb2_*`, `dwh_google_ads_*`, `dwh_tik_tok_*`, `dwh_apple_*`) plus a
 * cohort table (`uni_adjust_cohort_report_globalcomix`) for D7 ROAS.
 *
 * The historic agent view (`v_agent_globalcomix`) was abandoned upstream
 * (last refreshed ~5 weeks ago); this module replaces that path with the
 * raw warehouse tables UNION'd at query time and revenue joined in from
 * the cohort.
 *
 * Why this is not the generic `bq-queries.ts` path:
 *   1. There is no single table to FROM — spend comes from four sources.
 *   2. D7 revenue is keyed by network attribution in a different
 *      vocabulary than the spend tables (`Google Ads ACI` vs `Google`),
 *      so the join is a normalize-then-aggregate, not a column lookup.
 *   3. Google has a known iOS attribution gap; the cohort join filters
 *      those rows out so the headline CPI/ROAS does not eat a $4k+ CPI
 *      artifact.
 *
 * SQL safety: every identifier inside these queries comes from
 * `bq-security.ts` (hardcoded), and every date parameter is bound
 * positionally — nothing here is interpolated from request input.
 */

const BQ_LOCATION = "US";

const FROM = "@from";
const TO = "@to";

// ── Reusable subqueries ─────────────────────────────────────────────────────

/**
 * UNION ALL across the four per-network spend tables. Each leg projects
 * a uniform `(date, network, cost_usd, installs, campaign_id, campaign_name)`
 * tuple. `breakdown_type='No Breakdown'` is the dedupe slice — every
 * other slice in these tables is the same totals partitioned by a
 * dimension (Country / Placement / Network / Creatives) and summing
 * across them triple-counts spend.
 *
 * GlobalComix doesn't expose campaign_name on dwh_fb2 or dwh_google_ads
 * `No Breakdown` rows (the column lives on slices that aren't aggregable
 * the same way), so we fall back to `campaign_id` for display.
 */
// Each per-network spend table exposes campaign_name a little
// differently:
//   - dwh_apple_globalcomix_adjust: `campaign_name` (correct)
//   - dwh_google_ads_globalcomix_adjust: `campaign_name` (verified
//     non-null on the No Breakdown slice by
//     scripts/discover-globalcomix-campaign-names.ts -- 35 names)
//   - dwh_tik_tok_globalcomix_adjust: `campaign_name` (verified -- 22)
//   - dwh_fb2_globalcomix_adjust: column is misspelled `campagin_name`
//     in the warehouse schema. Aliased to `campaign_name` here so the
//     UNION shape stays uniform; if the row's value is NULL the outer
//     COALESCE in _queryGlobalComixCampaigns falls back to campaign_id
//     (numeric).
//
// Previous version returned `NULL AS campaign_name` for everything
// except Apple, so the Campaigns table on Meta / Google / TikTok rows
// rendered campaign_id (numeric). With this map the human-readable
// name flows through wherever the underlying table provides one.
const CAMPAIGN_NAME_COLUMN_BY_TABLE: Record<string, string> = {
  dwh_apple_globalcomix_adjust: "campaign_name",
  dwh_google_ads_globalcomix_adjust: "campaign_name",
  dwh_tik_tok_globalcomix_adjust: "campaign_name",
  // AppLovin: column verified present + non-null on the No Breakdown slice
  // by the 2026-05-17 BQ investigation.
  dwh_applovin_globalcomix_adjust: "campaign_name",
  // The trailing "AS campaign_name" alias normalises the column name
  // out of the typoed Meta column.
  dwh_fb2_globalcomix_adjust: "campagin_name AS campaign_name",
};

function buildSpendSubquery(client: string): string {
  const cfg = getMultiSourceConfig(client);
  const dedupe = cfg.spendDedupePredicate;

  const legs = cfg.spendSources
    .map((src) => {
      const fq = qualifyTable(src.table);
      // Resolve the campaign_name column expression for this source.
      // Tables not in the map (e.g. a future onboarded source) fall
      // back to NULL so the SQL still parses; once the table's schema
      // is verified, add an entry to CAMPAIGN_NAME_COLUMN_BY_TABLE.
      const campaignNameExpr =
        CAMPAIGN_NAME_COLUMN_BY_TABLE[src.table] ??
        "CAST(NULL AS STRING) AS campaign_name";
      // Every source carries clicks, impressions, num_ftd7 on the `No
      // Breakdown` slice — pulled here so the unified subquery feeds the
      // engagement KPI tiles (CTR, CPM, CPC) and the FTD column on the
      // network table without a second pass over the warehouse.
      return `SELECT
        date,
        '${src.network}' AS network,
        cost_usd,
        installs,
        clicks,
        impressions,
        COALESCE(num_ftd7, 0) AS ftd_d7,
        campaign_id,
        ${campaignNameExpr}
      FROM ${fq}
      WHERE (${dedupe})`;
    })
    .join("\n      UNION ALL\n      ");

  return `(${legs})`;
}

/**
 * Cohort dimensions the subquery can group by. Every consumer passes the
 * dimensions it actually needs in `groupBy`; the subquery projects them
 * through and emits `GROUP BY` over the same set. Default is
 * `["date", "network"]` to match the pre-WS3 behavior.
 *
 *   - "date"        _Day_Date (install date)
 *   - "network"     Normalized to the spend-side display label via CASE
 *   - "os"          _OS_name (used by the WS6 OS filter and the
 *                    Subscriber Lifecycle / OS-mix views)
 *   - "country"     _Country (Geo view)
 *   - "campaign_id" CAST(_Campaign_ID AS STRING) — joins to spend
 *   - "ad_id"       _Ad_ID (Creatives view)
 *   - "creative"    _Creative_Attribution (Creatives view)
 */
export type CohortGroupBy =
  | "date"
  | "network"
  | "os"
  | "country"
  | "campaign_id"
  | "ad_id"
  | "creative";

export type CohortSubqueryOptions = {
  /** Dimensions projected and grouped by. Default ["date", "network"]
   *  to match the pre-WS3 callers. */
  groupBy?: CohortGroupBy[];
  /** When true, include 'Organic' + 'Google Organic Search' +
   *  'Untrusted Devices' as a single `network='Organic'` row. Default
   *  false — paid-only, matching the historical KPI / Trend behavior.
   *  Set true for the Paid-vs-Organic strip and any BCAC-style total. */
  includeOrganic?: boolean;
};

/**
 * Cohort-derived metrics aggregated to the caller's chosen grain.
 *
 * `_Network_Attribution` is a long-tail string column from Adjust; the
 * CASE normalizes it into the canonical display labels emitted by
 * `buildSpendSubquery` so the daily / period JOIN lines up. The
 * `includeOrganic` toggle controls whether the three Organic strings
 * resolve to `network='Organic'` (true) or NULL (false) — paid-only
 * callers (the dashboard's KPI / Trend / NetworkBreakdown) set false so
 * Organic rows don't contaminate their totals.
 *
 * Google iOS exclusion: rows where attribution looks like Google AND
 * `_OS_name='ios'` are filtered out here because Adjust attribution for
 * Google iOS is known broken (CPIs of $4k-$29k are artifacts). Surfacing
 * the warning in the UI is the user-facing half of this same call.
 *
 * Always-on metric aggregates: multi-window revenue (D0/D7/D14/D30/D90),
 * Paying Users at every window, Sub Start Events (D0/D7/D14), Trial Start
 * Events (D0/D7/D14), and the D7 retention numerator+denominator.
 * Retention is intentionally returned as the two raw sums (retained +
 * cohort size) rather than the rate — averaging an already-divided rate
 * would weight every day equally regardless of cohort size.
 */
export function buildCohortSubquery(
  client: string,
  opts: CohortSubqueryOptions = {},
): string {
  const cfg = getMultiSourceConfig(client);
  const fq = qualifyTable(cfg.cohortTable);

  const groupBy = opts.groupBy ?? ["date", "network"];
  const includeOrganic = opts.includeOrganic ?? false;

  // Each dimension renders as a `<projection> AS <output_name>` pair.
  // Order matters: the outer `GROUP BY` echoes positional indices.
  const dimensionProjections: Array<{ name: string; sql: string }> = [];
  for (const d of groupBy) {
    switch (d) {
      case "date":
        dimensionProjections.push({ name: "date", sql: "_Day_Date AS date" });
        break;
      case "network":
        // Network is a CASE; the includeOrganic flag flips whether the
        // three Organic strings resolve to 'Organic' or NULL.
        dimensionProjections.push({
          name: "network",
          sql: `CASE
        WHEN _Network_Attribution LIKE 'Google Ads%' THEN 'Google'
        WHEN _Network_Attribution IN ('Facebook Installs', 'Instagram Installs', 'Off-Facebook Installs') THEN 'Meta'
        WHEN _Network_Attribution = 'TikTok SAN' THEN 'TikTok'
        WHEN _Network_Attribution = 'Apple Search Ads' THEN 'Apple Search Ads'
        -- AppLovin attribution arrives split across the two Axon strings.
        WHEN _Network_Attribution IN ('Axon by AppLovin Android', 'Axon by AppLovin iOS') THEN 'AppLovin'
        ${includeOrganic
          ? `-- Organic bucket opted in by the caller (Paid-vs-Organic strip / BCAC totals).\n        WHEN _Network_Attribution IN ('Organic', 'Google Organic Search', 'Untrusted Devices') THEN 'Organic'`
          : `-- Organic NOT included for this caller (paid-only path); the\n        -- three Organic strings fall through to NULL below and the outer\n        -- network IS NOT NULL filter drops them.`}
        -- TODO(open-q-2): Pubmint iOS / Pubmint Android (~7.7k rows / 90d)
        -- fall through to NULL. No matching spend table exists today;
        -- awaiting Gabby's call on whether to bucket as paid or organic.
        ELSE NULL
      END AS network`,
        });
        break;
      case "os":
        dimensionProjections.push({ name: "os", sql: "_OS_name AS os" });
        break;
      case "country":
        dimensionProjections.push({
          name: "country",
          sql: "_Country AS country",
        });
        break;
      case "campaign_id":
        // STRING cast aligns with the spend-side campaign_id type.
        dimensionProjections.push({
          name: "campaign_id",
          sql: "CAST(_Campaign_ID AS STRING) AS campaign_id",
        });
        break;
      case "ad_id":
        dimensionProjections.push({
          name: "ad_id",
          sql: "CAST(_Ad_ID AS STRING) AS ad_id",
        });
        break;
      case "creative":
        dimensionProjections.push({
          name: "creative_name",
          sql: "_Creative_Attribution AS creative_name",
        });
        break;
    }
  }

  const dimensionsBlock = dimensionProjections
    .map((d) => `      ${d.sql}`)
    .join(",\n");
  const groupByBlock =
    dimensionProjections.length > 0
      ? `    GROUP BY ${dimensionProjections
          .map((_, i) => i + 1)
          .join(", ")}`
      : "";

  // Always-on metric aggregates. Adding a new metric here is intentionally
  // global: every cohort caller sees it. Costs are paid in BQ bytes
  // scanned, not query latency on this scale.
  return `(
    SELECT
${dimensionsBlock}${dimensionsBlock ? "," : ""}
      SUM(COALESCE(_0D_Revenue_Total, 0))               AS rev_d0,
      SUM(COALESCE(_7D_Revenue_Total, 0))               AS rev_d7,
      SUM(COALESCE(_14D_Revenue_Total, 0))              AS rev_d14,
      SUM(COALESCE(_30D_Revenue_Total, 0))              AS rev_d30,
      SUM(COALESCE(_90D_Revenue_Total, 0))              AS rev_d90,
      SUM(COALESCE(_0D_Paying_Users, 0))                AS sub_d0,
      SUM(COALESCE(_7D_Paying_Users, 0))                AS sub_d7,
      SUM(COALESCE(_14D_Paying_Users, 0))               AS sub_d14,
      SUM(COALESCE(_30D_Paying_Users, 0))               AS sub_d30,
      SUM(COALESCE(_90D_Paying_Users, 0))               AS sub_d90,
      SUM(COALESCE(_7D_Paying_Users, 0))                AS payers_d7,
      SUM(COALESCE(_0D_subscription_start_Events, 0))   AS sub_start_d0,
      SUM(COALESCE(_7D_subscription_start_Events, 0))   AS sub_start_d7,
      SUM(COALESCE(_14D_subscription_start_Events, 0))  AS sub_start_d14,
      SUM(COALESCE(_0D_trial_start_Events, 0))          AS trial_start_d0,
      SUM(COALESCE(_7D_trial_start_Events, 0))          AS trial_start_d7,
      SUM(COALESCE(_14D_trial_start_Events, 0))         AS trial_start_d14,
      SUM(COALESCE(_7D_Retained_Users, 0))              AS retained_d7,
      SUM(COALESCE(_7D_Cohort_Size, 0))                 AS cohort_d7
    FROM ${fq}
    WHERE _Day_Date IS NOT NULL
      AND NOT (_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios')
${groupByBlock}
  )`;
}

// ── KPI totals + period-over-period deltas ─────────────────────────────────

async function _queryGlobalComixKPIs(
  client: string,
  from: string,
  to: string,
): Promise<KPIData> {
  const spendSub = buildSpendSubquery(client);
  const cohortSub = buildCohortSubquery(client);
  const bq = getBigQueryClient();

  // Two periods, one CTE each per side: raw spend aggregates + cohort
  // aggregates. Every derived metric (CPI, CTR, CPM, multi-window ROAS,
  // retention, ...) is computed at the period level from those sums —
  // never at row level — so the cohort-attribution mismatch (a day with
  // spend but no matured cohort revenue) doesn't distort the headline.
  //
  // Period-over-period deltas use the same shape for every derived
  // metric: (curr - prev) / prev, with SAFE_DIVIDE so a zero prior period
  // returns NULL instead of crashing or rendering as Infinity.
  // WS3: sub_start now sources from the cohort's
  // _7D_subscription_start_Events (surfaced as `sub_start_d7` by
  // buildCohortSubquery). The spend tables' `num_ftd7` is kept inside
  // ftd_d7 for back-compat consumers; the canonical sub_start the rest
  // of the dashboard reads is cohort-derived.
  const query = `
    WITH spend_curr AS (
      SELECT
        SUM(cost_usd)     AS spend,
        SUM(installs)     AS installs,
        SUM(clicks)       AS clicks,
        SUM(impressions)  AS impressions,
        SUM(ftd_d7)       AS ftd_d7
      FROM ${spendSub} s
      WHERE date BETWEEN ${FROM} AND ${TO}
    ),
    rev_curr AS (
      SELECT
        SUM(rev_d0)         AS rev_d0,
        SUM(rev_d7)         AS rev_d7,
        SUM(rev_d14)        AS rev_d14,
        SUM(rev_d30)        AS rev_d30,
        SUM(rev_d90)        AS rev_d90,
        SUM(sub_d0)         AS sub_d0,
        SUM(sub_d7)         AS sub_d7,
        SUM(sub_d14)        AS sub_d14,
        SUM(sub_d30)        AS sub_d30,
        SUM(sub_d90)        AS sub_d90,
        SUM(sub_start_d0)   AS sub_start_d0,
        SUM(sub_start_d7)   AS sub_start_d7,
        SUM(sub_start_d14)  AS sub_start_d14,
        SUM(trial_start_d0) AS trial_start_d0,
        SUM(trial_start_d7) AS trial_start_d7,
        SUM(trial_start_d14) AS trial_start_d14,
        SUM(payers_d7)      AS payers_d7,
        SUM(retained_d7)    AS retained_d7,
        SUM(cohort_d7)      AS cohort_d7
      FROM ${cohortSub} c
      WHERE date BETWEEN ${FROM} AND ${TO}
        AND network IS NOT NULL
    ),
    spend_prev AS (
      SELECT
        SUM(cost_usd)     AS spend,
        SUM(installs)     AS installs,
        SUM(clicks)       AS clicks,
        SUM(impressions)  AS impressions,
        SUM(ftd_d7)       AS ftd_d7
      FROM ${spendSub} s
      WHERE date BETWEEN
        DATE_SUB(DATE(${FROM}), INTERVAL DATE_DIFF(DATE(${TO}), DATE(${FROM}), DAY) + 1 DAY)
        AND DATE_SUB(DATE(${FROM}), INTERVAL 1 DAY)
    ),
    rev_prev AS (
      SELECT
        SUM(rev_d7)         AS rev_d7,
        SUM(rev_d14)        AS rev_d14,
        SUM(rev_d30)        AS rev_d30,
        SUM(rev_d90)        AS rev_d90,
        SUM(sub_d0)         AS sub_d0,
        SUM(sub_d7)         AS sub_d7,
        SUM(sub_start_d7)   AS sub_start_d7,
        SUM(payers_d7)      AS payers_d7,
        SUM(retained_d7)    AS retained_d7,
        SUM(cohort_d7)      AS cohort_d7
      FROM ${cohortSub} c
      WHERE date BETWEEN
        DATE_SUB(DATE(${FROM}), INTERVAL DATE_DIFF(DATE(${TO}), DATE(${FROM}), DAY) + 1 DAY)
        AND DATE_SUB(DATE(${FROM}), INTERVAL 1 DAY)
        AND network IS NOT NULL
    )
    SELECT
      sc.spend                                                          AS spend,
      sc.installs                                                       AS installs,
      sc.clicks                                                         AS clicks,
      sc.impressions                                                    AS impressions,
      sc.ftd_d7                                                         AS ftd_d7,
      -- sub_start sources from the cohort table now (WS3). The spend-side
      -- ftd_d7 stays on ftd_d7 for back-compat consumers, but the
      -- canonical Sub Start headline reads cohort _7D_subscription_start_Events.
      rc.sub_start_d7                                                   AS sub_start,
      rc.sub_start_d0                                                   AS sub_start_d0,
      rc.sub_start_d7                                                   AS sub_start_d7,
      rc.sub_start_d14                                                  AS sub_start_d14,
      rc.trial_start_d0                                                 AS trial_start_d0,
      rc.trial_start_d7                                                 AS trial_start_d7,
      rc.trial_start_d14                                                AS trial_start_d14,
      rc.sub_d0                                                         AS sub_d0,
      rc.sub_d7                                                         AS sub_d7,
      rc.sub_d14                                                        AS sub_d14,
      rc.sub_d30                                                        AS sub_d30,
      rc.sub_d90                                                        AS sub_d90,
      SAFE_DIVIDE(sc.spend, NULLIF(sc.installs, 0))                     AS cpi,
      SAFE_DIVIDE(sc.spend, NULLIF(rc.sub_start_d7, 0))                 AS cp_sub_start,
      SAFE_DIVIDE(sc.spend, NULLIF(rc.sub_d0, 0))                       AS cpa_d0,
      SAFE_DIVIDE(sc.spend, NULLIF(rc.sub_d7, 0))                       AS cpa_d7,
      SAFE_DIVIDE(rc.rev_d7,  NULLIF(sc.spend, 0))                      AS roas,
      SAFE_DIVIDE(sc.clicks, NULLIF(sc.impressions, 0))                 AS ctr,
      SAFE_DIVIDE(sc.spend * 1000, NULLIF(sc.impressions, 0))           AS cpm,
      SAFE_DIVIDE(sc.spend, NULLIF(sc.clicks, 0))                       AS cpc,
      rc.rev_d7                                                         AS rev_d7,
      rc.rev_d30                                                        AS rev_d30,
      SAFE_DIVIDE(rc.rev_d14, NULLIF(sc.spend, 0))                      AS roas_d14,
      SAFE_DIVIDE(rc.rev_d30, NULLIF(sc.spend, 0))                      AS roas_d30,
      SAFE_DIVIDE(rc.rev_d90, NULLIF(sc.spend, 0))                      AS roas_d90,
      SAFE_DIVIDE(rc.retained_d7, NULLIF(rc.cohort_d7, 0))              AS ret_d7,
      rc.payers_d7                                                      AS payers_d7,

      -- Period-over-period deltas (curr - prev) / prev, SAFE_DIVIDE so a
      -- zero prior period reads as NULL and the UI renders "—".
      SAFE_DIVIDE(sc.spend - sp.spend, NULLIF(sp.spend, 0))             AS spend_delta,
      SAFE_DIVIDE(sc.installs - sp.installs, NULLIF(sp.installs, 0))    AS installs_delta,
      SAFE_DIVIDE(sc.clicks - sp.clicks, NULLIF(sp.clicks, 0))          AS clicks_delta,
      SAFE_DIVIDE(sc.impressions - sp.impressions, NULLIF(sp.impressions, 0)) AS impressions_delta,
      SAFE_DIVIDE(sc.ftd_d7 - sp.ftd_d7, NULLIF(sp.ftd_d7, 0))          AS ftd_d7_delta,
      SAFE_DIVIDE(rc.rev_d7 - rp.rev_d7, NULLIF(rp.rev_d7, 0))          AS rev_d7_delta,
      SAFE_DIVIDE(rc.rev_d30 - rp.rev_d30, NULLIF(rp.rev_d30, 0))       AS rev_d30_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.spend, NULLIF(sc.installs, 0))
          - SAFE_DIVIDE(sp.spend, NULLIF(sp.installs, 0)),
        NULLIF(SAFE_DIVIDE(sp.spend, NULLIF(sp.installs, 0)), 0)
      )                                                                 AS cpi_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(rc.rev_d7, NULLIF(sc.spend, 0))
          - SAFE_DIVIDE(rp.rev_d7, NULLIF(sp.spend, 0)),
        NULLIF(SAFE_DIVIDE(rp.rev_d7, NULLIF(sp.spend, 0)), 0)
      )                                                                 AS roas_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.clicks, NULLIF(sc.impressions, 0))
          - SAFE_DIVIDE(sp.clicks, NULLIF(sp.impressions, 0)),
        NULLIF(SAFE_DIVIDE(sp.clicks, NULLIF(sp.impressions, 0)), 0)
      )                                                                 AS ctr_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.spend * 1000, NULLIF(sc.impressions, 0))
          - SAFE_DIVIDE(sp.spend * 1000, NULLIF(sp.impressions, 0)),
        NULLIF(SAFE_DIVIDE(sp.spend * 1000, NULLIF(sp.impressions, 0)), 0)
      )                                                                 AS cpm_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.spend, NULLIF(sc.clicks, 0))
          - SAFE_DIVIDE(sp.spend, NULLIF(sp.clicks, 0)),
        NULLIF(SAFE_DIVIDE(sp.spend, NULLIF(sp.clicks, 0)), 0)
      )                                                                 AS cpc_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(rc.rev_d14, NULLIF(sc.spend, 0))
          - SAFE_DIVIDE(rp.rev_d14, NULLIF(sp.spend, 0)),
        NULLIF(SAFE_DIVIDE(rp.rev_d14, NULLIF(sp.spend, 0)), 0)
      )                                                                 AS roas_d14_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(rc.rev_d30, NULLIF(sc.spend, 0))
          - SAFE_DIVIDE(rp.rev_d30, NULLIF(sp.spend, 0)),
        NULLIF(SAFE_DIVIDE(rp.rev_d30, NULLIF(sp.spend, 0)), 0)
      )                                                                 AS roas_d30_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(rc.rev_d90, NULLIF(sc.spend, 0))
          - SAFE_DIVIDE(rp.rev_d90, NULLIF(sp.spend, 0)),
        NULLIF(SAFE_DIVIDE(rp.rev_d90, NULLIF(sp.spend, 0)), 0)
      )                                                                 AS roas_d90_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(rc.retained_d7, NULLIF(rc.cohort_d7, 0))
          - SAFE_DIVIDE(rp.retained_d7, NULLIF(rp.cohort_d7, 0)),
        NULLIF(SAFE_DIVIDE(rp.retained_d7, NULLIF(rp.cohort_d7, 0)), 0)
      )                                                                 AS ret_d7_delta,
      SAFE_DIVIDE(rc.payers_d7 - rp.payers_d7, NULLIF(rp.payers_d7, 0)) AS payers_d7_delta,

      -- Subscription-funnel deltas. Count deltas mirror spend/install
      -- deltas; CP* / CPA* deltas use the same rate-of-rate shape as
      -- CPI / CTR / CPM above so a zero prior period collapses to NULL
      -- instead of crashing.
      -- WS3: sub_start_delta and cp_sub_start_delta source from
      -- cohort sub_start_d7 on both sides (was spend ftd_d7).
      SAFE_DIVIDE(rc.sub_start_d7 - rp.sub_start_d7, NULLIF(rp.sub_start_d7, 0)) AS sub_start_delta,
      SAFE_DIVIDE(rc.sub_d0 - rp.sub_d0, NULLIF(rp.sub_d0, 0))          AS sub_d0_delta,
      SAFE_DIVIDE(rc.sub_d7 - rp.sub_d7, NULLIF(rp.sub_d7, 0))          AS sub_d7_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.spend, NULLIF(rc.sub_start_d7, 0))
          - SAFE_DIVIDE(sp.spend, NULLIF(rp.sub_start_d7, 0)),
        NULLIF(SAFE_DIVIDE(sp.spend, NULLIF(rp.sub_start_d7, 0)), 0)
      )                                                                 AS cp_sub_start_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.spend, NULLIF(rc.sub_d0, 0))
          - SAFE_DIVIDE(sp.spend, NULLIF(rp.sub_d0, 0)),
        NULLIF(SAFE_DIVIDE(sp.spend, NULLIF(rp.sub_d0, 0)), 0)
      )                                                                 AS cpa_d0_delta,
      SAFE_DIVIDE(
        SAFE_DIVIDE(sc.spend, NULLIF(rc.sub_d7, 0))
          - SAFE_DIVIDE(sp.spend, NULLIF(rp.sub_d7, 0)),
        NULLIF(SAFE_DIVIDE(sp.spend, NULLIF(rp.sub_d7, 0)), 0)
      )                                                                 AS cpa_d7_delta
    FROM spend_curr sc, rev_curr rc, spend_prev sp, rev_prev rp
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
    clicks: numberish(r.clicks),
    impressions: numberish(r.impressions),
    ftdD7: numberish(r.ftd_d7),
    cpi: numberish(r.cpi),
    roas: numberish(r.roas),
    ctr: numberish(r.ctr),
    cpm: numberish(r.cpm),
    cpc: numberish(r.cpc),
    revD7: numberish(r.rev_d7),
    revD30: numberish(r.rev_d30),
    roasD14: numberish(r.roas_d14),
    roasD30: numberish(r.roas_d30),
    roasD90: numberish(r.roas_d90),
    retD7: numberish(r.ret_d7),
    payersD7: numberish(r.payers_d7),
    subStart: numberish(r.sub_start),
    subStartD0: numberish(r.sub_start_d0),
    subStartD7: numberish(r.sub_start_d7),
    subStartD14: numberish(r.sub_start_d14),
    trialStartD0: numberish(r.trial_start_d0),
    trialStartD7: numberish(r.trial_start_d7),
    trialStartD14: numberish(r.trial_start_d14),
    subD0: numberish(r.sub_d0),
    subD7: numberish(r.sub_d7),
    subD14: numberish(r.sub_d14),
    subD30: numberish(r.sub_d30),
    subD90: numberish(r.sub_d90),
    cpSubStart: numberish(r.cp_sub_start),
    cpaD0: numberish(r.cpa_d0),
    cpaD7: numberish(r.cpa_d7),
    spendDelta: numberOrNull(r.spend_delta),
    installsDelta: numberOrNull(r.installs_delta),
    clicksDelta: numberOrNull(r.clicks_delta),
    impressionsDelta: numberOrNull(r.impressions_delta),
    ftdD7Delta: numberOrNull(r.ftd_d7_delta),
    cpiDelta: numberOrNull(r.cpi_delta),
    roasDelta: numberOrNull(r.roas_delta),
    ctrDelta: numberOrNull(r.ctr_delta),
    cpmDelta: numberOrNull(r.cpm_delta),
    cpcDelta: numberOrNull(r.cpc_delta),
    revD7Delta: numberOrNull(r.rev_d7_delta),
    revD30Delta: numberOrNull(r.rev_d30_delta),
    roasD14Delta: numberOrNull(r.roas_d14_delta),
    roasD30Delta: numberOrNull(r.roas_d30_delta),
    roasD90Delta: numberOrNull(r.roas_d90_delta),
    retD7Delta: numberOrNull(r.ret_d7_delta),
    payersD7Delta: numberOrNull(r.payers_d7_delta),
    subStartDelta: numberOrNull(r.sub_start_delta),
    subD0Delta: numberOrNull(r.sub_d0_delta),
    subD7Delta: numberOrNull(r.sub_d7_delta),
    cpSubStartDelta: numberOrNull(r.cp_sub_start_delta),
    cpaD0Delta: numberOrNull(r.cpa_d0_delta),
    cpaD7Delta: numberOrNull(r.cpa_d7_delta),
  };
}

// ── Daily trend series ──────────────────────────────────────────────────────

async function _queryGlobalComixTrend(
  client: string,
  from: string,
  to: string,
): Promise<BQTrendPointByNetwork[]> {
  const spendSub = buildSpendSubquery(client);
  const cohortSub = buildCohortSubquery(client);
  const bq = getBigQueryClient();

  // Per-(date, network) grain — the chart draws one line per ad network
  // so the spend and cohort CTEs both GROUP BY (date, network) and the
  // final SELECT preserves the network column. A LEFT JOIN on (date,
  // network) keeps days with spend but no matured cohort revenue (the
  // trailing 7 days where D7 is still maturing), which read as 0 ROAS /
  // 0 sub_d7 — surfaced visually by the chart's maturity-tail overlay.
  // WS3: sub_start now sources from cohort _7D_subscription_start_Events
  // (surfaced as `sub_start_d7` by buildCohortSubquery). ftd_d7 stays on
  // the spend side for back-compat consumers but the headline / unit-cost
  // computation reads from the cohort.
  const query = `
    WITH spend AS (
      SELECT
        date,
        network,
        SUM(cost_usd)    AS spend,
        SUM(installs)    AS installs,
        SUM(clicks)      AS clicks,
        SUM(impressions) AS impressions,
        SUM(ftd_d7)      AS ftd_d7
      FROM ${spendSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
      GROUP BY date, network
    ),
    rev AS (
      SELECT
        date,
        network,
        SUM(rev_d7)         AS rev_d7,
        SUM(rev_d14)        AS rev_d14,
        SUM(rev_d30)        AS rev_d30,
        SUM(rev_d90)        AS rev_d90,
        SUM(sub_d0)         AS sub_d0,
        SUM(sub_d7)         AS sub_d7,
        SUM(sub_d14)        AS sub_d14,
        SUM(sub_start_d0)   AS sub_start_d0,
        SUM(sub_start_d7)   AS sub_start_d7,
        SUM(sub_start_d14)  AS sub_start_d14,
        SUM(trial_start_d0) AS trial_start_d0,
        SUM(trial_start_d7) AS trial_start_d7,
        SUM(trial_start_d14) AS trial_start_d14,
        SUM(payers_d7)      AS payers_d7,
        SUM(retained_d7)    AS retained_d7,
        SUM(cohort_d7)      AS cohort_d7
      FROM ${cohortSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
        AND network IS NOT NULL
      GROUP BY date, network
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', s.date)                          AS date,
      s.network                                                AS network,
      s.spend                                                  AS spend,
      s.installs                                               AS installs,
      s.clicks                                                 AS clicks,
      s.impressions                                            AS impressions,
      s.ftd_d7                                                 AS ftd_d7,
      r.sub_start_d7                                           AS sub_start,
      r.sub_start_d0                                           AS sub_start_d0,
      r.sub_start_d7                                           AS sub_start_d7,
      r.sub_start_d14                                          AS sub_start_d14,
      r.trial_start_d0                                         AS trial_start_d0,
      r.trial_start_d7                                         AS trial_start_d7,
      r.trial_start_d14                                        AS trial_start_d14,
      r.sub_d0                                                 AS sub_d0,
      r.sub_d7                                                 AS sub_d7,
      r.sub_d14                                                AS sub_d14,
      SAFE_DIVIDE(s.spend, NULLIF(s.installs, 0))              AS cpi,
      SAFE_DIVIDE(s.spend, NULLIF(r.sub_start_d7, 0))          AS cp_sub_start,
      SAFE_DIVIDE(s.spend, NULLIF(r.sub_d0, 0))                AS cpa_d0,
      SAFE_DIVIDE(s.spend, NULLIF(r.sub_d7, 0))                AS cpa_d7,
      SAFE_DIVIDE(r.rev_d7, NULLIF(s.spend, 0))                AS roas,
      SAFE_DIVIDE(s.clicks, NULLIF(s.impressions, 0))          AS ctr,
      SAFE_DIVIDE(s.spend * 1000, NULLIF(s.impressions, 0))    AS cpm,
      SAFE_DIVIDE(s.spend, NULLIF(s.clicks, 0))                AS cpc,
      r.rev_d7                                                 AS rev_d7,
      r.rev_d30                                                AS rev_d30,
      SAFE_DIVIDE(r.rev_d14, NULLIF(s.spend, 0))               AS roas_d14,
      SAFE_DIVIDE(r.rev_d30, NULLIF(s.spend, 0))               AS roas_d30,
      SAFE_DIVIDE(r.rev_d90, NULLIF(s.spend, 0))               AS roas_d90,
      SAFE_DIVIDE(r.retained_d7, NULLIF(r.cohort_d7, 0))       AS ret_d7,
      r.payers_d7                                              AS payers_d7
    FROM spend s
    LEFT JOIN rev r USING (date, network)
    ORDER BY date ASC, network ASC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    date: String(r.date),
    network: String(r.network ?? "Unknown"),
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    clicks: numberish(r.clicks),
    impressions: numberish(r.impressions),
    ftdD7: numberish(r.ftd_d7),
    subStart: numberish(r.sub_start),
    subStartD0: numberish(r.sub_start_d0),
    subStartD7: numberish(r.sub_start_d7),
    subStartD14: numberish(r.sub_start_d14),
    trialStartD0: numberish(r.trial_start_d0),
    trialStartD7: numberish(r.trial_start_d7),
    trialStartD14: numberish(r.trial_start_d14),
    subD0: numberish(r.sub_d0),
    subD7: numberish(r.sub_d7),
    subD14: numberish(r.sub_d14),
    cpi: numberish(r.cpi),
    cpSubStart: numberish(r.cp_sub_start),
    cpaD0: numberish(r.cpa_d0),
    cpaD7: numberish(r.cpa_d7),
    roas: numberish(r.roas),
    ctr: numberish(r.ctr),
    cpm: numberish(r.cpm),
    cpc: numberish(r.cpc),
    revD7: numberish(r.rev_d7),
    revD30: numberish(r.rev_d30),
    roasD14: numberish(r.roas_d14),
    roasD30: numberish(r.roas_d30),
    roasD90: numberish(r.roas_d90),
    retD7: numberish(r.ret_d7),
    payersD7: numberish(r.payers_d7),
  }));
}

// ── Channel mix: spend share by network ────────────────────────────────────

async function _queryGlobalComixChannelMix(
  client: string,
  from: string,
  to: string,
): Promise<ChannelBreakdown[]> {
  const spendSub = buildSpendSubquery(client);
  const bq = getBigQueryClient();

  const query = `
    WITH per_network AS (
      SELECT network, SUM(cost_usd) AS spend
      FROM ${spendSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
      GROUP BY network
    ),
    grand AS (
      SELECT SUM(spend) AS total FROM per_network
    )
    SELECT
      p.network,
      p.spend,
      SAFE_DIVIDE(p.spend, NULLIF(g.total, 0)) AS share
    FROM per_network p, grand g
    WHERE p.spend > 0
    ORDER BY p.spend DESC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    network: String(r.network ?? "Unknown"),
    spend: numberish(r.spend),
    share: numberish(r.share),
  }));
}

// ── Per-network full performance row ───────────────────────────────────────

/**
 * One row per active network for the period, with every metric the
 * dashboard's "Network performance" table renders. The cohort revenue
 * is joined on (date, network) and aggregated per network at the period
 * level — same logic as the headline KPI, just grouped instead of
 * collapsed.
 *
 * Networks with $0 spend in the period are dropped here so the UI
 * doesn't render an all-zero row that just adds noise.
 */
async function _queryGlobalComixNetworkBreakdown(
  client: string,
  from: string,
  to: string,
): Promise<NetworkRow[]> {
  const spendSub = buildSpendSubquery(client);
  const cohortSub = buildCohortSubquery(client);
  const bq = getBigQueryClient();

  // Two trailing CTEs (spend_trailing, rev_trailing) cover the 30 days
  // immediately before `from`. The final SELECT joins them in alongside
  // the period CTEs and emits `trailing_cpa_d7_avg` per network — the
  // status pill's baseline, computed in the same query so the dashboard
  // doesn't need a separate fetch.
  // WS3: sub_start sources from cohort _7D_subscription_start_Events.
  const query = `
    WITH spend_by_net AS (
      SELECT
        network,
        SUM(cost_usd)    AS spend,
        SUM(installs)    AS installs,
        SUM(clicks)      AS clicks,
        SUM(impressions) AS impressions,
        SUM(ftd_d7)      AS ftd_d7
      FROM ${spendSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
      GROUP BY network
    ),
    rev_by_net AS (
      SELECT
        network,
        SUM(rev_d7)        AS rev_d7,
        SUM(rev_d14)       AS rev_d14,
        SUM(rev_d30)       AS rev_d30,
        SUM(rev_d90)       AS rev_d90,
        SUM(sub_d0)        AS sub_d0,
        SUM(sub_d7)        AS sub_d7,
        SUM(sub_d14)       AS sub_d14,
        SUM(sub_start_d0)  AS sub_start_d0,
        SUM(sub_start_d7)  AS sub_start_d7,
        SUM(sub_start_d14) AS sub_start_d14,
        SUM(trial_start_d7) AS trial_start_d7,
        SUM(payers_d7)     AS payers_d7,
        SUM(retained_d7)   AS retained_d7,
        SUM(cohort_d7)     AS cohort_d7
      FROM ${cohortSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
        AND network IS NOT NULL
      GROUP BY network
    ),
    spend_trailing AS (
      SELECT
        network,
        SUM(cost_usd) AS spend
      FROM ${spendSub}
      WHERE date BETWEEN
        DATE_SUB(DATE(${FROM}), INTERVAL 30 DAY)
        AND DATE_SUB(DATE(${FROM}), INTERVAL 1 DAY)
      GROUP BY network
    ),
    rev_trailing AS (
      SELECT
        network,
        SUM(sub_d7) AS sub_d7
      FROM ${cohortSub}
      WHERE date BETWEEN
        DATE_SUB(DATE(${FROM}), INTERVAL 30 DAY)
        AND DATE_SUB(DATE(${FROM}), INTERVAL 1 DAY)
        AND network IS NOT NULL
      GROUP BY network
    ),
    grand AS (
      SELECT SUM(spend) AS total FROM spend_by_net
    )
    SELECT
      s.network                                                    AS network,
      s.spend                                                      AS spend,
      SAFE_DIVIDE(s.spend, NULLIF(g.total, 0))                     AS share,
      s.installs                                                   AS installs,
      s.clicks                                                     AS clicks,
      s.impressions                                                AS impressions,
      s.ftd_d7                                                     AS ftd_d7,
      r.sub_start_d7                                               AS sub_start,
      r.sub_start_d0                                               AS sub_start_d0,
      r.sub_start_d7                                               AS sub_start_d7,
      r.sub_start_d14                                              AS sub_start_d14,
      r.trial_start_d7                                             AS trial_start_d7,
      r.sub_d0                                                     AS sub_d0,
      r.sub_d7                                                     AS sub_d7,
      r.sub_d14                                                    AS sub_d14,
      SAFE_DIVIDE(s.spend, NULLIF(s.installs, 0))                  AS cpi,
      SAFE_DIVIDE(s.spend, NULLIF(r.sub_start_d7, 0))              AS cp_sub_start,
      SAFE_DIVIDE(s.spend, NULLIF(r.sub_d0, 0))                    AS cpa_d0,
      SAFE_DIVIDE(s.spend, NULLIF(r.sub_d7, 0))                    AS cpa_d7,
      SAFE_DIVIDE(s.clicks, NULLIF(s.impressions, 0))              AS ctr,
      SAFE_DIVIDE(s.spend * 1000, NULLIF(s.impressions, 0))        AS cpm,
      SAFE_DIVIDE(s.spend, NULLIF(s.clicks, 0))                    AS cpc,
      SAFE_DIVIDE(r.rev_d7,  NULLIF(s.spend, 0))                   AS roas_d7,
      SAFE_DIVIDE(r.rev_d14, NULLIF(s.spend, 0))                   AS roas_d14,
      SAFE_DIVIDE(r.rev_d30, NULLIF(s.spend, 0))                   AS roas_d30,
      SAFE_DIVIDE(r.rev_d90, NULLIF(s.spend, 0))                   AS roas_d90,
      r.payers_d7                                                  AS payers_d7,
      SAFE_DIVIDE(r.retained_d7, NULLIF(r.cohort_d7, 0))           AS ret_d7,
      SAFE_DIVIDE(st.spend, NULLIF(rt.sub_d7, 0))                  AS trailing_cpa_d7_avg
    FROM spend_by_net s
    LEFT JOIN rev_by_net r USING (network)
    LEFT JOIN spend_trailing st USING (network)
    LEFT JOIN rev_trailing rt USING (network)
    CROSS JOIN grand g
    WHERE s.spend > 0
    ORDER BY s.spend DESC
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  return rows.map((r: Record<string, unknown>) => ({
    network: String(r.network ?? "Unknown"),
    spend: numberish(r.spend),
    share: numberish(r.share),
    installs: numberish(r.installs),
    clicks: numberish(r.clicks),
    impressions: numberish(r.impressions),
    ftdD7: numberish(r.ftd_d7),
    subStart: numberish(r.sub_start),
    subStartD0: numberish(r.sub_start_d0),
    subStartD7: numberish(r.sub_start_d7),
    subStartD14: numberish(r.sub_start_d14),
    trialStartD7: numberish(r.trial_start_d7),
    subD0: numberish(r.sub_d0),
    subD7: numberish(r.sub_d7),
    subD14: numberish(r.sub_d14),
    cpi: numberish(r.cpi),
    cpSubStart: numberish(r.cp_sub_start),
    cpaD0: numberish(r.cpa_d0),
    cpaD7: numberish(r.cpa_d7),
    ctr: numberish(r.ctr),
    cpm: numberish(r.cpm),
    cpc: numberish(r.cpc),
    roasD7: numberish(r.roas_d7),
    roasD14: numberish(r.roas_d14),
    roasD30: numberish(r.roas_d30),
    roasD90: numberish(r.roas_d90),
    payersD7: numberish(r.payers_d7),
    retD7: numberish(r.ret_d7),
    trailingCpaD7Avg: numberish(r.trailing_cpa_d7_avg),
  }));
}

// ── Payback curve (D0 → D90) ───────────────────────────────────────────────

/**
 * Cohort-attributed payback curve: for each window (D0, D7, D14, D30,
 * D90) returns the cumulative revenue + ROAS against the period's total
 * spend. The curve shows how quickly the period's spend is repaying.
 *
 * D90 only matures fully for installs ≥ 90 days old; for a 30-day window
 * ending today the D90 number is structurally low (most installs haven't
 * had 90 days to convert yet). The UI should note this on the
 * tooltip — see the PaybackCurve component.
 */
async function _queryGlobalComixPayback(
  client: string,
  from: string,
  to: string,
): Promise<PaybackPoint[]> {
  const spendSub = buildSpendSubquery(client);
  const cohortSub = buildCohortSubquery(client);
  const bq = getBigQueryClient();

  const query = `
    WITH spend AS (
      SELECT SUM(cost_usd) AS total_spend
      FROM ${spendSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
    ),
    cohort AS (
      SELECT
        SUM(rev_d0)  AS rev_d0,
        SUM(rev_d7)  AS rev_d7,
        SUM(rev_d14) AS rev_d14,
        SUM(rev_d30) AS rev_d30,
        SUM(rev_d90) AS rev_d90
      FROM ${cohortSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
        AND network IS NOT NULL
    )
    SELECT
      s.total_spend AS spend,
      c.rev_d0, c.rev_d7, c.rev_d14, c.rev_d30, c.rev_d90
    FROM spend s, cohort c
  `;

  const [rows] = await bq.query({
    query,
    params: { from, to },
    location: BQ_LOCATION,
  });

  const r = rows[0] ?? {};
  const spend = numberish(r.spend);
  const safeRoas = (rev: number) => (spend > 0 ? rev / spend : 0);

  // Fixed window order so the chart renders left→right without sorting.
  // We project zeros if a window comes back empty (very fresh data) so
  // the chart still has a complete curve to draw.
  const windows: { day: number; rev: number }[] = [
    { day: 0,  rev: numberish(r.rev_d0)  },
    { day: 7,  rev: numberish(r.rev_d7)  },
    { day: 14, rev: numberish(r.rev_d14) },
    { day: 30, rev: numberish(r.rev_d30) },
    { day: 90, rev: numberish(r.rev_d90) },
  ];
  return windows.map(({ day, rev }) => ({
    day,
    revenue: rev,
    roas: safeRoas(rev),
  }));
}

// ── Campaign table (top 100 by spend) ──────────────────────────────────────

async function _queryGlobalComixCampaigns(
  client: string,
  from: string,
  to: string,
): Promise<CampaignRow[]> {
  const spendSub = buildSpendSubquery(client);
  const cfg = getMultiSourceConfig(client);
  const cohortTable = qualifyTable(cfg.cohortTable);
  const bq = getBigQueryClient();

  // The previous version of this query hardcoded ROAS to 0 with the
  // comment "cohort `_Campaign_Attribution` doesn't reliably match" — the
  // 2026-05-17 investigation confirmed the table actually carries a real
  // numeric `_Campaign_ID` column (distinct from the unreliable string
  // attribution) which joins cleanly to the spend-side `campaign_id`.
  // Cohort-attributed subscriber / sub-start / ROI D7 flow through to
  // the dashboard and (via EnrichedCampaignRow) into Hermes / Smart
  // Reports decks automatically.
  //
  // Maturity gate: callers downstream (snapshot.ts, anomstack, the
  // dashboard table) gate on `sub_d7 >= COHORT_D7_MATURITY_THRESHOLD`.
  // We return raw values here; null vs 0 lets the renderer print "—"
  // for campaigns that had spend but no matured cohort.
  const query = `
    WITH curr AS (
      SELECT
        campaign_id,
        ANY_VALUE(campaign_name) AS campaign_name_raw,
        ANY_VALUE(network) AS network,
        SUM(cost_usd) AS spend,
        SUM(installs) AS installs
      FROM ${spendSub}
      WHERE date BETWEEN ${FROM} AND ${TO}
      GROUP BY campaign_id
    ),
    curr_cohort AS (
      SELECT
        CAST(_Campaign_ID AS STRING)               AS campaign_id,
        SUM(COALESCE(_7D_Revenue_Total, 0))        AS rev_d7,
        SUM(COALESCE(_7D_Paying_Users, 0))         AS sub_d7,
        SUM(COALESCE(_7D_subscription_start_Events, 0)) AS sub_start_d7
      FROM ${cohortTable}
      WHERE _Day_Date BETWEEN ${FROM} AND ${TO}
        AND _Campaign_ID IS NOT NULL
        AND NOT (_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios')
      GROUP BY _Campaign_ID
    ),
    prev AS (
      SELECT
        campaign_id,
        SUM(cost_usd) AS spend
      FROM ${spendSub}
      WHERE date BETWEEN
        DATE_SUB(DATE(${FROM}), INTERVAL DATE_DIFF(DATE(${TO}), DATE(${FROM}), DAY) + 1 DAY)
        AND DATE_SUB(DATE(${FROM}), INTERVAL 1 DAY)
      GROUP BY campaign_id
    )
    SELECT
      c.campaign_id,
      COALESCE(c.campaign_name_raw, c.campaign_id) AS campaign_name,
      c.network,
      c.spend,
      c.installs,
      SAFE_DIVIDE(c.spend, NULLIF(c.installs, 0))               AS cpi,
      cc.sub_d7                                                  AS sub_d7,
      cc.sub_start_d7                                            AS sub_start_d7,
      SAFE_DIVIDE(c.spend, NULLIF(cc.sub_d7, 0))                 AS cpa_d7,
      SAFE_DIVIDE(cc.rev_d7, NULLIF(c.spend, 0))                 AS roi_d7,
      SAFE_DIVIDE(c.spend - p.spend, NULLIF(p.spend, 0))         AS spend_delta
    FROM curr c
    LEFT JOIN curr_cohort cc USING (campaign_id)
    LEFT JOIN prev p          USING (campaign_id)
    WHERE c.spend > 0
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
    network: String(r.network ?? ""),
    spend: numberish(r.spend),
    installs: numberish(r.installs),
    cpi: numberish(r.cpi),
    roi_d7: numberish(r.roi_d7),
    // Cohort fields: null when the cohort LEFT JOIN didn't match (a campaign
    // with spend but no Adjust attribution) so the renderer can distinguish
    // "no data" from a real zero.
    sub_d7: numberOrNull(r.sub_d7),
    sub_start_d7: numberOrNull(r.sub_start_d7),
    cpa_d7: numberOrNull(r.cpa_d7),
    spendDelta: numberOrNull(r.spend_delta),
  }));
}

// ── Earliest/latest dates with spend > 0 ───────────────────────────────────

async function _queryGlobalComixDataBounds(
  client: string,
): Promise<DataBounds> {
  const spendSub = buildSpendSubquery(client);
  const bq = getBigQueryClient();

  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', MIN(date)) AS earliest,
      FORMAT_DATE('%Y-%m-%d', MAX(date)) AS latest
    FROM ${spendSub}
    WHERE cost_usd > 0
  `;
  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  return toBounds(rows[0]);
}

// ── "Data as of" — most recent date in any per-network warehouse table ─────

/**
 * Returns the most recent `date` across all of GlobalComix's per-network
 * dwh tables (`dwh_fb2_*`, `dwh_google_ads_*`, `dwh_tik_tok_*`,
 * `dwh_apple_*`). This is the trustworthy signal for the dashboard's
 * "Data as of …" label — the Rivery activity view in
 * `queryFreshness()` only tells us when the loader last ran, not whether
 * it landed any new rows.
 *
 * Returns YYYY-MM-DD or `null` if every table is empty (should never
 * happen in prod, defensive for stage / test envs).
 */
async function _queryGlobalComixDataAsOf(
  client: string,
): Promise<string | null> {
  const cfg = getMultiSourceConfig(client);
  const bq = getBigQueryClient();

  // GREATEST() over per-table MAX(date) subqueries — cheaper than UNION'ing
  // every row first because each subquery scans only the date column.
  const subqueries = cfg.spendSources
    .map((src) => `(SELECT MAX(date) FROM ${qualifyTable(src.table)})`)
    .join(", ");

  const query = `
    SELECT FORMAT_DATE('%Y-%m-%d', GREATEST(${subqueries})) AS data_as_of
  `;

  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  const raw = rows[0]?.data_as_of as unknown;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    return typeof v === "string" ? v : null;
  }
  return null;
}

// ── Cached exports (Upstash Redis, per-client keys) ────────────────────────
//
// TTL choices:
//   - Dashboard queries (KPIs, Trend, ChannelMix, NetworkBreakdown,
//     Payback, Campaigns) cache for 12 hours. Rivery refreshes the
//     warehouse roughly twice a day; the cron warmer (also twice a day,
//     offset from Rivery) repopulates these keys so the dashboard never
//     pays the BigQuery latency under normal conditions. A future
//     Rivery-driven webhook will invalidate a client's keys when a
//     fresh sync lands so the 12h is a ceiling, not a floor.
//   - DataBounds caches for 30 minutes. Bounds only move when a backfill
//     lands or a brand-new day's data arrives, so a long TTL is safe;
//     30 minutes matches the table in the cache spec.
//   - DataAsOf is intentionally NOT Redis-cached. It drives the user's
//     "Data as of …" freshness stamp and a stale read here defeats the
//     purpose of the indicator. The cost of letting it hit BigQuery on
//     every freshness ping is bounded by the outer 10-minute
//     unstable_cache wrap in bq-queries.ts on `queryFreshness`.
//
// Keys are `lumen:cache:v1:{client}:{query}:{paramHash}` — see
// `src/lib/cache/keys.ts`. The wrapper handles bypass / hit / miss /
// error logging and the SET-after-miss write-through.

const DASHBOARD_TTL_S = 60 * 60 * 12; // 12h
const BOUNDS_TTL_S = 60 * 30; //         30m

export const queryGlobalComixKPIs = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "kpis",
      params: { from, to },
      ttlSeconds: DASHBOARD_TTL_S,
    },
    () => _queryGlobalComixKPIs(client, from, to),
  );

export const queryGlobalComixTrend = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "trend",
      params: { from, to },
      ttlSeconds: DASHBOARD_TTL_S,
    },
    () => _queryGlobalComixTrend(client, from, to),
  );

export const queryGlobalComixChannelMix = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "channel-mix",
      params: { from, to },
      ttlSeconds: DASHBOARD_TTL_S,
    },
    () => _queryGlobalComixChannelMix(client, from, to),
  );

export const queryGlobalComixNetworkBreakdown = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "network-breakdown",
      params: { from, to },
      ttlSeconds: DASHBOARD_TTL_S,
    },
    () => _queryGlobalComixNetworkBreakdown(client, from, to),
  );

export const queryGlobalComixPayback = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "payback",
      params: { from, to },
      ttlSeconds: DASHBOARD_TTL_S,
    },
    () => _queryGlobalComixPayback(client, from, to),
  );

export const queryGlobalComixCampaigns = (
  client: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "campaigns",
      params: { from, to },
      ttlSeconds: DASHBOARD_TTL_S,
    },
    () => _queryGlobalComixCampaigns(client, from, to),
  );

export const queryGlobalComixDataBounds = (client: string) =>
  withRedisCache(
    {
      client,
      query: "data-bounds",
      params: {},
      ttlSeconds: BOUNDS_TTL_S,
    },
    () => _queryGlobalComixDataBounds(client),
  );

// Not Redis-cached on purpose — see the header comment above. The outer
// `queryFreshness` in bq-queries.ts already wraps the whole freshness
// response in a 10-minute unstable_cache, which is the right place for
// any cost cap on this query.
export const queryGlobalComixDataAsOf = (client: string) =>
  _queryGlobalComixDataAsOf(client);

// ── BigQuery number coercion (shared with bq-queries.ts) ───────────────────

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
