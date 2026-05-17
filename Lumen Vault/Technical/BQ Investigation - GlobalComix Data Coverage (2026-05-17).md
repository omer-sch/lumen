# BQ Investigation, GlobalComix Data Coverage (2026-05-17)

Tags: #technical #bigquery #globalcomix #investigation
Related: [[Prior Art - GlobalComix UA Looker Dashboard (2026-05-17)]] | [[BigQuery Warehouse]] | [[Data Infrastructure]]

Machine-readable artifacts: `tmp/bq-discovery/2026-05-17-globalcomix/{A..F}-*.json`

## Executive summary

Almost every chart in the Looker GlobalComix dashboard is reachable from the existing BigQuery warehouse. Out of 39 distinct Looker data points across 12 frames, 10 are already wired in `globalcomix-queries.ts`, 20 live in tables we already query but expose only at a coarser grain (the big bucket), 8 live in adjacent BQ tables we have never touched, 1 (SKAdNetwork) is structurally stale, and 0 are completely missing.

The biggest single unlock is the `uni_adjust_cohort_report_globalcomix` table itself: today we aggregate it to `(date, network)` and throw away `_Country`, `_Campaign_ID`, `_Ad_ID`, `_Creative_Attribution`, the Organic attribution bucket, the Sub Start / Trial Start event columns, and the full set of D14/D30/D90 metrics. Exposing these turns one query module into the source of Paid vs Organic, BCAC, Geographic, Campaign / Adset / Creative drilldowns, and Subscriber Lifecycle reuse, all from a table we already scan.

The second unlock is `dwh_total_subs_globalcomix`, a 9k row table that fully drives Looker's Total Sub & Churn View (Sub / Churn / Net Sub by day, OS donut including Web).

The third unlock is small but real: AppLovin is in the warehouse (`dwh_applovin_globalcomix_adjust`), with cohort attribution split across two strings (`Axon by AppLovin Android`, `Axon by AppLovin iOS`); needs ~3 lines of config to wire in. There is also a TikTok OS bug worth fixing while we are in there (the `os` column is 100% NULL on the TikTok adjust table; the current code treats it as the `column` strategy and silently zeroes TikTok rows whenever the OS filter is not Total).

Bucket 4 (genuinely not in BQ) is small: Pubmint iOS attribution shows up in the cohort with no matching spend table, Meta Web spend lives only in raw ods landing tables (parseable but needs work), Apple creative-level data is not reachable beyond search-term grain, SKAdNetwork ingestion stopped in August 2025.

## Warehouse map

70 GlobalComix-related tables in `yellowhead-visionbi-rivery.yellowhead_prod`, grouped by purpose. All refresh roughly once daily (Rivery), with most spend / cohort tables landing between 03:00 and 09:45 UTC. Last-modified timestamps below reflect 2026-05-17.

### Spend (DWH layer)

| Table | Rows | Size | Last mod | Role |
|---|--:|--:|---|---|
| `dwh_fb2_globalcomix` | 713,674 | 1.4 GB | 05:36 | Meta base. Platform-self-reported (fb_installs, fb_subscribe_*). `date` STRING. 258 cols, very wide. |
| `dwh_fb2_globalcomix_adjust` | 1,221,111 | 470 MB | 09:41 | Meta + Adjust attribution. The one we query today. Has `os` populated, full sub funnel d0/d7/d14. |
| `dwh_google_ads_globalcomix` | 661,230 | 240 MB | 05:13 | Google base. Platform-self-reported (conversions, allConversions_1..11). No `os`. |
| `dwh_google_ads_globalcomix_adjust` | 942,891 | 282 MB | 09:41 | Google + Adjust. The one we query. Has `skad_total_installs`, `subscription_purchase`, `subscription_revenue`. No `os`. |
| `dwh_google_ads_final_globalcomix` | 66,661 | 15 MB | **2025-11-11** | STALE 6 months. Some alternate aggregation; exclude. |
| `dwh_tik_tok_globalcomix` | 240,462 | 105 MB | 04:15 | TikTok base. Platform (tiktok_installs, tiktok_purchase). |
| `dwh_tik_tok_globalcomix_adjust` | 377,017 | 110 MB | 09:41 | TikTok + Adjust. The one we query. **`os` column is 100% NULL**; OS must be inferred from `campaign_name`. |
| `dwh_apple_globalcomix` | 210,348 | 67 MB | 05:17 | ASA base. `date` STRING. Platform (apple_installs). |
| `dwh_apple_globalcomix_adjust` | 263,625 | 59 MB | 09:41 | ASA + Adjust. The one we query. No `os` (implicit iOS). |
| `dwh_apple_globalcomix2` / `..._adjust2` | ~210k each | 60-70 MB | 09:41 | Mirror copies. Probable dual-write to a backup pipeline. Same schema. Confirm with Gabby; safe to ignore for now. |
| `dwh_applovin_globalcomix` | 8,280 | 2.3 MB | 06:09 | AppLovin base. Started 2026-05-05. |
| `dwh_applovin_globalcomix_adjust` | 9,009 | 2.3 MB | 09:41 | AppLovin + Adjust. **Not currently in spendSources.** Started 2026-05-05. Has `os` populated (iOS/Android). |
| `dwh_mntn_globalcomix` | 38 | 0 MB | 09:41 | MNTN, effectively dead. Exclude. |

### Cohort (UNI + per-window ODS)

| Table | Rows | Size | Last mod | Role |
|---|--:|--:|---|---|
| `uni_adjust_cohort_report_globalcomix` | 495,959 | 146 MB | 04:00 | **The one we query.** 39 cols. (date, network, OS, country, campaign_id, ad_id, attribution_text). D0/D7/D14/D30/D90 revenue + paying users + sub_start_events + trial_start_events. **We currently use 10 columns of 39.** |
| `ods_adjust_cohorts_report_globalcomix` | 343,458 | 132 MB | 03:13 | D0 source for uni table. 35 cols including full D0 retention + LTV columns the uni table drops. |
| `ods_adjust_7d_cohorts_report_globalcomix` | 161,838 | 54 MB | 03:21 | D7 source. Includes `_7D_Cohort_Size`, `_7D_Paying_user_rate`, `_7D_Lifetime_Value_paying_users`. |
| `ods_adjust_14d_cohorts_report_globalcomix` | 156,295 | 52 MB | 03:29 | D14 source. **Has `_14D_Cohort_Size` + `_14D_Retained_Users` which uni drops.** Enables D14 retention rate + LTV. |
| `ods_adjust_30d_cohorts_report_globalcomix` | 145,649 | 48 MB | 03:43 | D30 source. Same structure. |
| `ods_adjust_90d_cohorts_report_globalcomix` | 116,439 | 37 MB | 03:58 | D90 source. Same structure. |
| `ods_adjust_overview_report_globalcomix` | 2,602,186 | 909 MB | 03:08 | Largest table. Clicks/Impressions/Installs/Sessions/Avg_DAUs/Ad_spend at full attribution grain (date, network, OS, country, campaign, ad, creative). |
| `ods_adjust_events_globalcomix` | 198,274 | 56 MB | 04:00 | Sub Start + Trial Start events D0/D7/D14 at full attribution grain. No revenue. Leaner cousin of the uni cohort. |
| `ods_adjust_skad_report_globalcomix` | 9,918 | 2 MB | **2025-08-04** | STALE 9 months. SKAdNetwork iOS attribution. Confirm path with Gabby. |
| `ods_mail_adjust_globalcomix` | 245 | 0.1 MB | **2025-08-26** | STALE. |

### Subscription (DWH + ODS)

| Table | Rows | Size | Last mod | Role |
|---|--:|--:|---|---|
| `dwh_total_subs_globalcomix` | 9,282 | 0.3 MB | 09:41 | **The lifecycle unlock.** (event_date, os, sub_type ∈ {subscribe, unsubscribe}, sub_count). Daily aggregate per (date, OS, sub_type). Goes back to 2020-11-18. |
| `ods_pre_subs_globalcomix` | 9,276 | 0.5 MB | 06:00 | Plan-level: "3 Month Gift Subscription" / etc. Value ∈ {-1, +1}. |
| `ods_url_subs_globalcomix` | 9,282 | 0.4 MB | 09:40 | Same scale as dwh_total_subs. Plan name includes OS, e.g. "1 Year Gold (Android)". Probable source for dwh_total_subs after parsing OS out of the plan name. |

### Platform raw landing (ODS)

| Table | Rows | Last mod | Role |
|---|--:|---|---|
| `ods_fb2_creatives_globalcomix` | 1,650 | 00:06 | FB creative dim (creative_name, video_id, thumbnail_url, body, asset_feed_spec). Join _Ad_ID = _creative_id. |
| `ods_fb2_insight_general_web_globalcomix` | 26,229 | 04:04 | FB Web account daily insights. Spend ~$2.7k/day. |
| `ods_fb2_insight_geo_web_globalcomix` | 1,114,695 | 04:06 | FB Web geo breakdown. Has `_country`. |
| `ods_fb2_insight_placement_web_globalcomix` | 70,814 | 04:03 | FB Web placement (`_publisher_platform`). |
| `ods_fb2_ads_globalcomix` | 1,814 | 04:03 | FB ads dim. |
| `ods_apple_searchterms_globalcomix` | 238,027 | 05:08 | ASA per-keyword (search term, taps, impressions, spend, installs). |
| `ods_apple_metrics_adgroup_globalcomix` | 60,676 | 05:08 | ASA per-adgroup metrics. |
| `ods_apple_campaign_globalcomix` | 6,485 | 05:04 | ASA campaign dim. |
| `ods_google_ads_*` (14 tables) | varies | 05:04-05:08 | Google Ads raw landing: campaign, adgroup, kw, kw_ad, country, geo_conversions, performance_*. |
| `ods_tik_tok_*` / `ods_tiktok_*` (11 tables) | varies | 04:03-04:12 | TikTok raw landing: ad_insight, adgroup_insight, ads, adgroups, campaign, auction. |
| `ods_api_applovin_globalcomix` | 7,880 | 06:04 | AppLovin raw API landing. |

### Legacy / staging (exclude)

| Table | Rows | Last mod | Note |
|---|--:|---|---|
| `fct_performance_globalcomix` | 2,030,919 | **2026-04-07** | Stale 40 days. Legacy aggregation. |
| `v_agent_globalcomix` | 2,030,919 | **2026-04-07** | Stale. Already dropped from `CLIENT_TO_TABLE`. |
| `pre_apple_network_globalcomix` | 18,501,650 | 05:17 | 5.8 GB. Heavy pre-aggregation, unclear consumer. |
| `stg_apple/facebook/google/tiktok_globalcomix` | 0 rows each | 2026-04-07 | Empty staging. |

## Frame-by-frame coverage

Verdict legend:
- ✅ Already wired in `globalcomix-queries.ts`
- 🟡 In a table we query, needs new SQL
- 🟠 In a BQ table we do not query, needs a new module
- 🔴 Not reachable (stale or genuinely absent)
- ❓ Unknown / open question

### Frame 1, Period Overview

| Data point | Verdict | Source / Change |
|---|---|---|
| Spend / Installs / CPA D7 / ROI D7 KPI tiles | ✅ | `_queryGlobalComixKPIs` returns spend, installs, cpaD7, roas (= ROI D7). |
| Period-over-period deltas | ✅ | Same query returns paired \*Delta fields. |
| Trend line with metric switcher | ✅ | `_queryGlobalComixTrend` returns per-date series. |
| Country donut + Top-N country table | 🟡 | `uni_adjust_cohort_report_globalcomix._Country` (229 countries with paying users). Add `_queryGlobalComixGeo` grouping cohort by `_Country`. |

Caveats: GlobalComix is subscription, not performance. The KPI vocabulary is Spend / Installs / CPA D7 / ROI D7 (not CPI / ROAS). Existing query returns both vocabularies; UI labels selectively.

### Frame 2, Activity Overview (channel)

| Data point | Verdict | Source / Change |
|---|---|---|
| Channel breakdown table | ✅ | `_queryGlobalComixNetworkBreakdown`. |
| Channel donut (spend share) | ✅ | `_queryGlobalComixChannelMix`. |
| Multi-series trend (per network) | ✅ | `_queryGlobalComixTrend` returns `BQTrendPointByNetwork`. |
| AppLovin row | 🟠 | Add `{ table: "dwh_applovin_globalcomix_adjust", network: "AppLovin", osStrategy: "column" }` to `spendSources` in `bq-security.ts:159`. Add cohort branches `WHEN _Network_Attribution IN ("Axon by AppLovin Android", "Axon by AppLovin iOS") THEN "AppLovin"` in `globalcomix-queries.ts:240`. Add `dwh_applovin_globalcomix_adjust` to `CAMPAIGN_NAME_COLUMN_BY_TABLE`. Surface a date-coverage warning when window starts before 2026-05-05. |

### Frame 3, Activity Overview comparison scorecard

| Data point | Verdict | Source / Change |
|---|---|---|
| Single-row scorecard with conditional coloring | ✅ | KPI query returns paired (curr, delta) for every metric; UI applies sign-coloring. |

### Frame 4, Monthly / Weekly / Daily

| Data point | Verdict | Source / Change |
|---|---|---|
| Per-period aggregated table | 🟡 | Add `cadence: "day" \| "week" \| "month"` param to `_queryGlobalComixTrend`; wrap `date` in `DATE_TRUNC(date, MONTH/WEEK/DAY)`. Tier 1 prompt `2026-05-17-dashboard-tier1-filters-cadence-weekends.md` already plans this. |
| Per-campaign side-by-side within period | 🟡 | Same cadence concept for `_queryGlobalComixCampaigns`, OR client-side rollup of the existing per-day campaign series. |

### Frame 5, Weekends vs working days

| Data point | Verdict | Source / Change |
|---|---|---|
| Two-row comparison (weekday vs weekend KPI avg) | 🟡 | New `_queryGlobalComixWeekends({ from, to, os })` using `EXTRACT(DAYOFWEEK FROM date) IN (1, 7)` for weekend. Tier 1 prompt covers this. |
| Bar chart per day-of-week | 🟡 | Same data, GROUP BY DAYOFWEEK. |

### Frame 6, Total Sub & Churn View

| Data point | Verdict | Source / Change |
|---|---|---|
| Daily Sub / Churn / Net Sub table | 🟠 | New module `src/lib/globalcomix-subs-queries.ts`. SQL: `SELECT event_date, os, MAX(CASE WHEN sub_type='subscribe' THEN sub_count ELSE 0 END) AS subs, MAX(CASE WHEN sub_type='unsubscribe' THEN sub_count ELSE 0 END) AS churn FROM dwh_total_subs_globalcomix WHERE event_date BETWEEN @from AND @to GROUP BY event_date, os`. |
| OS donut (iOS / Android / Web shares) | 🟠 | Same table, GROUP BY os WHERE sub_type='subscribe'. |
| Net Sub Over Time | 🟠 | Cumulative net per day. |
| **Web as an OS** | 🟡 | `dwh_total_subs.os` includes `Web`. Lumen `OsFilter` is currently `ios \| android \| total`. Either extend the type to include `web`, or render lifecycle frame outside the global OS filter (probably better, since Web is irrelevant to UA spend tables). |

Caveats: `sub_count` is a daily aggregate, NOT per-user. Cohort-style churn ("subscribers acquired day D, churned within N days") is not derivable from this table; that lives on the cohort table via `_*_Paying_Users` / `_*_Cohort_Size`. Future event_dates (up to 2027-03-17) exist on the `subscribe` rows; ask Gabby whether `event_date` is start-of-term or end-of-term (open question).

### Frame 7, Paid vs Organic + BCAC

| Data point | Verdict | Source / Change |
|---|---|---|
| Paid sub count vs Organic sub count | 🟡 | Cohort `_Network_Attribution` includes `Organic` (40,328 rows 90d), `Google Organic Search` (5,402), `Untrusted Devices` (3,292). Current `ELSE NULL` (`globalcomix-queries.ts:248`) drops them. Add an `Organic` bucket. |
| BCAC = Spend / (paid_subs + organic_subs) | 🟡 | New `_queryGlobalComixBCAC`. Spend = SUM(cost_usd) from spend UNION (paid only). Subs = SUM(`_7D_subscription_start_Events`) across ALL `_Network_Attribution`. Alternative subs source: dwh_total_subs `subscribe` events (client-pushed, includes subs not yet matured in cohort). |
| Net Sub trend (paid vs organic split) | 🟡 | Cohort, GROUP BY paid_vs_organic + date. dwh_total_subs cannot do this split (OS only). |
| Paid / Organic donut | 🟡 | Cohort, SUM(sub_d7) by paid_vs_organic. |
| Spend & BCAC dual-axis trend | 🟡 | Spend (daily UNION) + BCAC (per-day). |

Caveats: Adjust attributes "Untrusted Devices" separately from Organic; product decision needed on whether to fold them into Organic or surface them separately. `Pubmint iOS/Android` appears in the cohort with no matching spend table (~7.7k rows 90d): if we fold it into "Paid" without spend, the per-network spend split breaks; safest to surface it under "Other Paid" with unknown spend. Open question for Gabby.

### Frame 8, Campaign View / Adset View

| Data point | Verdict | Source / Change |
|---|---|---|
| Per-campaign row with full funnel | 🟡 | Spend UNION already groups by `campaign_id` in `_queryGlobalComixCampaigns`. Funnel columns `subscription_start_d0/d7/d14`, `subscription_trial_start_d0/d7/d14`, `num_ftd0/7/14/30/90` already on each `_adjust` table. Expose them. |
| Per-campaign ROAS D7 | 🟡 | `_queryGlobalComixCampaigns` currently returns `roas: 0` with a comment that cohort `_Campaign_Attribution` does not reliably match. For GlobalComix the cohort `_Campaign_ID` IS a real id; verify the join works (LEFT JOIN cohort on `_Campaign_ID = campaign_id`). |
| Per-adset row with same funnel | 🟡 + 🟠 | Adset names + ids live on spend tables ONLY on slice rows (Country / Placement / Creatives), not on No Breakdown. Either use the Country slice as the canonical adset source (Country is the broadest slice and always populated), or join cohort `_Adgroup_Attribution`. Apple has `adset_id` only (no `adset_name`). |

### Frame 9, Creative Breakdown / Creative Overview

| Data point | Verdict | Source / Change |
|---|---|---|
| Per-ad table with funnel + ad name + thumbnail | 🟡 + 🟠 | Cohort `_Ad_ID` + `_Creative_Attribution` give per-ad funnel + readable creative label natively. For Meta thumbnails, LEFT JOIN `ods_fb2_creatives_globalcomix` on `_Ad_ID = _creative_id`. For TikTok ad-level cost/clicks/impressions, JOIN spend `Creatives` slice (`dwh_tik_tok_globalcomix_adjust WHERE breakdown_type = 'Creatives'`). |
| Top-Ad trend chart | 🟡 | Same cohort + ad-level grouping, time series per `_Ad_ID`. |
| Apple ASA creative-level | 🟠 (limited) | No creative-level table for ASA. `ods_apple_searchterms_globalcomix` is keyword level (238k rows: keyword, searchTerm, taps, impressions, spend, installs). Apple Search Ads creatives are mostly text-based; not a hard miss. |

### Frame 10, Geographic / GEO

| Data point | Verdict | Source / Change |
|---|---|---|
| Country donut (Top-N + Other) | 🟡 | `uni_adjust_cohort_report_globalcomix._Country` GROUP BY for revenue + paying users. Spend share by country: spend UNION `WHERE breakdown_type = 'Country'` GROUP BY `breakdown_value`. |
| Choropleth map | 🟡 | Same data; UI-side rendering. |
| Per-country table (Spend, Installs, Sub D7, Rev D7, CPA D7, ROI D7) | 🟡 | Cohort `_Country` is FULL name (e.g. "United States"); spend `breakdown_value` is ISO-2 ("US"). Need country-code lookup. Either static map or look for an ISO_3166 standard table in the project. |

### Frame 11, Adjust vs Platforms (iOS), Attribution Validation

| Data point | Verdict | Source / Change |
|---|---|---|
| Adjust-attributed installs / subs / revenue per iOS network | ✅ | Existing cohort query filtered `_OS_name = 'ios'` + spend UNION filtered to iOS. |
| Platform-self-reported installs / subs / revenue | 🟡 | Base spend tables carry platform columns: `dwh_fb2_globalcomix.fb_installs / fb_subscribe_*`; `dwh_google_ads_globalcomix.conversions / allConversions`; `dwh_tik_tok_globalcomix.tiktok_installs / tiktok_purchase`; `dwh_apple_globalcomix.apple_installs / conversions`; `dwh_applovin_globalcomix.installs_applovin`. New `_queryGlobalComixAttributionValidation` joining base + _adjust per network. |
| SKAdNetwork install column | 🟡 + 🔴 | `dwh_google_ads_globalcomix_adjust.skad_total_installs` is fresh per-(date, campaign) for Google iOS. `ods_adjust_skad_report_globalcomix` is the cross-network SKAd source but is STALE (last mod 2025-08-04). If Looker shows Meta/TikTok/Apple iOS SKAd numbers, the source must be either stale or not in BQ. Ask Gabby. |

### Frame 12, Metric Definitions (glossary)

| Data point | Verdict | Source / Change |
|---|---|---|
| Per-channel event-name → metric mapping | ✅ doc only | Lives in `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md` (when created) and the in-repo prompts. No BQ data. |
| Formula recipes | ✅ doc only | Pure documentation. Lumen-side is the Knowledge page. |

## The four buckets (synthesis)

### Bucket 1, Already in our queries (10 data points)

Functions in `globalcomix-queries.ts` and what they already serve:

| Function | Frames served |
|---|---|
| `_queryGlobalComixKPIs` | Frame 1 (KPI tiles + deltas), Frame 3 (scorecard), Frame 11 (Adjust iOS aggregate) |
| `_queryGlobalComixTrend` | Frame 1 (trend), Frame 2 (multi-series), Frame 11 (Adjust iOS trend) |
| `_queryGlobalComixChannelMix` | Frame 2 (donut) |
| `_queryGlobalComixNetworkBreakdown` | Frame 2 (table) |
| `_queryGlobalComixPayback` | (not on the Looker frame list, internal Lumen feature) |
| `_queryGlobalComixCampaigns` | Frame 8 (campaign table) for spend/installs/CPI only |
| `_queryGlobalComixDataBounds` | freshness picker |
| `_queryGlobalComixDataAsOf` | "Data as of" stamp |

Unused columns we already pull (and could expose without changing the FROM):
- Cohort: `_0D_Paying_Users`, `_0D_Revenue_Total` (we use 7D-equivalents but not 0D), `_30D_Revenue_Total` (we expose), `_90D_Revenue_Total` (we expose), `_7D_Cohort_Size`, `_7D_Retained_Users` (we use for ret_d7).
- Spend UNION: `clicks`, `impressions`, `ftd_d7` (we expose). `num_ftd0`, `num_ftd14`, `num_ftd30`, `num_ftd90` would round out the FTD funnel.

### Bucket 2, In tables we query, needs new SQL (20 data points)

For each, the change is small and confined to `globalcomix-queries.ts` / `bq-security.ts`. Ordered by impact-per-line.

| Change | Table / column | Frame(s) unlocked |
|---|---|---|
| Add `Organic` bucket in `buildCohortSubquery` `CASE`, change `ELSE NULL` to keep organic rows | `uni_adjust_cohort_report_globalcomix._Network_Attribution` | Frame 7 (all) |
| Expose `_Country` in cohort grouping | `uni_adjust_cohort_report_globalcomix._Country` | Frame 1 (donut), Frame 10 (all) |
| Expose `_Campaign_ID` + `_Ad_ID` in cohort grouping | `uni_adjust_cohort_report_globalcomix` | Frame 8 (per-campaign ROAS), Frame 9 (per-ad funnel) |
| Switch sub_start source from spend `num_ftd7` to cohort `_7D_subscription_start_Events`; expose Trial Start D0/D7/D14 | `uni_adjust_cohort_report_globalcomix._*_subscription_*_Events` | Frame 8, Frame 9, Frame 7 |
| Switch TikTok `osStrategy` from `column` to `campaign_name` | `bq-security.ts:162` (config), `getOsSqlPredicate` (already supports it) | Frames 1-4, 8-11 (any with OS filter); fixes silent zero |
| Add `cadence` param to trend + campaigns queries | `_queryGlobalComixTrend`, `_queryGlobalComixCampaigns` | Frame 4 |
| Add `_queryGlobalComixWeekends` | spend UNION + cohort, EXTRACT DAYOFWEEK | Frame 5 |
| Add `_queryGlobalComixGeo` | cohort GROUP BY `_Country` + spend Country slice GROUP BY `breakdown_value` | Frame 10 |
| Add `_queryGlobalComixCreatives` | cohort + Meta `ods_fb2_creatives_globalcomix` LEFT JOIN | Frame 9 |
| Add `_queryGlobalComixAttributionValidation` | spend base tables (platform self-reported columns) + spend `_adjust` (Adjust attribution) | Frame 11 |
| Add adset dimension to campaigns query | Spend Country slice carries `adset_id`/`adset_name` (every leg); cohort `_Adgroup_Attribution` | Frame 8 |
| Add platform-self-reported sub event columns | Base spend tables: `fb_subscribe_total`, `subscription_purchase` (Google), `tiktok_purchase`, `apple_installs`, `installs_applovin` | Frame 11 |
| Expose D14/D30/D90 retention columns from per-window ods tables | `ods_adjust_14d_cohorts_report_globalcomix._14D_Cohort_Size + _14D_Retained_Users` (and 30D, 90D analogues) | Frame 1 trend metric switcher (D14 retention rate would be new) |

### Bucket 3, In other BQ tables we do not query (8 data points)

Each is a new query module or join.

| Table | Use | Effort |
|---|---|---|
| `dwh_applovin_globalcomix_adjust` | Add AppLovin to spend UNION (config-only change in `bq-security.ts:159`) | Tiny |
| `dwh_total_subs_globalcomix` | Power Total Sub & Churn View (Frame 6). 3 functions in a new `globalcomix-subs-queries.ts` | Small |
| `ods_pre_subs_globalcomix` / `ods_url_subs_globalcomix` | Subscription Plan Mix (not in the current 12 Looker frames; future opportunity) | Optional |
| `ods_fb2_creatives_globalcomix` | Meta creative metadata join for Frame 9 | Small |
| `ods_fb2_insight_general_web_globalcomix` + `_geo_web` + `_placement_web` | Meta Web spend / engagement (not in the 12 frames per spec, but Looker has it). Raw API form, needs UNNEST + parsing | Medium |
| `ods_adjust_overview_report_globalcomix` | Engagement metrics (Clicks/Impressions/Sessions/DAUs) at full attribution grain. Sanity check vs spend tables. Useful for Frame 11 | Medium |
| `ods_adjust_*d_cohorts_report_globalcomix` (per-window) | D14/D30/D90 retention rate + LTV-per-paying-user (uni cohort drops these columns) | Small if needed |
| `ods_apple_searchterms_globalcomix` | ASA Keyword Performance (future frame, not in current 12) | Optional |

### Bucket 4, Not in BQ (1 explicit, 2 partial)

| Item | Verdict | Note |
|---|---|---|
| SKAdNetwork cross-network attribution | 🔴 STALE | `ods_adjust_skad_report_globalcomix` last_modified 2025-08-04, ~9 months. If Looker's SKAd view is showing live numbers, the source must be elsewhere; if it is showing stale numbers, surface the staleness in Lumen. Open question for Gabby. |
| Pubmint spend | 🔴 partial | Cohort attribution for Pubmint iOS (7,451 rows 90d) + Android (255 rows 90d) exists, but no `dwh_pubmint_*` / `ods_api_pubmint_*` spend table. Either client-pushed and not in BQ, or yellowHEAD does not manage Pubmint spend. Ask Gabby. |
| Apple ASA per-creative data | 🔴 partial | No creative-level table. Apple Search Ads are predominantly text creatives so the gap is structural, not a missing source. |

## Recommendations

### Single PR to ship Bucket 1 + Bucket 2 (Tier 2 query-layer upgrade)

Approx 8-10 changes to `globalcomix-queries.ts` and `bq-security.ts`:

1. Fix TikTok `osStrategy`: `column` → `campaign_name` (one line in `bq-security.ts:162`; bug, silent data loss today).
2. Add AppLovin to `spendSources` (3 lines: spendSources entry + cohort branch + CAMPAIGN_NAME_COLUMN_BY_TABLE entry).
3. Include `Organic` + `Google Organic Search` + `Untrusted Devices` as an explicit `Organic` bucket in `buildCohortSubquery` (one CASE branch).
4. Pass through `_Country`, `_Campaign_ID`, `_Ad_ID` from cohort (drop them off the GROUP BY in `_queryGlobalComixTrend` only when caller asks for the dimension).
5. Switch `sub_start` source from spend `num_ftd7` to cohort `_7D_subscription_start_Events`; add Trial Start D0/D7/D14 KPIs.
6. Add cadence param to trend + campaigns queries (Tier 1 prompt scope).
7. Add `_queryGlobalComixWeekends` (Tier 1 prompt scope).
8. Add `_queryGlobalComixGeo` (cohort country + spend Country slice).
9. Add `_queryGlobalComixCreatives` (cohort + Meta creatives LEFT JOIN).
10. Add `_queryGlobalComixAttributionValidation` (base + _adjust per network).

All read-only, all confined to two files.

### New module for Bucket 3 subscription frame

`src/lib/globalcomix-subs-queries.ts`: 3 functions (`_queryTotalSubsDaily`, `_queryTotalSubsOsMix`, `_queryNetSubTrend`) all reading `dwh_total_subs_globalcomix`. Decision needed on whether to extend `OsFilter` to include `web` or render lifecycle frame outside the global OS filter.

### Defer to a later workstream

- Meta Web spend (raw ods, requires parser).
- D14/D30/D90 retention/LTV metrics (per-window ods cohort tables).
- `ods_adjust_overview_report_globalcomix` for engagement metrics at attribution grain.
- Subscription Plan Mix from `ods_url_subs_globalcomix`.

### Ask Gabby

The three Bucket 4 questions, listed below.

## Open questions

1. **SKAdNetwork ingestion path**: `ods_adjust_skad_report_globalcomix` stopped updating 2025-08-04. Is there a newer SKAd source we should be using (maybe one of the platform-specific tables: `dwh_google_ads_globalcomix_adjust.skad_total_installs` is fresh), or did SKAdNetwork attribution genuinely become irrelevant for GlobalComix? Affects Frame 11.
2. **Pubmint**: cohort shows ~7.7k rows of Pubmint attribution in 90 days. Is Pubmint spend pushed by the client outside BQ, or does yellowHEAD not manage Pubmint? Affects Frame 7 BCAC math.
3. **`dwh_total_subs_globalcomix.event_date` semantics**: subscribe rows include future dates up to 2027-03-17. Is `event_date` the subscription start date or the term-end date? Affects how the Total Sub & Churn date filter behaves.
