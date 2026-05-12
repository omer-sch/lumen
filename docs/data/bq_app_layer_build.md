# BQ app-consumer layer — full-grain build plan (v2)

**Date:** 2026-05-11 (revised)
**Reference:** `docs/data/bq_view_plan.md` (the warehouse map)
**Supersedes:** the v1 of this doc that wrapped `management_dashboard_*`. v1 was wrong because it just renamed what already exists. v2 goes deeper.

## Mission

Build a materialized, twice-daily-refreshed data layer in BigQuery that preserves the granular detail (adset / ad / creative / geo / placement / cohort) which `management_dashboard_*` throws away. The output is a clean contract any consumer can read, optimized for analyses (anomaly detection, cohort modeling, statistical work) not just dashboards.

The new layer lives in `yellowhead-visionbi-rivery.yh_app_layer` and contains seven fact tables, six dimension tables, and a small operations dataset for refresh logs.

## Why this is different from v1

| | v1 (wrong) | v2 (this plan) |
|---|---|---|
| Source layer | `management_dashboard_*` (pre-aggregated daily campaign-level, 15 cols) | `dwh_*_all` and `dwh_*_new` (cross-client transformed, 90-380 cols), `uni_*` (cross-platform pre-joined, geo/placement/creative breakdowns), `pw_yh_cohort_*` (cohort attribution) |
| Granularity | Campaign × day | Campaign, adset, ad, creative, geo, placement, cohort |
| Refresh | Always-live views | Materialized tables refreshed every 12 hours via BQ Scheduled Queries |
| Data lost | Adset, ad, creative, geo, placement, cohort, currency-original, hourly | None (within source coverage) |
| Use case | Dashboard rendering only | Dashboard + anomaly detection + cohort analysis + creative ranking + statistical work |
| Hours of work | 4-5 | ~3 weeks for one engineer, in 4 phases |
| Cost | Negligible | ~$100-300/month BQ refresh cost (estimated, validate in Phase 1A) |

## Architecture

```
SOURCE LAYER                          ETL                  APP LAYER                       CONSUMERS
yellowhead_prod                  scheduled queries       yh_app_layer                
                                  every 12 hours        
dwh_fb2_all                      ─→  refresh_facts ─→   fact_daily_campaign           ─→  Lumen
dwh_fb2_new                                              fact_daily_adset                  Notebooks
dwh_apple_*                                              fact_daily_ad                     Future tools
dwh_google_ads_new                                       fact_daily_creative
uni_fb2_geo_web_all                                      fact_daily_geo
uni_fb2_creatives                                        fact_daily_placement
uni_fb2_ads                                              fact_daily_cohort
uni_fb2_adset                                           
pw_yh_cohort_*                                           dim_client
pre_sales_updated_clients_tracking                       dim_campaign
                                                         dim_adset
                                                         dim_ad
                                                         dim_creative
                                                         dim_network

                                                         qa_checks (validation log)
                                                         refresh_log (operations)
```

## Source mapping per fact table

This is the hard part. Each platform has different column names and different richness. The mapping:

### fact_daily_campaign (campaign-level daily)
- Meta + Meta iOS14: `dwh_fb2_all` (145M rows since 2016, has `master_account`, `campaign_id`, `cost_usd`, `installs`, `revenue`)
- Apple: cross-client dwh table to be confirmed in Phase 1A Step 1; if absent, UNION the per-client `dwh_apple_<client>` tables for active clients
- Google: `dwh_google_ads_new` (43M rows, fresh today)
- TikTok: `dwh_tik_tok` (5M rows; sparse but live for some clients)

### fact_daily_adset
- Meta: `uni_fb2_adset` (per Bucket 3, 167 uni_* tables, 101 with client columns)
- Apple: `dwh_apple_<client>` tables have `ad_group_id` (Apple's adset equivalent)
- Google: `dwh_google_ads_new` has `ad_group_id`
- TikTok: per-client tables have `adgroup_id`

### fact_daily_ad
- Meta: `uni_fb2_ads`
- Apple: keyword-level (`dwh_apple_*` has `keyword_id`); Apple does not have ads in the same sense as Meta
- Google: `dwh_google_ads_new` has `ad_id`
- TikTok: per-client `dwh_tik_tok_<client>` has `ad_id`

### fact_daily_creative
- Meta: `uni_fb2_creatives` (the dedicated creative-level table)
- Apple: not applicable (Apple Search Ads has keywords, not creatives)
- Google: `dwh_google_ads_new` ad-level rows include creative metadata
- TikTok: per-client tables have creative_id and creative_name

### fact_daily_geo
- Meta: `uni_fb2_geo_web_all` (307M rows / 71 GB; the big one)
- Apple: country breakdown lives in `dwh_apple_*` tables
- Google: country breakdown lives in `dwh_google_ads_new`
- TikTok: per-client tables have `country` column

### fact_daily_placement
- Meta: dedicated `uni_fb2_*` tables for placement breakdowns (specific names confirmed in Phase 1A)
- Apple: limited (placement is fixed for Apple Search Ads)
- Google: `network` column already encodes placement (Search/Display/YouTube/Discovery)
- TikTok: `placement` column on per-client tables

### fact_daily_cohort
- Google: `pw_yh_cohort_aggregated_stats_google` (1.4 GB, 211 cols, D0/D7/D14/D30/D90 ROAS, attribution flags, cohort_age). Coverage: Google only, Superbloom Games clients only. Document the gap.
- Other platforms: cohort fact will be sparse until cohort-tracking ETL extends to all platforms. Phase 1 ships only what we have.
- Long-term: `yh_singular` events table (5.7 TB) can be aggregated into a cohort fact for Singular-tracked clients.

## Dimension tables

### dim_client
Roster (`pre_sales_updated_clients_tracking`) joined with spend recency from `fact_daily_campaign`. One row per `client_key`. Status: active / paused / stale.

### dim_campaign
One row per `(client_key, network, campaign_id)`. Columns: campaign_name, campaign_status, first_seen_date, last_active_date, lifetime_spend, lifetime_installs. Built from `fact_daily_campaign`.

### dim_adset
One row per `(client_key, network, campaign_id, adset_id)`. Built from `fact_daily_adset`.

### dim_ad
One row per `(client_key, network, campaign_id, ad_id)`. Built from `fact_daily_ad`.

### dim_creative
One row per `(client_key, network, creative_id)`. Includes creative_name, creative_url (where available), creative_format, dimensions. Built from `fact_daily_creative`.

### dim_network
Static reference table. 4 rows. Display labels, parent family grouping, brand color, sort order.

## Active-client filtering

Every fact-table refresh filters to clients where `dim_client.status IN ('active', 'paused')`. This excludes ~52 historical clients from the fact tables to keep refresh cost manageable. If we ever need historical clients, we can rebuild the facts with the filter removed; for now, active + paused is the working scope.

## Refresh strategy

### Materialized, not views

Views run live and cannot be "refreshed twice a day." We need materialized tables, refreshed by BigQuery Scheduled Queries.

### Cadence

Two refreshes per day, at 04:00 and 16:00 UTC:
- 04:00 UTC catches the previous calendar day's late-arriving conversions (most platforms finalize their data overnight UTC)
- 16:00 UTC catches mid-day attribution events (especially relevant for Apple Search Ads which can backfill)

### Refresh pattern: incremental MERGE

Full refresh every 12h on tables with hundreds of millions of rows is expensive. Instead, each fact table uses incremental MERGE:

```sql
MERGE INTO `yh_app_layer.fact_daily_campaign` AS target
USING (
  -- Pull last 14 days from source. 14-day window catches late-arriving conversions.
  SELECT ... FROM `yellowhead_prod.dwh_fb2_all`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
    AND master_account IN (SELECT client_display FROM `yh_app_layer.dim_client` WHERE status IN ('active','paused'))
  UNION ALL ... (other platforms)
) AS source
ON target.date = source.date
   AND target.client_key = source.client_key
   AND target.network = source.network
   AND target.campaign_id = source.campaign_id
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT ...
```

This refreshes the trailing 14 days at every run. Older data is frozen in the table and never re-scanned.

### Bootstrap (one-time)

Initial load is a full INSERT covering the full source history. Run once per fact table during Phase 1A.

### Failure handling

Each scheduled query writes to `yh_app_layer.refresh_log` with start_at, end_at, rows_affected, bytes_scanned, status. A daily query against `refresh_log` alerts if any refresh failed or if a table has not been refreshed in over 24 hours.

## Cost estimate

Rough monthly BQ on-demand cost ($5/TB scanned), refreshing twice daily:

| Fact table | Source scan per refresh | Daily scan | Monthly scan | Monthly cost |
|---|---|---|---|---|
| fact_daily_campaign | ~3 GB (4 source tables, 14d window) | 6 GB | 180 GB | $0.90 |
| fact_daily_adset | ~12 GB | 24 GB | 720 GB | $3.60 |
| fact_daily_ad | ~25 GB | 50 GB | 1.5 TB | $7.50 |
| fact_daily_creative | ~5 GB | 10 GB | 300 GB | $1.50 |
| fact_daily_geo | ~71 GB (uni_fb2_geo_web_all is big) | 142 GB | 4.3 TB | $21.50 |
| fact_daily_placement | ~15 GB | 30 GB | 900 GB | $4.50 |
| fact_daily_cohort | ~1.5 GB | 3 GB | 90 GB | $0.45 |
| **Total refresh cost** | | | **~8 TB** | **~$40** |

Plus consumer reads (Lumen + analyses): probably ~$20-50/month on top.

**Estimated total: $60-100/month.** Well within reason. Validate the actual numbers after Phase 1A bootstrap.

## Operations dataset

A small dataset `yh_app_ops` (or kept inside `yh_app_layer`) holds:
- `refresh_log`: one row per scheduled query run
- `qa_checks`: daily validation results
- `cost_log`: daily aggregated query cost from `INFORMATION_SCHEMA.JOBS_BY_PROJECT` filtered to the lumen-app service account

Lets us see at a glance: when did each fact table last refresh, are validations passing, how much are we spending.

## Build sequence (phased)

Total: ~3 weeks for one focused engineer. Each phase is independently shippable: at the end of Phase 1A you already have a richer-than-management_dashboard layer in production, even before Phases 1B-D land.

### Phase 1A: Foundation (3-5 days)

Goal: dataset, dim tables, fact_daily_campaign, fact_daily_cohort, twice-daily refresh, monitoring.

**Steps:**

1. **Source survey (4 hours).** For each platform, confirm which `dwh_*_all` or `dwh_*_new` table is the canonical cross-client source. Run row-count and date-range checks against each candidate. Document the chosen source per platform.

2. **Per-platform schema mapping (4 hours).** For each chosen source, dump `INFORMATION_SCHEMA.COLUMNS`. Identify the spend, installs, revenue, network, campaign columns. Write a per-platform mapping function (TypeScript script, just for our reference, not in production).

3. **Create dataset and dim_network (1 hour).**
   ```bash
   bq mk --dataset --location=US yellowhead-visionbi-rivery:yh_app_layer
   ```
   Then DDL for dim_network with the 4 networks.

4. **Create dim_client (4 hours).** Same logic as v1 but as a table refreshed every 12h, not a view. Reads roster + recency.

5. **Create fact_daily_campaign (1 day).** UNION the per-platform sources with column normalization. Bootstrap with full history. Schedule the 12h MERGE. Validate row counts against sources.

6. **Create fact_daily_cohort (4 hours).** Bootstrap from `pw_yh_cohort_*`. Schedule 12h MERGE. Document the coverage gap (Google + Superbloom only for now).

7. **Operations setup (1 day).** Create `refresh_log`, `qa_checks`. Set up scheduled queries that monitor and alert.

8. **Grant access (30 min).** `lumen-app` service account, `dataViewer` on `yh_app_layer`, `jobUser` on the project.

**End of Phase 1A:** Lumen and any other consumer can query fact_daily_campaign and dim_client with twice-daily-fresh data, much richer than management_dashboard, plus cohort attribution for Google clients. Already a meaningful upgrade.

### Phase 1B: Adset / ad / creative (5-7 days)

Goal: drill below campaign into adset, ad, and creative grain.

**Steps:**

1. **Source survey for granular sources (4 hours).** Confirm `uni_fb2_adset`, `uni_fb2_ads`, `uni_fb2_creatives` are the right Meta sources. Map the equivalent for Google (`dwh_google_ads_new` ad rows), TikTok (per-client tables), Apple (per-client tables, keyword grain).

2. **Create fact_daily_adset (1 day).** UNION across platforms. Bootstrap. Schedule 12h MERGE.

3. **Create fact_daily_ad (1 day).** Same shape, ad-level grain.

4. **Create fact_daily_creative (1 day).** Plus dim_creative built from this fact.

5. **Create dim_adset, dim_ad (4 hours).** Built from the fact tables.

6. **Validation (4 hours).** Cross-check: SUM(spend) at adset grain should equal SUM(spend) at campaign grain for the same date+client.

**End of Phase 1B:** any consumer can drill from campaign down to ad-level, including creative metadata. Enables creative performance ranking, ad-level anomaly detection, etc.

### Phase 1C: Geo / placement (3-5 days)

Goal: dimensional breakdowns by country and placement.

**Steps:**

1. **Source survey (4 hours).** `uni_fb2_geo_web_all` is the big one (307M rows). Confirm what's available for Google, Apple, TikTok.

2. **Create fact_daily_geo (1.5 days).** Careful date filtering on the big tables. Bootstrap may take a couple of hours.

3. **Create fact_daily_placement (1 day).** Smaller table.

4. **Validation (4 hours).** Cross-check totals roll up to fact_daily_campaign.

**End of Phase 1C:** full geographic and placement breakdown available. Enables geo-targeted analyses, placement optimization queries, country-level anomaly detection.

### Phase 1D: Operations hardening (2-3 days)

Goal: production-grade monitoring, alerting, cost control.

**Steps:**

1. **Cost logging (4 hours).** Daily INFORMATION_SCHEMA.JOBS_BY_PROJECT scan filtered to lumen-app, written to `cost_log`. Alerting if daily cost exceeds threshold.

2. **Refresh failure alerting (4 hours).** Cloud Monitoring alert if `refresh_log` shows any failure or if any fact table is more than 24h stale.

3. **Schema drift detection (4 hours).** A daily query that snapshots `INFORMATION_SCHEMA.COLUMNS` for source tables and compares against a baseline. Alerts on any column rename or type change.

4. **Documentation (4 hours).** `docs/data/app_layer_contract.md` with full column reference, semantics, edge cases, example consumer queries per fact table.

**End of Phase 1D:** layer is production-grade. Refresh failures get caught, schema drift gets detected, cost is visible.

## Validation queries

Run these after each phase. All must pass before moving on.

### After Phase 1A

```sql
-- V1: fact_daily_campaign rows match source
SELECT (SELECT COUNT(*) FROM yh_app_layer.fact_daily_campaign WHERE date >= '2024-01-01') AS app_rows,
       -- expect close match to sum of sources (active/paused clients only)
       (SELECT COUNT(*) FROM yellowhead_prod.dwh_fb2_all WHERE date >= '2024-01-01' AND master_account IS NOT NULL) AS fb2_rows;

-- V2: dim_client active count
SELECT COUNT(*) AS active FROM yh_app_layer.dim_client WHERE status = 'active';
-- expect ~8

-- V3: spend totals roll up correctly
SELECT date, SUM(spend_usd) AS app_spend
FROM yh_app_layer.fact_daily_campaign
WHERE date BETWEEN '2026-04-01' AND '2026-04-30'
GROUP BY date
ORDER BY date;
-- compare to your existing GlobalComix dashboard for the same period

-- V4: refresh runs cleanly
SELECT * FROM yh_app_layer.refresh_log
WHERE date(start_at) = CURRENT_DATE()
ORDER BY start_at DESC;
-- expect at least 2 successful rows per fact table (00:00 and 12:00 UTC)
```

### After Phase 1B

```sql
-- Adset spend rolls up to campaign spend
SELECT
  c.date, c.client_key, c.network, c.campaign_id,
  c.spend_usd AS campaign_spend,
  SUM(a.spend_usd) AS adset_spend_sum
FROM yh_app_layer.fact_daily_campaign c
LEFT JOIN yh_app_layer.fact_daily_adset a
  USING (date, client_key, network, campaign_id)
WHERE c.date = DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1,2,3,4,5
HAVING ABS(c.spend_usd - adset_spend_sum) / NULLIF(c.spend_usd, 0) > 0.01;
-- expect zero rows (1% tolerance for FX rounding)
```

### After Phase 1C

```sql
-- Geo spend rolls up to campaign spend (Meta only, since geo is Meta-richest)
SELECT
  c.date, c.campaign_id,
  c.spend_usd AS campaign_spend,
  SUM(g.spend_usd) AS geo_spend_sum
FROM yh_app_layer.fact_daily_campaign c
LEFT JOIN yh_app_layer.fact_daily_geo g
  USING (date, client_key, network, campaign_id)
WHERE c.network = 'Meta' AND c.date = DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1,2,3
HAVING ABS(c.spend_usd - geo_spend_sum) / NULLIF(c.spend_usd, 0) > 0.05;
-- expect zero rows (5% tolerance because geo can have unattributed splits)
```

## Failure modes

The hardest part of this layer is keeping it healthy across upstream changes.

### Source schema rename
- Symptom: scheduled MERGE fails with column-not-found error
- Detection: refresh_log shows error within 12h
- Recovery: edit the MERGE query for the affected fact, redeploy. ~1h.
- Prevention: schema-drift detector (Phase 1D) catches column changes before the next refresh.

### Source table dropped or renamed
- Symptom: scheduled MERGE fails with table-not-found
- Detection: same as above
- Recovery: switch to alternative source (e.g. `dwh_fb2_new` if `dwh_fb2_all` disappears). ~half-day.

### Cost spike
- Symptom: `cost_log` shows unusual daily spend
- Detection: daily threshold alert
- Recovery: investigate the costly query, add MAXIMUM_BYTES_BILLED clamp on scheduled queries

### Active client list changes
- Symptom: dim_client.status flips a previously-active client to paused/stale
- Behavior: subsequent refreshes drop that client from the fact tables
- This is intended. If the client comes back, status flips back, fact tables backfill on next refresh

### Roster Team values drift
- Symptom: dim_client active count drops unexpectedly
- Detection: V2 daily check
- Recovery: update the WHERE clause in dim_client refresh

## Done means

`yh_app_layer` exists with seven fact tables and six dim tables. Every fact table has a scheduled query that refreshes every 12h. The refresh_log shows two clean runs per day per table. Validation queries pass. The lumen-app service account has read access. Documentation is published.

After that, every consumer (Lumen, a notebook, any future tool) can:
- Query `dim_client` to get the active roster with metadata.
- Query `fact_daily_campaign` for daily KPIs at any granularity from full agency down to a single campaign.
- Drill into `fact_daily_adset / fact_daily_ad / fact_daily_creative` for ad-level work.
- Run geo and placement analyses against `fact_daily_geo / fact_daily_placement`.
- Compute cohort metrics from `fact_daily_cohort` for Google clients (and Superbloom once Phase 1.5 adds Singular routing).
- Trust that the data is at most 12 hours old and that schema changes will be caught loudly, not silently.

The Lumen TypeScript work that follows is now thin: query the views, render the result, run analyses on top.

## What is still out of scope

- **yh_singular events fact** for Superbloom Games clients (5.7 TB events). Adds adset/ad/creative-level Singular events. Phase 1.5.
- **Real-time / streaming layer.** All facts here are batch-refreshed every 12h. No second-by-second updates.
- **Pre-computed analytical tables** (anomaly scores, cohort velocity, creative rankings). Per your decision, Phase 1 ships clean fact tables only. Pre-computation is a Phase 2 add.
- **Cross-team data** (Organic, Creative as a team, CSM). Not in the warehouse yet, so cannot be in the app layer.
- **Custom currency conversion** beyond what `cost_usd` already provides. If we need per-platform original-currency spend, add `cost_original` and `currency` columns in v3.

---

## What changed from v1

For the record. v1 was a wrong-scope plan I wrote before fully understanding what you needed.

| Aspect | v1 | v2 |
|---|---|---|
| Source | management_dashboard_* (4 tables, 15 cols) | dwh_*_all + dwh_*_new + uni_* + pw_yh_cohort_* (10+ tables, 90-380 cols each) |
| Output | 5 views, always-live | 7 fact tables + 6 dim tables, materialized |
| Refresh | None (views are live) | Scheduled queries, every 12h, MERGE-based |
| Granularity | Campaign × day | Campaign / adset / ad / creative / geo / placement / cohort × day |
| Time | 4-5 hours | ~3 weeks |
| Cost | ~$0/month | ~$60-100/month |
| Use case | Dashboard rendering | Dashboard + real analyses |
