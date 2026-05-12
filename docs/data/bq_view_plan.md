# BigQuery → Lumen view plan

**Author:** discovery agent, paired with Omer
**Date of discovery scan:** 2026-05-11
**Project scanned:** `yellowhead-visionbi-rivery`
**Region:** `US`
**Caller:** `omers@yellowhead.com` (read-only)
**Discovery dumps (evidence):** `tmp/bq-discovery/*.json` (committed locally; regeneratable with `scripts/discover-bq*.ts`).

**Update 2026-05-11 (Pass 2):** this document now reflects an expanded discovery pass covering project metadata, every prefix layer in `yellowhead_prod`, BigQuery audit-log telemetry, the side datasets, and the backup datasets. See "What changed in this discovery pass" immediately below for the diff between Pass 1 and Pass 2. The original Pass 1 sections are retained below as written so the audit trail is visible.

This document is **a plan, not an implementation**. Every claim below traces
back to a query I ran in this session — line numbers in the discovery dumps
are the receipt. Nothing here is taken from prior LUMEN_DATA_PLAN.md or any
other doc.

The headline:

> The warehouse has a clean, daily-refreshed, cross-platform aggregate layer
> hiding in plain sight: the `management_dashboard_<platform>` family. Six
> tables, identical 15-column schema, refreshed every morning around
> 09:00 UTC. **All four Lumen views can be powered from this layer with one
> `UNION ALL`**, no new ETL, no schema mapping per platform.
>
> The catch: TikTok hasn't refreshed since 2025-01-30, LinkedIn has been
> silent since 2023-12-19, and the two clients Lumen currently ships for
> (GlobalComix, Playw3) are **not in this layer at all** — they're served
> from a parallel per-client `dwh_*` + `v_agent_*` pipeline. Resolving that
> mismatch is the top open question for the BI team.

---

## What changed in this discovery pass

This document was written in two passes. Pass 1 (2026-05-11 morning) characterized the `management_dashboard_*` family in depth and recommended Lumen read from it. Pass 2 (2026-05-11 afternoon) expanded coverage to everything Pass 1 skipped. The "what changed" section enumerates every Pass 1 claim that Pass 2 confirmed, corrected, or extended. The original sections below are retained as written.

### Pass 1 claims this pass corrected

1. **"Looker Studio almost certainly reads from `management_dashboard_*`."** No evidence. Across 203,839 query jobs in the 7 days ending 2026-05-11, zero queries match `principal LIKE '%looker-studio%'` or `'%looker.com%'` or `'%data-studio%'` and zero user-agent strings contain "lookerstudio" or "dataStudio". Either Looker is not actively used right now, or it queries under a generic service-account identity (most likely `developer@yellowhead.pro`, which alone runs 161K jobs per week). The recommendation to read from `management_dashboard_*` still holds on schema, freshness, and cleanliness grounds, but the "Looker uses it" justification should be dropped. See §7 for the audit-log evidence.

2. **"No dedicated client dimension table anywhere."** Wrong. Three exist:
   - `pre_sales_updated_clients_tracking` (511 rows, 21 columns) is the sales-side client roster: Team (UA / Organic / Creative / CSM), Platform, Customer, Title, Account_ID, Monthly_Budget, Start_Date, End_Date, YH_campaigns, Account_Manager, Dashboard_Link, Has_Dashboard, Dashboard_Go_Public_date.
   - `bs_map_account_network_attribution_id` (571 rows) maps `master_account` to legal-entity customer (Bingo Blitz to Playtika Santa Monica, OMG Fortune to LuckyFish Games).
   - `map_snap_ctool_master_account` (36 rows) is a Snapchat-only config table with tracker (Adjust vs AppsFlyer), `store_fee`, `agency_fee`, active flags, app vs web.

3. **"`uni_*` tables have no client column."** Wrong for 101 of 167. The Facebook family uses Facebook's own `account_id` (not the agency master), but TikTok and Google `uni_*` tables carry `master_account_id` / `master_account` directly. Phase 1's claim was a single-sample artifact.

4. **"The 86 `management_dashboard_*` per-client variants are duplicates or zero-row, skip."** Mostly right (84 of 86) but two carry otherwise-missing UAC Pampers data: `management_dashboard_uac` (32K rows, 2020 to 2024-10-08) and `management_dashboard_uac_prewards` (7K rows, dedicated Pampers Rewards). 7 of the variants are empty (including `management_dashboard_fb2_just_spices`, `management_dashboard_google_smart_sleep_coach`).

5. **"`yh_singular` is a small fresh integration not yet wired in."** Wrong. It is a live 5.7-TB pipeline. `singular_events` has 2.65 billion rows, `singular_creative` 30.5M rows, `singular_keyword` 32.1M rows, `singular_cohort` 1.6M rows, all modified today. Apps tracked are Superbloom Games' `Venue` and `com.superbloomgames.atable`. The pipeline is wired in, just not connected to the `management_dashboard_*` layer.

6. **"`pw_yh_cohort_aggregated_stats_google` is a single special-purpose Google cohort table."** It is, but it is part of the same Superbloom Games / Pocket Worlds attribution story as `yh_singular`. Linked Analytics Hub dataset, 211 columns including first / last / hybrid attribution flags and `cohort_age`. Channels include Moloco, Apple Search Ads, Unity Ads. Owner is `ramina@yellowhead.com`. Source publisher is external (project id `459308824437`).

7. **"10,652 unmatched objects, ~1,300 in `yellowhead_prod`."** The 10,652 figure was Pass 1's project-wide classifier, dominated by backup datasets. With a richer classifier that covers `pre_*`, `dim_*`, `map_*`, `bs_*`, `management_dashboard_*`, `fct_*`, `fact_*`, `qa_*`, `vw_*` and similar prefixes, only 106 prod objects remain unclassified, and only one of them is currently live (`inabit_daily_report`, empty but touched daily). See §1e.

8. **"All four `*_bkp_*` datasets are frozen, ignore."** Mostly right, but `yellowhead_bkp_us_1m` is a live rolling 1-month sample (refreshed 2026-05-01) and its sister `yellowhead_bkp_us_6m` rotates every 6 months. Neither is a Lumen source, but knowing the BI team maintains a rolling sample matters for ops.

### Pass 1 claims this pass confirmed

1. `management_dashboard_<platform>` has identical 15-column DDL across all six tables and refreshes daily around 09:00 UTC. Confirmed by reading DDL for each.
2. `management_dashboard_tiktok` is stale since 2025-01-30, and the upstream `dwh_tik_tok_*` tables are fresh, so the aggregation step is broken. Confirmed.
3. GlobalComix and Playw3 are not in `management_dashboard_*`. Confirmed via the cross-platform `master_account` audit and the per-client variant audit (§1c.8).
4. Cross-platform identity must use `LOWER(TRIM(master_account))` because `master_account_id` is per-platform. Confirmed and now further backed by `bs_map_account_network_attribution_id`.
5. Legacy `dwh_v_*` views cannot be queried from standard SQL. Confirmed, and the count of legacy-shaped views is 91 (see §1c.7), with DDL dumped to `17-legacy-views.json` for institutional knowledge.

### Pass 1 claims this pass extended

1. **`dwh_management_dashboard_new` exists** (3.8M rows, has `master_account` and `campaign_id`, fresh today, dates 2017 to 2026) plus `dwh_management_dashboard_new_with_lower_funnel` (894K rows). These are explicitly named "new" and may be the BI team's intended replacement for the six per-platform tables. Open question for BI. See §1c.2.

2. **`pre_sales_updated_clients_tracking` should be Lumen's client roster.** Pass 1 said Lumen should derive the roster from data and own its own vertical mapping. Pass 2 found a sales-side table with Team, Account_Manager, Monthly_Budget, and existing dashboard URLs already populated. 511 rows vs 60 cross-platform clients, so it carries clients not represented in `management_dashboard_*` at all (paused, churned, or in a different pipeline). See §3 (now corrected) and §6 step 2.

3. **The Singular / Pocket Worlds pipeline is a separate parallel source.** Superbloom Venue and several other Pocket Worlds clients (Highrise, Obsidian Knight, Kingdom Maker, Mundo Slots) live in `yh_singular` plus `pw_yh_cohort_aggregated_stats_google` plus a long tail of `dwh_*_superbloom_venue`, `dwh_*_pocket_worlds_highrise`, `dwh_*_obsidian_knight`, `dwh_*_kingdom_maker`, `dwh_*_mundo_slots` tables. None are in `management_dashboard_*`. Lumen needs a product decision before this branch can be exposed.

4. **An ML anomaly-detection pipeline already exists for two clients.** `ml_superbloom_*` (6 tables, Dec 2025) and `metalstorm_*` (8 tables, Oct 2025) are the existing precedent for Lumen's Feed / AI-Mode capability, built by an unknown owner. See §1e.

5. **The BI team is building daily ETL machinery, not serving a real-time consumer.** Cost baseline from §7: 100.6 TB scanned in 7 days, 161K jobs per day from `developer@yellowhead.pro`, top-read tables are all per-client `dwh_*` tables being joined for ETL. Lumen will add a new consumer pattern that has not existed before.

---

## 1. Inventory

### 1a. Datasets in `yellowhead-visionbi-rivery`

14 datasets total (`region-us.INFORMATION_SCHEMA.SCHEMATA`). Classified by
last-modified timestamp on contained objects:

| Dataset | Objects | Live (mod ≤30d) | Stale | Empty | Verdict |
|---|---:|---:|---:|---:|---|
| `yellowhead_prod` | 7,711 | **1,281** | 6,430 | 450 | **Live — the warehouse.** |
| `yh_bq_logs` | 7,005 | 63 | 6,942 | 1 | BQ job log archive — ignore for Lumen. |
| `yellowhead_bkp_archieved_tables` | 2,160 | 0 | 2,160 | 86 | Frozen archive. Ignore. |
| `yellowhead_bkp` | 721 | 2 | 719 | 9 | Historical backups. Ignore. |
| `yellowhead_training` | 32 | 0 | 32 | 2 | 2018-era SQL exam fixtures. Ignore. |
| `yellowhead_bkp_us_1m` | 26 | 13 | 13 | 0 | Rolling 1-month sample — internal QA, not a Lumen source. |
| `yellowhead_bkp_us_6m` | 26 | 0 | 26 | 0 | Frozen 6-month sample. Ignore. |
| `yellowHEAD_SQL_exam` | 8 | 0 | 8 | 5 | 2018 hiring exam data. Ignore. |
| `yellowhead_temp` | 0 | 0 | 0 | 0 | Empty. |
| `rivery_activity_anlytics` | 4 | 3 | 1 | 1 | **Live — Rivery pipeline watermark.** Useful for freshness telemetry. |
| `yh_singular` | 4 | 4 | 0 | 0 | **Live — Singular integration**, created Oct 2025. Not yet wired into the main warehouse; flag as a future source. |
| `pw_yh_cohort_aggregated_stats_google` | 1 | 1 | 0 | 0 | **Live — single special-purpose cohort table** for Google, created Mar 2026. Not enough context yet to know if it belongs in Lumen. |
| `seo_screamingfrog` | 1 | 0 | 1 | 0 | One stale ScreamingFrog dump from Dec 2025. Organic / out of UA scope. |
| `receipts_users` | — | — | — | — | Linked-dataset that's currently **unlinked** (query failed). Could not inspect. |

**Threshold for "live"**: modified within the last 30 days. I justify this
threshold because the live `management_dashboard_*` tables we care about
were modified within the last few hours, the dead ones (LinkedIn, TikTok)
are months stale, and there's no ambiguous middle ground in this warehouse.

**Conclusion: only one dataset matters for Lumen Phase 1 — `yellowhead_prod`.**
The Rivery watermark dataset is useful for displaying freshness in the UI.
Singular and the cohort table are TODO follow-ups, not Phase 1 inputs.

### 1b. Object types in `yellowhead_prod`

```
BASE TABLE     7,459
VIEW             239
EXTERNAL          12
SNAPSHOT           1
```

Of the 239 views, **all 239 have `last_modified_time` older than 30 days** —
view DDL doesn't change often. But that's not a freshness signal; what
matters is whether the views' underlying tables are fresh. The two views
Lumen currently uses (`v_playw3_agent` is a real view; `v_agent_globalcomix`
is actually a `BASE TABLE` despite the `v_` prefix) are both stale by
content, not by DDL change date.

### 1c. The naming layers in `yellowhead_prod`

By prefix, among the 1,281 live (`modified ≤30d`) objects:

| Prefix | Count (live 30d) | What it is |
|---|---:|---|
| `ods_*` | 686 | Operational Data Store — raw landing from Rivery, one table per `(platform, client)`. |
| `dwh_*` | 386 | Data Warehouse — transformed/clean fact tables, also per `(platform, client)`. |
| `uni_*` | 70 | "Unified" — pre-joined cross-platform fact tables (large; up to 17M rows). |
| `pre_*` / `pre_v_*` | 68 | Presentation/staging layer + views. |
| **`management_dashboard_*`** | **53** | **Pre-aggregated daily dashboard source. The Lumen target.** |
| `dim_*`, `map_*`, `bs_*`, etc. | <10 | Dim tables, mapping tables, miscellaneous. |

92 total `management_dashboard_*` objects exist (53 live). Of those, **6 are
the cross-client per-platform aggregates** (the gold layer). The remaining
~86 are per-client variants (`management_dashboard_<platform>_<client>` or
`management_dashboard_<client>`) — most either duplicate what's already in
the cross-client tables or are zero-row. Lumen does not need them.

### 1d. Flags / things to note

- **`v_agent_globalcomix` is a BASE TABLE** that hasn't been refreshed since
  2026-04-07 — already **5+ weeks stale** as of 2026-05-11. The current
  Lumen GlobalComix dashboard reads this. → **Stale data issue in production.**
- **`v_playw3_agent` is a true VIEW**, but its underlying source
  (`dwh_twitter_playw3` and `dwh_fb2_playw3`) stopped receiving data at
  2026-03-24 — **7 weeks stale**.
- **`management_dashboard_tiktok` has not refreshed since 2025-01-30.**
  But the underlying `dwh_tik_tok_globalcomix` (read by raw probe) has data
  through 2026-05-10, so the **aggregation step is broken**, not the
  upstream Rivery pipeline.
- **`management_dashboard_linkedin` is effectively retired** — last row
  2023-12-19, only 1,205 rows total, only one client (Aaptiv).
- Two `BASE TABLE` rows in the inventory have `__error: 'Linked dataset
  ... is unlinked.'` — confirmed unlinked (`receipts_users`).
- 91 of the 239 views in `yellowhead_prod` are **legacy SQL views**
  (`dwh_v_*`, `fact_v_*`). They cannot be queried from standard SQL. Lumen
  should not reference them. (Confirmed by attempting `SELECT * FROM` and
  getting `Cannot reference a legacy SQL view in a standard SQL query`.)

### 1e. The unmatched layer

Pass 1 reported "10,652 unmatched objects, ~1,300 in `yellowhead_prod`." Pass 2 re-ran the classifier with broader prefix coverage and found only **106 truly unclassified objects in `yellowhead_prod`**, and just **one is currently live** (`inabit_daily_report`, 0 rows, modified daily by some upstream process). The 10,652 figure was Pass 1's project-wide tally, dominated by backup datasets.

Evidence: `tmp/bq-discovery/19-unmatched-classified.json`.

The 106 cluster as follows:

| Cluster | Count | Live 30d | Verdict |
|---|---:|---:|---|
| `v_*` (views with reversed naming, e.g. `v_pre_*`, `v_dwh_*`, `v_ods_*`) | 58 | 0 | Alternative names for legacy views; mostly reference unusable `dwh_v_*`. Skip. |
| `metalstorm_*` | 8 | 0 | Anomaly-detection tables for the Metalstorm game (Starform). Created Oct 2025. See "two existing precedents" below. |
| `ml_superbloom_*` | 6 | 0 | ML anomaly-detection tables for Superbloom Venue. Created Dec 2025. Same shape as metalstorm. See "two existing precedents" below. |
| `odc_spreadsheet_*` | 6 | 0 | Per-client tracking spreadsheets imported from Sheets (Spiral US, Lighttricks). Stale. |
| `bkp_*` / `tmp_*` / `temp_*` / `dev_*` | 7 | 0 | Orphaned backup, RFP demo, and dev-only tables that landed in prod. Hygiene issue, not Lumen blocker. |
| `creative_*` (lowercase, e.g. `creative_packages`) | 4 | 0 | One-shot Creative-team tracking from May 2023. |
| `alison_*` (`Alison_ai_analytics`, `v_dwh_alison2_*`) | 3 | 0 | Residual from 2018, the company-name CLAUDE.md says to ignore. |
| `inabit_*` | 2 | 1 | `inabit_daily_report` is the lone live empty table. Possibly broken pipeline. |
| `dwc_uac_high_5_casino*` | 2 | 0 | UAC for High 5 Casino, 2022 to 2023. |
| Other (`ashley_test`, `precomputed_words`, `rivery_activity_csv_temp`, `DDC_countries_to_exclude`, `dinomao_new`, `Analytics_Pampers_MikMak_US`, `Swaddlers_1_1_USA_Web`, `ctool_mapping_external`, plus 4 more) | 12 | 0 | Mixed personal-name tests, legacy P&G work, and one-shot CSV exports. |

**Two existing precedents for Lumen's AI / Feed layer:**
- `ml_superbloom_*` (Dec 2025): `ml_superbloom_v_ua_raw`, `ml_superbloom_fact_daily_series_3lvl` (148,806 rows), `ml_superbloom_features_overall` (3,235 rows), `ml_superbloom_financial_incidents_overall` (1,199 rows), `ml_superbloom_breakdown_bucket_map` (1,992 rows), `ml_superbloom_v_incident_drilldown`.
- `metalstorm_*` (Oct 2025): `metalstorm_installs_anomalies`, `metalstorm_anomaly_report_by_activity_us`, `metalstorm_daily_installs_by_activity_us`, and four more.

Someone at yellowHEAD already built per-client ML anomaly tables with a Feed-like shape (incident drilldown, daily series, breakdown buckets). We do not know who owns this work or whether it is still being run. **Lumen should coordinate with whoever built this rather than reinvent the same surface from zero.**

### 1f. Per-prefix detail inside `yellowhead_prod`

The §1c table summarized the prefix layers. This subsection captures what Pass 2 learned about each prefix in turn.

#### 1f.1 `ods_*` (686 live tables): raw landing from Rivery

Evidence: `tmp/bq-discovery/11-ods.json`. By detected platform:

| Platform | live `ods_*` tables | Example freshest table |
|---|---:|---|
| Google Ads | 176 | `ods_google_ads_performance_country_highrise` (95K rows, mod today) |
| TikTok | 125 | `ods_tik_tok_adgroup_insight_country_obsidian_knight` (69K rows, mod today) |
| Meta | 125 | `ods_fb2_map_facebook_ios14_web_custom_events` (39 rows, mod today) |
| AppTweak | 74 | `ods_apptweak_exports_analytics_reddit` (254K rows) |
| UNCLASSIFIED | 61 | `ods_hubspot_daels_yh` (1,505 columns, 3,665 rows; yellowHEAD's own HubSpot CRM, note typo "daels" for "deals") |
| Apple | 35 | `ods_apple_map_account_id` (60 rows, mapping table) |
| AppsFlyer | 16 | `ods_appsflyer_datalocker` (550M rows, mod today) |
| Adjust | 14 | `ods_adjust_events_globalcomix` |
| Google Search Console | 14 | `ods_search_console_query_yh_monthly` (2.2M rows) |
| Unity | 13 | `ods_api_unity_creative_packs_mundo_slots_android` |
| Snapchat | 13 | `ods_snap_ios14_ad_squad_stats_general_kingdom_maker` |
| LinkedIn | 7 | `ods_linkedin_ads_shares_specops` |
| Singular | 6 | `ods_mail_creatives_singular_superbloom_venue` (26.7M rows) |
| Mintegral | 4 | `ods_uni_mintegral_mundo_slots` |
| AppLovin | 3 | `ods_api_applovin_superbloom_venue` (9.6M rows) |

Notes for Lumen:
- TikTok ODS data is healthy (125 tables, freshest from today). The break is downstream at the `dwh_*` and `management_dashboard_tiktok` aggregation steps, not at Rivery.
- `ods_hubspot_daels_yh` is HubSpot CRM data sitting in prod (1,505 columns). The CRM-side client list lives there. Not a Lumen Phase 1 dependency, but flag for future product work.
- `ods_appsflyer_datalocker` is 550M rows: do not scan without strict date filters.
- "ods_mail_*" prefix appears: "mail" is a channel segment, not a platform token. The Phase 1 classifier treated it as noise correctly.

#### 1f.2 `dwh_*` (386 live tables): transformed fact tables

Evidence: `tmp/bq-discovery/12-dwh.json`. Per platform, largest live table:

| Platform | live | Largest | Rows |
|---|---:|---|---:|
| AppTweak | 78 | `dwh_apptweak_android_reddit_comparison` | 262,816,094 |
| Meta | 65 | `dwh_fb2_all` | 144,673,627 |
| UNCLASSIFIED | 63 | `dwh_management_dashboard_new` | 3,798,540 |
| Google | 50 | `dwh_google_ads_new` | 42,681,996 |
| Apple | 44 | `dwh_itunes_territory_source_type` | 65,413,759 |
| TikTok | 25 | `dwh_tik_tok` | 5,066,908 |
| Reddit | 17 | `dwh_itunes_reddit_installs` | 3,305,222 |
| Adjust | 12 | `dwh_uni_adjust_obsidian_knight` | 2,518,170 |
| Snapchat | 11 | `dwh_snap` | 326,580 |
| Unity | 6 | `dwh_unity_superbloom_venue` | 548,695 |
| Singular | 5 | `dwh_applovin_singular_superbloom_venue` | 10,058,792 |
| AppsFlyer | 3 | `dwh_uni_appsflyer_appreel` | 39,953 |
| AppLovin | 3 | `dwh_applovin_superbloom_venue` | 9,581,877 |
| LinkedIn | 2 | `dwh_linkedin_ads` | 16,824 |
| Google Search Console | 1 | `dwh_search_console_start_io` | 913,997,567 |
| MNTN | 1 | `dwh_mntn_globalcomix` | 38 |

**Cross-client mega-tables exist:** `dwh_fb2_all` covers 2016 to today, `dwh_fb2` covers 2021 to today (38M rows), `dwh_google_ads_new` is the renamed-twice google fact (43M rows), `dwh_tik_tok` is 5M rows, `dwh_snap` 326K rows. All have `master_account` and `campaign_id` and refresh daily.

**`dwh_management_dashboard_new` is the buried find.** 3,798,540 rows, dates 2017-06-29 to 2026-05-11, refreshed today, includes `master_account` and `campaign_id`. Likely a richer cross-platform fact intended as the replacement for the six per-platform `management_dashboard_*` tables. Sister `dwh_management_dashboard_new_with_lower_funnel` (894K rows) adds funnel breakouts. Open question Q-Prefix-1: is this the canonical layer going forward?

**Clients seen in `dwh_*` but not in `management_dashboard_*`:** Superbloom Venue, Obsidian Knight, Kingdom Maker, Mundo Slots, AppReel, Reddit (the company), Highrise (Pocket Worlds), Cash Giraffe, Shortica, Quickbooks, Adventure Tales, BuzzRx, Canopy, Canva, Junes Journey (Wooga), Caesars Casino (Playtika), Jackpot Party (SciPlay), Hard Rock, Power Life, Simply Piano, Sweepspot Analytics, Daels (HubSpot CRM), Ashley, California Psychics, Specops, Start.io, Tenjin Golf Dreams.

#### 1f.3 `uni_*` (167 tables, 70 live): unified cross-platform tables

Evidence: `tmp/bq-discovery/13-uni.json`. **Phase 1 said "no client column," Pass 2 found 101 of 167 carry a client column.**

By platform family:
- Facebook (`uni_fb2_*`): mostly `account_id` only (Facebook's internal). Largest: `uni_fb2_geo_web_all` at 307M rows / 71 GB.
- Google (`uni_google_ads_*`): mostly `customer_id`, some with `master_account_id`. E.g. `uni_google_ads_conversions`, `uni_google_ads_geo_conversions` have both.
- TikTok (`uni_tik_tok_*` and `uni_tiktok_*`): full `advertiser_id`, `master_account_id`, `master_account`, `account_id` quartet.
- `uni_ma_*` family (Zynga master-account custom restore): full `master_account_id` + `master_account`.

Not a Phase 1 Lumen target, but unlocks adset / ad / placement / geo slicing the `management_dashboard_*` layer does not have. Useful for the future Ask (NL query) layer.

#### 1f.4 `pre_*` and `pre_v_*` (132 objects: 68 tables, 64 views)

Evidence: `tmp/bq-discovery/14-pre.json`.

The `pre_*` layer is the **largest staging layer in the warehouse** and is what feeds `management_dashboard_*`:
- `pre_fb2_web`: 398,253,946 rows / 174 GB. Full master_account, customer, currency, breakdowns. Refreshed daily.
- `pre_fb2_ios14_web`: 92,558,155 rows / 45 GB.
- `pre_snap_network` / `pre_snap_upper`: full Snapchat detail with master_account.
- `pre_apptweak_featured_content`: 1.2M rows.
- `pre_sales_*` family: the sales-side tracking, including the client roster (see §3).

The 64 `pre_v_*` views encode the business logic: fees, store_fees, currency conversion, cohorting. `pre_v_facebook_ads_insight` is 18,524 chars, `pre_v_installs_ad_key_model` is 11,796 chars. **Institutional knowledge that the AI / Ask layer should index for future product work.**

#### 1f.5 `dim_*` / `map_*` / `bs_*` (11 live) and the client master find

Evidence: `tmp/bq-discovery/15-dim-map-bs.json`.

The previously-believed "no dim_clients" claim was wrong. The tables:

| Table | Rows | What it is |
|---|---:|---|
| `pre_sales_updated_clients_tracking` (in `pre_*` not dim) | 511 | **The sales-side client master**. Team, Customer, Title, Account_ID, Monthly_Budget, Start_Date, End_Date, Account_Manager, Has_Dashboard, Dashboard_Link, etc. |
| `bs_map_account_network_attribution_id` | 571 | **The cross-platform identity mapping**. `master_account_id`, `master_account`, `network_id`, `network`, `customer_id`, `customer` (the legal entity). |
| `bs_map_adwords_account_name` | 244 | Google Ads account name to `master_account_id` mapping. |
| `map_snap_ctool_master_account` | 36 | Snapchat per-client config (tracker, fees, AA flag). |
| `dim_apple_campaign` | 2,277 | Apple Search Ads campaign dim. Partially populated (many `master_account=None`). |
| `dim_apple_adgroup` | 353 | Apple adgroup dim. |
| `dim_google_ads_account` | 108 | Google account mapping. Some master_account_id NULL. |
| `dim_google_ads_campaign` | 540,764 | Snapshot per (master_account, campaign, date), not a true dim. |
| `dim_google_ads_ad` | 8,844,110 | Same shape, larger grain. |
| `dim_google_ads_adgroup` | 2,008,887 | Same shape. |
| `dim_google_ads_keyword` | 3,207,639 | Per-keyword + date. |

A global column-name search for any of `client_id`, `client_name`, `customer_id`, `customer_name`, `master_account_id`, `master_account_name`, `advertiser_id`, `advertiser_name` returned **3,011 column hits across `yellowhead_prod`**, but the small dim / map / bs tables above are the only ones that look like maintained reference data. Everything else is fact-table embedding of the same identifiers.

#### 1f.6 `EXTERNAL` tables (12): all Google Sheets

Evidence: `tmp/bq-discovery/16-external.json`.

All 12 EXTERNAL tables are `GOOGLE_SHEETS` external tables. The full list:
- `ods_map_fb2_power_life_daily_purchase` (3 sheets, related)
- `ods_simplypiano_tiktok_new`
- `ods_tagtool_fix_merge`
- `ods_seo_domains_list`
- `lead_campaigns_google_2020_gsheet`
- `bs_lead_campaign_ua_yh` (same gsheet as the line above)
- `ods_map_aov_adset_day`
- `lead_campaigns_facebook_2020_gsheet`
- `ods_fb2_gaming_kpi_mapping`
- `ods_ss_tableau_hard_rock`
- `ods_map_fb2_power_life_daily_purchase_by_ad`

This means **12 pipelines are gated on hand-maintained spreadsheets**. If anyone edits a wrong cell, downstream tables corrupt silently. Open question Q-Prefix-4: who owns each sheet, and is there a contract / review process?

#### 1f.7 Legacy `dwh_v_*` views (91 of 239)

Evidence: `tmp/bq-discovery/17-legacy-views.json`. DDL captured for each.

Pass 1 confirmed these cannot be queried from standard SQL. Pass 2 dumped the view_definition text (sometimes 47,000+ characters per view) for future use: they encode the BI team's installs / revenue / cohort logic, including the FB Adquant model, Google Adwords install attribution, custom client installs (Gett, GSN, VDS), and currency exchange. Lumen should NOT reference them directly but should treat them as a reference source for the future Ask layer.

The 141 non-legacy views remain useful (the `pre_v_*` view family is standard SQL and queryable).

#### 1f.8 The 86 `management_dashboard_*` per-client variants

Evidence: `tmp/bq-discovery/18-md-variants.json`.

| Class | Count | Note |
|---|---:|---|
| Duplicates of cross-client slice | 77 | Safe to ignore. |
| Empty | 7 | Includes `management_dashboard_fb2_just_spices`, `management_dashboard_google_smart_sleep_coach`, `management_dashboard_google_cubi_land`, four more. Dead weight. |
| Unique client data | 2 | `management_dashboard_uac` (Pampers family, 32K rows, 2020 to 2024-10-08) and `management_dashboard_uac_prewards` (Pampers Rewards only, 7K rows). UAC = Google's Universal App Campaigns. |

Phase 1 said "duplicates or zero-row, skip" was 100% right. Pass 2 confirms it for 98% of cases. The 2 UAC variants only matter if Pampers is reactivated.

---

## 2. Schema map

### 2a. The recommended Lumen source: `management_dashboard_<platform>`

Six tables, **identical 15-column DDL**, all unpartitioned, no clustering.
Refreshed daily (the modified timestamps across all six fall within ~10
seconds of each other every morning).

```sql
-- DDL via INFORMATION_SCHEMA.TABLES — confirmed identical across the six
CREATE TABLE `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_fb2` (
  date              DATE,
  master_account_id STRING,    -- numeric-string client UID, e.g. "283"
  master_account    STRING,    -- client display name, e.g. "Ultimate X Poker"
  app_name          STRING,    -- one client may have multiple apps
  campaign_id       STRING,
  campaign_name     STRING,
  campaign_status   STRING,    -- "ACTIVE" / "PAUSED" / etc.
  cost_usd          FLOAT64,   -- spend, USD, already FX-normalized
  clicks            FLOAT64,
  impressions       FLOAT64,
  installs          FLOAT64,
  revenue           FLOAT64,
  num_ftd7          FLOAT64,   -- first-time depositors in 7 days
  purchases         FLOAT64,
  PLATFORM          STRING     -- e.g. "Facebook", "AppleSearchAds", "Google Adwords"
);
```

The six tables:

| Table | Rows | Date range (lifetime) | Latest data | Clients (distinct master_account) | Campaigns | Spend lifetime | Status |
|---|---:|---|---|---:|---:|---:|---|
| `management_dashboard_fb2` | 109,341 | 2019-01-01 → 2026-05-10 | 1d ago | 22 | 1,337 | $21.3M | **Live** |
| `management_dashboard_apple` | 592,808 | 2017-06-29 → 2026-05-11 | today | 20 | 1,480 | $17.9M | **Live** |
| `management_dashboard_google` | 120,432 | 2021-03-03 → 2026-05-11 | today | 15 | 350 | $12.6M | **Live** |
| `management_dashboard_fb_ios14` | 10,066 | 2021-05-17 → 2026-05-10 | 1d ago | 5 | 51 | $3.3M | **Live (iOS14 split of Meta)** |
| `management_dashboard_tiktok` | 20,428 | 2021-07-15 → **2025-01-30** | **>15 mo stale** | 10 | 424 | $6.7M | **Broken — see open Q 2** |
| `management_dashboard_linkedin` | 1,205 | 2023-03-16 → 2023-12-19 | **>17 mo stale** | 1 | 32 | $66K | Retired |

**Grain:** one row per `(date, master_account_id, campaign_id, PLATFORM)`.
For the cross-platform tables, `master_account_id` and `campaign_id` are
not unique across platforms — Facebook and Apple may both have a
campaign called "Brand US" with collision-prone numeric IDs. The PLATFORM
column disambiguates.

**Join keys:** there are no foreign keys back to other tables in this layer.
You join across platforms by `master_account` (display name) — see §3.

**Quality issues observed:**
- `apple` has **51,329 rows with `master_account = NULL`** ($553,691 in spend).
  These are unattributed and need a BI fix before they can show up cleanly
  in a "by client" view.
- The same client appears under multiple `master_account_id`s with the same
  `master_account` name — e.g. **"Video Poker" = id 265 on FB, id 335 on
  Apple, id 296 on Google** (now silent). So `master_account_id` is
  per-platform, `master_account` (name) is the cross-platform identity.
- "Goldfish Casino Slots" shows ~25k rows of FB spend but `latest=2023-09-14` —
  i.e. the client churned out but its history is still in the table.
- `campaign_status` is filled (`ACTIVE`/`PAUSED`) for live rows but is
  often `NULL` for historical rows — don't use it as the sole activity signal.

### 2b. The current Lumen sources (used by `src/lib/bq-security.ts`)

`v_agent_globalcomix` — **BASE TABLE** (33 cols, 2,030,919 rows). DDL:

```sql
CREATE TABLE v_agent_globalcomix (
  client STRING, network STRING, date DATE,
  campaign_id STRING, campaign_name STRING, campaign_status STRING,
  adset_id STRING, adset_name STRING,
  breakdown_value STRING, breakdown_type STRING, os STRING,
  cost_usd FLOAT64, impressions INT64, clicks INT64, installs INT64,
  rev_gross_d0_usd FLOAT64, rev_gross_d7_usd FLOAT64,
  rev_gross_d14_usd FLOAT64, rev_gross_d30_usd FLOAT64, rev_gross_d90_usd FLOAT64,
  subscription_trial_start FLOAT64,
  subscription_start_d0 INT64, subscription_start_d7 INT64, subscription_start_d14 INT64,
  cpi FLOAT64, ctr FLOAT64, cpc FLOAT64, cpm FLOAT64,
  roas_d0 FLOAT64, roas_d7 FLOAT64, roas_d14 FLOAT64, roas_d30 FLOAT64, roas_d90 FLOAT64
);
```

- Stats: 4 networks, 128 campaigns, $2.45M spend, 783K installs.
- **Latest date in data: 2026-04-07** — already **34 days stale.**
- This table is GlobalComix-only (single value of `client`).
- It has things `management_dashboard_*` doesn't: `adset_id/adset_name`,
  `breakdown_type/value`, **D0/D7/D14/D30/D90 ROAS cohorts**, and
  subscription-trial-start counters.

`v_playw3_agent` — **VIEW** (43 cols, 78,578 rows when materialized to a
SELECT). Its DDL (extracted from `INFORMATION_SCHEMA`) is a UNION of
`dwh_twitter_playw3` and breakdown-split queries on `dwh_fb2_playw3`, with
a currency-exchange CTE that converts EUR → USD using `pre_currency_exchange`.

- 2 networks (Twitter, Facebook), 50 campaigns, $597K spend.
- **`installs` is NULL in 100% of rows** — confirmed; matches `project_playw3_data_gaps.md`.
- Latest date: 2026-03-24 (Twitter ended 2025-07-01 per the same memory; FB ended 2026-03-24).

`dwh_fb2_ios14_appsflyer_100play` — 22 cols, only 944 rows, $2,287 lifetime
spend, no campaign_id, no install column. Effectively dormant.

### 2c. Per-platform raw `dwh_*` tables (the second pipeline)

Sampled four per-`globalcomix` to map per-platform column names. These have
much wider schemas (256–380 columns) including dimensional context, but
each platform uses a different spend column name and a different install
source. Summary of where each "lumen-shaped" slot lives:

| Lumen slot | `dwh_fb2_globalcomix` (258 cols) | `dwh_apple_globalcomix` (36 cols) | `dwh_google_ads_globalcomix` (90 cols) | `dwh_tik_tok_globalcomix` (41 cols) |
|---|---|---|---|---|
| date | `date` | `date` | `date` | `date` |
| client | `master_account` | `master_account` | `account_name` | `master_account` |
| spend | `cost_usd` | (no USD column — has `local_spend`) | `cost_usd` | `cost` (no `_usd` suffix!) |
| installs | (NULL — Meta doesn't ship installs here) | `conversions` (or `apple_installs`) | `conversions` | (no install column) |
| campaign_id | `campaign_id` | `campaign_id` | `campaign_id` | `campaign_id` |
| network/sub-platform | `Network` (PascalCase) | (none — Apple is one network) | `network` (5 distinct values: Search/Display/YouTube/...) | (none) |

These per-platform schemas are NOT consistent. **The `management_dashboard_*`
layer is exactly the normalization Lumen would otherwise have to build itself.**

### 2d. Schemas we explicitly chose NOT to use

- **`dwh_v_*` views (legacy SQL, ~91 of them)** — return `Cannot reference a
  legacy SQL view in a standard SQL query`. Out of bounds.
- **`uni_fb2_*` (unified large fact tables)** — `uni_fb2_ios14_general_web_all`
  has 17.2M rows; sister tables `uni_fb2_geo_web_all` has 306M rows. These
  exist for downstream analytics but **have no client column** (probed:
  37 cols, no `client`, no `master_account`, no `customer`). They're pre-
  joined for analyst-driven slicing, not dashboard reading. Skip for Phase 1.
- **`ods_*`** — raw Rivery landing. The dwh/uni/management_dashboard layer
  exists precisely so Lumen doesn't have to look at ods.

---

## 3. Client identification strategy

### 3a. What I found

There is **no dedicated client dimension table** in this warehouse. My
search (`SELECT table_name … WHERE name REGEXP '(client|account|customer|
brand|advertiser)'`) returned tables under `yellowHEAD_SQL_exam` (2018 exam
fixtures), `yellowhead_bkp` (frozen backups), and nothing in
`yellowhead_prod` itself that holds a maintained client master.

The closest thing is `dwh_v_dim_facebook_campaigns` — but it's legacy SQL,
unusable, and Facebook-specific anyway.

The de-facto client model is the `(master_account_id, master_account)`
columns embedded on every `management_dashboard_*` row.

### 3b. The cross-platform identity problem

`master_account_id` is **per platform**. The same business entity gets a
different ID per platform's master_account:

| `master_account` (name) | platforms | master_account_ids |
|---|---|---|
| Video Poker | Facebook, FB iOS14, Apple, Google | 265 (FB), 335 (Apple), 296 (Google) |
| Ultimate X Poker | Facebook, Google | 283 (FB), 296 (Google) |
| Smart Sleep Coach | Facebook, Apple | 365 (FB), 334 (Apple) |

So **identity must be resolved by `master_account` (the display name)**, not
by `master_account_id`. This is fragile (capitalization, trailing spaces —
the inventory revealed a table named `management_dashboard_cyberghost ` with
a literal trailing space, suggesting these names are not strictly normalized
upstream). Lumen should normalize with `LOWER(TRIM(master_account))`.

There are also collisions / duplicates worth flagging:
- `Cyberghost` and `cyberghost ` (trailing space, different table)
- `NEWA` (id 377) and `Newa` (id 377) — same ID, different casing
- `BuzzRx` and `BuzzRX` — same client, different casing in different rows
- `2K NBA` and `NBA 2K` — likely same client, two display strings, id 331

These are open BI questions, but Lumen can paper over them with
case-insensitive grouping until the BI team consolidates.

### 3c. Enumerating the client list — the actual SQL

The query I ran against the live warehouse (`scripts/discover-bq-clients.ts`,
output in `tmp/bq-discovery/clients-rollup.json`):

```sql
WITH unioned AS (
  SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_fb2`
  UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_apple`
  UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_google`
  UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_tiktok`
  UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_linkedin`
  UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_fb_ios14`
)
SELECT
  LOWER(TRIM(master_account))                          AS client_key,
  ANY_VALUE(master_account)                            AS client_display,
  ARRAY_AGG(DISTINCT PLATFORM IGNORE NULLS)            AS platforms_lifetime,
  ARRAY_AGG(DISTINCT IF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), PLATFORM, NULL) IGNORE NULLS) AS platforms_active_30d,
  MAX(date)                                            AS last_activity,
  SUM(IF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7  DAY), cost_usd, 0)) AS spend_last_7d,
  SUM(IF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), cost_usd, 0)) AS spend_last_30d,
  SUM(IF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), installs, 0)) AS installs_last_30d,
  SUM(cost_usd)                                        AS spend_lifetime
FROM unioned
WHERE master_account IS NOT NULL
GROUP BY client_key
ORDER BY spend_last_30d DESC NULLS LAST
```

**Bytes scanned for that query: ~110 MB** (no partition filter possible —
these tables aren't partitioned). At $5/TB that's $0.0005 per refresh.
Cheap enough to run on every dashboard load, but if Lumen wants to cache
the client list it's also fine.

### 3d. The active-client definition I propose

> **A client is "active" if `SUM(cost_usd) over the last 7 days > 0` across
> the `management_dashboard_*` union.**

I justify this threshold with the data:

- 60 distinct (case-folded) `master_account` values exist lifetime.
- Only **8 have any spend in the last 30 days.** The cliff between
  `spend_last_30d > 0` and the rest is sharp — no clients are in a
  "almost active" middle ground.
- Of the 8 active, all 8 have spend in the last 7 days too. So a 7-day
  window is sufficient — no need for a longer recency tail.

Three states for the UI:

| State | Rule | Count today |
|---|---|---:|
| **Active** | `spend_last_7d > 0` | 8 |
| **Paused** | `last_activity >= CURRENT_DATE() - 90 AND spend_last_7d = 0` | (varies; 0 today) |
| **Stale** | `last_activity < CURRENT_DATE() - 90` | 52 |

The 8 currently active clients (data backing this from `clients-rollup.json`):

| Client | Platforms (last 30d) | Spend 30d | Installs 30d |
|---|---|---:|---:|
| Stardust Casino | Google | $91,996 | — |
| Keno | Facebook + FB iOS14 | $71,783 | 1,699 |
| Video Poker (id 265 / 335) | Facebook + FB iOS14 + Apple | $90,222 (combined) | 7,882 |
| Ultimate X Poker | Facebook + Google | $52,953 | 3,498 |
| Smart Sleep Coach | Facebook + Apple | $20,197 | 1,069 |

### 3e. Cross-platform resolution — the strategy

Lumen's client identity layer (proposed):

```ts
type ClientKey = string;       // LOWER(TRIM(master_account))

type ClientRow = {
  key: ClientKey;
  display: string;             // ANY_VALUE — pick latest casing
  platforms_lifetime: Platform[];
  platforms_active_30d: Platform[];
  last_activity: Date;
  status: "active" | "paused" | "stale";
};
```

- The query in §3c is the source. Cache for 60 seconds in the API layer
  (the warehouse refreshes once a day, so caching for minutes is safe).
- For the URL slug, derive `slug = key.replace(/[^a-z0-9]+/g, "-")`. Lumen
  must reject any slug not present in the live client list (preventing
  injection — the current `ALLOWED_CLIENTS` env-var allowlist remains a
  defense-in-depth layer).
- When Lumen queries by client, it should always go `WHERE
  LOWER(TRIM(master_account)) = @client_key` — never by master_account_id.

### 3f. Trade-off: identity resolution by name

| Pros | Cons |
|---|---|
| Stable across platforms (the BI team types the same name into each platform's master_account config). | Drift / typos: trailing spaces, casing differences ("BuzzRX" vs "BuzzRx"). |
| Available today. No new infra. | Two truly different clients could share a name. (Doesn't happen in current data, but possible.) |
| `master_account_id` is per-platform so it can't be the cross-platform key. | The fix when collisions or drift happens is BI-side, not Lumen-side. |

---

## 4. View-by-view plan

All four Lumen views share the same UNION-ALL skeleton over the
`management_dashboard_<platform>` family, so I'm pulling the union into a
shared CTE notation. In Lumen's data layer this would be a single
TypeScript helper that emits the union; in BQ-side it could (and arguably
should) become a Lumen-owned view (§5).

```sql
-- Reused base in every view below
WITH base AS (
  SELECT *, 'Facebook'             AS network_label FROM `…management_dashboard_fb2`        WHERE date BETWEEN @start AND @end
  UNION ALL SELECT *, 'Facebook iOS14'  AS network_label FROM `…management_dashboard_fb_ios14`   WHERE date BETWEEN @start AND @end
  UNION ALL SELECT *, 'Apple Search Ads' AS network_label FROM `…management_dashboard_apple`     WHERE date BETWEEN @start AND @end
  UNION ALL SELECT *, 'Google Ads'       AS network_label FROM `…management_dashboard_google`    WHERE date BETWEEN @start AND @end
  -- TikTok / LinkedIn intentionally excluded until BI confirms pipelines are healthy.
)
```

(`network_label` is added because the `PLATFORM` column inside the tables
uses inconsistent strings like `"Facebook"` vs `"AppleSearchAds"` — using
our own labels here insulates Lumen from upstream casing changes.)

### View 1: One client, all platforms — `/dashboard?client=<slug>`

- **Data sources:** the `base` CTE above filtered to a single client.
- **Grain after aggregation:** one row per `(date, network_label)`.
- **Query shape:**

```sql
SELECT
  date,
  network_label                                         AS platform,
  SUM(cost_usd)                                         AS spend,
  SUM(installs)                                         AS installs,
  SUM(revenue)                                          AS revenue,
  SUM(num_ftd7)                                         AS ftd_d7,
  SAFE_DIVIDE(SUM(cost_usd), SUM(installs))             AS cpi,
  SAFE_DIVIDE(SUM(revenue), SUM(cost_usd))              AS roas
FROM base
WHERE LOWER(TRIM(master_account)) = @client_key
GROUP BY date, platform
ORDER BY date, platform;
```

Plus a flat KPI roll-up:
```sql
SELECT
  SUM(cost_usd) AS spend, SUM(installs) AS installs,
  SAFE_DIVIDE(SUM(cost_usd), SUM(installs)) AS cpi,
  SAFE_DIVIDE(SUM(revenue), SUM(cost_usd)) AS roas
FROM base WHERE LOWER(TRIM(master_account)) = @client_key;
```

- **Filters that apply:** the global date range + client. No date partition
  filter is *possible* (tables aren't partitioned) but the filter still
  reduces final-row count and lowers any UI memory pressure.
- **Performance:** the 4-table union for a 30-day window scans **~110 MB**
  (the same as the cross-platform client-list query). For 90 days, ~110 MB
  still (these tables are small in absolute terms; the date filter is
  applied after the scan because of no partitioning). Cost ~$0.0005/query.
  Acceptable for now.
- **Gaps:**
  - No `adset_id` / `creative_id` — for adset/creative drill-down we'd need
    the per-platform `dwh_*` tables. Out of scope for Phase 1.
  - `revenue` is the raw single-column number — no D0/D7/D14 cohort split.
    The `v_agent_globalcomix` table has these, but the management_dashboard
    layer doesn't. The four currently-active clients are gaming + utility
    apps where the simple revenue field is the right primary metric, so
    fine for Phase 1 — but flag for any future fintech / subscription
    client where cohort revenue is the thing.
- **Open Q for BI:**
  - Q4.1 Why is "Video Poker" three different `master_account_id`s on
    three platforms but one client commercially? Is this intentional or a
    config bug? Lumen will treat them as one; BI may want to merge.

### View 2: All campaigns in the company — `/campaigns`

- **Data sources:** the same `base` CTE.
- **Grain:** one row per `(master_account, network_label, campaign_id)`.
- **Query shape:**

```sql
SELECT
  ANY_VALUE(master_account)                             AS client,
  network_label                                         AS platform,
  campaign_id,
  ANY_VALUE(campaign_name)                              AS campaign_name,
  ANY_VALUE(campaign_status)                            AS campaign_status,
  SUM(cost_usd)                                         AS spend,
  SUM(installs)                                         AS installs,
  SUM(revenue)                                          AS revenue,
  SAFE_DIVIDE(SUM(cost_usd), SUM(installs))             AS cpi,
  SAFE_DIVIDE(SUM(revenue), SUM(cost_usd))              AS roas,
  MAX(date)                                             AS last_activity,
  ARRAY_AGG(STRUCT(date, cost_usd) ORDER BY date DESC LIMIT 7) AS sparkline_7d
FROM base
WHERE date BETWEEN @start AND @end
GROUP BY platform, campaign_id
ORDER BY spend DESC
LIMIT @page_size OFFSET @offset;
```

- **Filters:** global date + client (optional) + channel (optional) +
  status (optional, but see Gaps below).
- **Performance:** same ~110 MB scan. The ARRAY_AGG sparkline is computed
  in-place so no second round-trip. Pagination is offset-based; for the
  current ~1,300 active campaigns over a year, that's fine. If campaigns
  ever exceed ~50K, switch to keyset pagination on `(spend DESC, campaign_id)`.
- **Gaps:**
  - `campaign_status` is often NULL on historical rows. Use it for the
    "running now" badge only, not as a filter — fall back to recency.
  - `(platform, campaign_id)` is not a stable cross-platform key. Two
    platforms could have the same `campaign_id` value; we include
    `network_label` in the grain to disambiguate.
- **Open Q for BI:**
  - Q4.2 Is `campaign_id` guaranteed unique within `(master_account_id,
    PLATFORM)` historically? I see ~22 campaigns for GlobalComix in
    `dwh_fb2_globalcomix` but 1,337 across `management_dashboard_fb2` —
    consistent with one row per campaign per day. Confirm there are no
    re-used ID values.

### View 3: All clients — `/clients`

- **Data sources:** the same `base` CTE (or just the §3c query, run as the
  page query).
- **Grain:** one row per `LOWER(TRIM(master_account))`.
- **Query shape:** verbatim §3c, plus a `vertical` column we cannot
  populate from the warehouse (see Open Qs).
- **Filters:** none server-side — sort/filter client-side.
- **Performance:** ~110 MB scan, ~60 rows out. Cache 60 seconds.
- **Gaps:**
  - **No vertical / industry tagging**. The CLAUDE.md instructions
    classify clients as Gaming / eCommerce / Fintech / Health, but the
    warehouse exposes no such field. We can infer (e.g. "Smart Sleep
    Coach" → Health, "Keno" → Gaming) but only as a heuristic. For Phase 1,
    I propose Lumen owns a static client-vertical mapping in code or in a
    `lumen.clients` config table, and we leave the column NULL in the view.
  - **51,329 Apple rows have `master_account = NULL`**. We need a BI fix or
    we systematically lose ~$553K in spend from cross-platform views for
    Apple.
  - **GlobalComix, Playw3, and 100play are not in this list at all** —
    they live in the parallel `v_agent_*` / `dwh_<platform>_<client>`
    pipeline. The "all clients" page will be **inconsistent with the
    `/dashboard?client=globalcomix` page** until this is resolved.
- **Open Q for BI:**
  - Q4.3 Why are GlobalComix and Playw3 not present in
    `management_dashboard_*`? Is it because they were onboarded by a
    different team, after the dashboard layer was frozen? Are there plans
    to backfill them into the layer?
  - Q4.4 What's the fix for `master_account = NULL` rows in
    `management_dashboard_apple`? Are they internal yellowHEAD test
    campaigns, churned clients with deleted master_account configs, or
    a real data bug?

### View 4: All activity for one platform — `/platforms/meta`

- **Data source:** `management_dashboard_fb2` (single table — no UNION
  needed for the Meta view).
- **Grain:** depends on what the page actually shows. Two natural choices:
  - One row per `(date, master_account, campaign_id)` — the raw row of the
    underlying table.
  - One row per `(master_account, campaign_id)` aggregated over the date
    range — same as View 2 filtered to Facebook.
- **Query shape (per-campaign aggregate, the more likely UI):**

```sql
SELECT
  master_account                                        AS client,
  campaign_id, ANY_VALUE(campaign_name) AS campaign_name,
  ANY_VALUE(campaign_status) AS campaign_status,
  SUM(cost_usd) AS spend, SUM(installs) AS installs, SUM(revenue) AS revenue,
  SAFE_DIVIDE(SUM(cost_usd), SUM(installs))  AS cpi,
  SAFE_DIVIDE(SUM(revenue),  SUM(cost_usd))  AS roas,
  MAX(date)                                  AS last_activity
FROM `yellowhead-visionbi-rivery.yellowhead_prod.management_dashboard_fb2`
WHERE date BETWEEN @start AND @end
GROUP BY master_account, campaign_id
ORDER BY spend DESC;
```

- For the **iOS14** split (a real workflow at yellowHEAD because of SKAN
  attribution), also `UNION ALL` `management_dashboard_fb_ios14` and tag
  the rows.
- **Filters:** date + (optional) client.
- **Performance:** `management_dashboard_fb2` is 16 MB and 109K rows.
  Effectively free.
- **Gaps:**
  - For the `/platforms/tiktok` route, the page **must show "data is stale
    since 2025-01-30"** — see open Q 2. Don't render numbers without that
    warning.
  - The same logic applies to LinkedIn (don't ship until refreshed).
- **Open Q for BI:** see §6 open Qs 1 and 2.

### View parameter contract (Lumen ↔ BQ)

For every view, the Lumen API layer must:

1. Validate `client` against the live client list (§3c result). Reject if
   not present. **Do not** rely solely on `ALLOWED_CLIENTS` env var; the
   warehouse is the source of truth.
2. Bind `start` / `end` as `DATE` query parameters, never interpolate.
3. Bind `client_key` as a `STRING` parameter, never interpolate. (The
   warehouse name is interpolated server-side from `bq-security.ts` and is
   never client-controlled, which is already the pattern.)
4. Use `LOWER(TRIM(master_account))` everywhere for client filtering.

---

## 5. Recommended abstraction layer for Lumen

### 5a. The three options

| Option | What it is | Pro | Con |
|---|---|---|---|
| **A. Query the management_dashboard_* tables directly** | Lumen issues the union in TypeScript and queries BQ for each page load. | Zero new BQ infra. Lumen controls the SQL. Easy to change. | The union is repeated in every endpoint. BI rename of a column breaks Lumen with no buffer. |
| **B. Build a thin Lumen-owned view in BQ** | A single `CREATE VIEW lumen.fact_daily AS SELECT … FROM management_dashboard_fb2 UNION ALL …`. Lumen reads only `lumen.fact_daily`. | One SQL change point. Auditable. BI can see exactly what Lumen depends on. Cheaper to maintain. | Requires write permission to a Lumen-owned dataset (BI must create it). |
| **C. Pre-aggregate into a Lumen serving table** | A scheduled query refreshes `lumen.fact_daily` as a materialized table every N hours. | Fastest queries (single-table scan). Predictable cost. | More moving parts; we have to monitor refresh failures; introduces our own freshness lag on top of Looker's. |

### 5b. The recommendation

**Start with A, plan for B.**

- **For Phase 1 (UA-only, 5–8 active clients):** Option A is the cheapest
  path to "one client, all platforms" working end-to-end. The
  `management_dashboard_*` tables are already small (~110 MB to scan the
  whole union for any date range), Lumen's API layer can absorb the union
  in TypeScript, and we keep the BI team out of the critical path.

- **Plan to migrate to B by end of Phase 1:** once we know the schema is
  stable in production, ask BI to create a `lumen` dataset and grant
  Lumen-service-account write on it, and we add one view:

  ```sql
  CREATE OR REPLACE VIEW `yellowhead-visionbi-rivery.lumen.fact_daily` AS
  SELECT 'Facebook'         AS platform, * EXCEPT (PLATFORM) FROM management_dashboard_fb2
  UNION ALL SELECT 'Facebook iOS14',  * EXCEPT (PLATFORM) FROM management_dashboard_fb_ios14
  UNION ALL SELECT 'Apple Search Ads', * EXCEPT (PLATFORM) FROM management_dashboard_apple
  UNION ALL SELECT 'Google Ads',       * EXCEPT (PLATFORM) FROM management_dashboard_google
  -- Add TikTok / LinkedIn here only when their refresh is fixed.
  ```

  Lumen reads only `lumen.fact_daily` from then on. This is the change
  point where Lumen's data layer collapses from 6 references to 1.

- **Option C is unnecessary now**: query cost is already negligible, and
  the freshness story is cleaner without a Lumen-owned refresh job. Revisit
  if the warehouse grows or if Lumen ever wants sub-second response on
  cold-cache page loads.

### 5c. Ownership

- **BI team owns `management_dashboard_*`.** Lumen treats it as a public
  contract: schema stable, refresh ~daily.
- **Lumen owns the SQL inside its data-access layer** (`src/lib/bq*.ts`).
- **Lumen owns the (eventual) `lumen.fact_daily` view** — but BI has to
  create the dataset and grant write on it.
- **Lumen owns the client identity normalization** (case-folding, slug
  derivation) — that logic must not bleed into BQ.

This split is important: when something breaks, the on-call question is
*"is the data wrong (BI) or is Lumen's read of it wrong (us)?"* and the
boundary above makes it answerable.

---

## 6. Prioritized next steps

In strict order — cheapest path to a working "one client, all platforms"
view first, with each step decision-bearing only on the one before it.

1. **(Lumen, half a day)** Update `src/lib/bq-security.ts` to treat
   `master_account` as the client key for clients sourced from
   `management_dashboard_*`. Add a new query strategy alongside the
   existing `agent` and `lumen-union`:
   ```ts
   type QueryStrategy = "agent" | "lumen-union" | "management-dashboard";
   ```
   For `management-dashboard` strategy, the resolver returns the union of
   the four healthy `management_dashboard_*` tables (no per-client lookup
   needed).

2. **(Lumen, half a day)** Add an `/api/bq/clients` endpoint that runs the
   §3c query and returns the live client list. Drop it on top of a 60-sec
   cache. Use it to populate the client switcher and to validate
   `client_key` on every other endpoint.

3. **(Lumen, 1 day)** Wire `/dashboard?client=<key>` and `/campaigns` to
   the new strategy. Pick Smart Sleep Coach or Keno as the smoke-test
   client (real currently-active data, low-risk if numbers look weird).
   Cross-check totals against Looker Studio for a 7-day window.

4. **(BI + Lumen, 1 day each end)** Ask BI:
   - **Open Q 1** — Why is `management_dashboard_tiktok` stale since
     2025-01-30 while raw TikTok data is fresh? Fix or confirm out-of-scope.
   - **Open Q 2** — Why are GlobalComix and Playw3 not in the
     `management_dashboard_*` family? Plan to backfill, or accept they
     stay on the separate `v_agent_*` path and Lumen routes them via the
     existing `agent` / `lumen-union` strategies indefinitely.
   - **Open Q 3** — What's the fix for the 51K Apple rows with
     `master_account = NULL` (≈$554K in unattributed spend)?

5. **(Lumen, half a day)** Add a freshness banner to every page driven by
   `MAX(date)` from the live data. For the platform views, hide TikTok and
   LinkedIn tabs until BI confirms the pipelines are live. Use the
   `rivery_activity_anlytics.v_rivery_activity_check` view to surface
   *upstream* sync status independently — if Rivery has new data but
   `management_dashboard_*` is behind, that's a BI-side problem we want to
   detect, not absorb silently.

6. **(BI, when convenient)** Create the `lumen` dataset with one view
   (§5b). Lumen migrates to read from it; the 6-table union disappears
   from Lumen's TypeScript.

7. **(Phase 2, later)** Decide whether to bring the `v_agent_globalcomix`
   per-client granularity (adset_id, breakdowns, D0/D7/D14 cohort revenue)
   into Lumen for clients that need it. This is a real product question:
   how much of the analyst workflow needs adset-level data vs. campaign-
   level? Default answer for Phase 1 (UA-only, 5–8 active clients): no.

---

## 7. How Looker actually uses the warehouse

Pass 1 assumed Looker Studio is the warehouse's primary consumer, and that `management_dashboard_*` is the layer Looker reads. Pass 2 mined the BigQuery audit log (`yh_bq_logs.cloudaudit_googleapis_com_data_access_*`) over the 7 days ending 2026-05-11 (203,839 query jobs, 100.6 TB scanned, ~602 MB scanned to mine). Evidence: `tmp/bq-discovery/20-looker-telemetry.json`.

### 7a. Looker Studio is invisible in the audit log

Zero query jobs match any obvious Looker identity:

- `principal LIKE '%looker-studio%'`: 0 rows.
- `principal LIKE '%looker.com%'`: 0 rows.
- `principal LIKE '%data-studio%'`: 0 rows.
- `user_agent ILIKE '%lookerstudio%'`: 0 rows.
- `user_agent ILIKE '%dataStudio%'`: 0 rows.

Three possible explanations:

1. Looker queries run under a generic service-account identity that does not include "looker" in the name. The most likely candidate is `developer@yellowhead.pro`, which alone runs 161,460 jobs in 7 days (~1 query every 4 seconds). If true, we cannot distinguish Looker traffic from BI ETL traffic in the audit log.
2. Looker Studio is not currently being used much. Plausible given the Lumen project itself: yellowHEAD is building a replacement, so Looker dependence may already be tapering.
3. Looker bills to a different project, so its queries land in a different audit log.

**Either way: the Phase 1 framing "Lumen should read from `management_dashboard_*` because Looker reads it" is unsupported.** The schema, freshness, and cleanliness argument for `management_dashboard_*` still holds. The "this is what Looker uses" rationale should be dropped.

### 7b. Who actually queries the warehouse

Top 9 callers in the 7-day window:

| Principal | Jobs | Bytes scanned | Avg bytes / job | Active days |
|---|---:|---:|---:|---:|
| `developer@yellowhead.pro` | 161,460 | 32.6 TB | 207 MB | 7 |
| `yellowhead-rivery@yellowhead-visionbi-rivery.iam.gserviceaccount.com` | 34,579 | 66.9 TB | 1,982 MB | 7 |
| `singular-etl@singular-etl.iam.gserviceaccount.com` | 4,736 | 17 GB | 3.7 MB | 7 |
| `omers@yellowhead.com` (this discovery pass) | 2,172 | 584 GB | 275 MB | 3 |
| `yellowhead-visionbi-rivery@appspot.gserviceaccount.com` | 468 | 14 GB | 31 MB | 7 |
| `ramina@yellowhead.com` | 188 | 370 GB | 2,014 MB | 4 |
| `hannap@yellowhead.com` | 168 | 47 GB | 289 MB | 4 |
| `jenkins@yellowhead-visionbi-rivery.iam.gserviceaccount.com` | 48 | 0.4 GB | 8.8 MB | 7 |
| `yh-bucket-run-sa@yellowhead-visionbi-rivery.iam.gserviceaccount.com` | 14 | 0.4 GB | 32 MB | 7 |

Just two automation accounts (`developer@yellowhead.pro` and the Rivery service account) account for 96% of jobs. Three named humans appear: Omer (me, during this pass), Ramina, and Hannap. **The warehouse has essentially no real-time consumer right now.**

### 7c. Top tables actually being read

The top 10 most-read tables in the 7-day window:

| Table | Reads | Distinct callers | Total bytes |
|---|---:|---:|---:|
| `dwh_tik_tok_globalcomix_adjust` | 14,894 | 2 | 4.4 TB |
| `dwh_fb2_globalcomix_adjust` | 14,894 | 2 | 4.4 TB |
| `dwh_google_ads_globalcomix_adjust` | 14,890 | 1 | 4.4 TB |
| `ods_fb2_creatives_globalcomix` | 14,424 | 2 | 4.4 TB |
| `dwh_apple_globalcomix_adjust2` | 14,400 | 2 | 4.3 TB |
| `dwh_uni_adjust_kingdom_maker` | 7,924 | 3 | 1.0 TB |
| `dwh_uni_adjust_obsidian_knight` | 6,910 | 2 | 0.9 TB |
| `dwh_uni_appsflyer_mundo_slots` | 6,896 | 2 | 68 GB |
| `uni_fb2_creatives` | 6,816 | 2 | 2.9 TB |
| `uni_fb2_ads` | 6,816 | 2 | 2.9 TB |

**Zero `management_dashboard_*` tables appear in the top 30.** The most-read tables are per-client `dwh_*` joined-with-Adjust variants, and `uni_*` creatives / ads dimensions. These are ETL inputs feeding the chain that ultimately writes `management_dashboard_*`, not user-facing reads.

This is consistent with the picture of `developer@yellowhead.pro` running 23K jobs per day: the warehouse is mostly a giant ETL machine talking to itself, building per-client aggregates. There is no real-time analyst-or-dashboard consumer pattern in the audit log right now.

### 7d. Cost baseline Lumen has to beat

| Metric | Value |
|---|---|
| Total jobs (7d) | 203,839 |
| Jobs with billed bytes | 144,260 |
| Average bytes per job | 714 MB |
| Median (p50) | 41 MB |
| p90 | 446 MB |
| p99 | 5.0 GB |
| Max single job | 379 GB |
| Total bytes scanned (7d) | 100.6 TB |
| Average slot ms | 66,164 |
| p50 slot ms | 170 |
| p90 slot ms | 17,232 |

Lumen's planned union-over-`management_dashboard_*` scan is ~110 MB per query, which lands between p50 and p90 of the existing distribution. No cost concerns.

### 7e. The slowest queries in the warehouse

The top 5 by total slot ms are all Rivery ETL jobs building `dwh_apptweak_android_*` and `dwh_apptweak_android_reddit_comparison` tables. Slot ms in the 80M to 96M range (roughly 22 to 26 slot-hours each), scanning 51 GB per run. These are not Lumen problems but they are the warehouse's heaviest individual queries.

### 7f. What we want from BI to close the telemetry story

1. Confirm whether Looker Studio queries the warehouse under `developer@yellowhead.pro` or some other identity. If yes, we cannot separate Looker traffic from ETL traffic without changes upstream.
2. Confirm whether Looker Studio is in fact actively used. If no, the migration story for Lumen changes: there is no entrenched consumer to displace, only the dashboards themselves.
3. Grant the Lumen service account `bigquery.jobs.listAll` on the project so Lumen ops can monitor its own cost via `INFORMATION_SCHEMA.JOBS_BY_PROJECT` once it ships. Omer-the-reader does not have that permission today (denied during this pass).

---

## Appendix A — Top three open questions for the BI team

1. **TikTok dashboard is broken.** `management_dashboard_tiktok` hasn't
   refreshed since 2025-01-30. The raw `dwh_tik_tok_<client>` tables are
   still updating (e.g. `dwh_tik_tok_globalcomix` has data through
   2026-05-10). So the aggregation step into the dashboard layer is broken
   — when can it be fixed, or is TikTok deprecated as a Looker source?

2. **GlobalComix and Playw3 are missing from the dashboard layer.** They
   exist only in `v_agent_globalcomix` (which is stale by 5 weeks) and
   `v_playw3_agent` (which is stale by 7 weeks because the underlying
   Playw3 client churned). Are these clients supposed to be added to
   `management_dashboard_*`? If not, Lumen will route them through the
   legacy path forever, which means two query strategies in production
   indefinitely.

3. **`master_account = NULL` problem.** `management_dashboard_apple` has
   51,329 rows ($554K spend) with no `master_account`. These need a fix
   so they can be attributed in any "all clients" view. Are these
   internal test campaigns, churned clients, or a config gap?

## Appendix B — Things I deliberately did not investigate (out of UA scope)

Per the brief, Phase 1 is UA only — ASO/SEO/Creative/CSM are deferred. I
noticed but did not plan around:

- **`seo_screamingfrog.internal_all_prt`** — a single ScreamingFrog SEO
  crawl dump, stale Dec 2025. Organic team.
- **`yh_singular`** — 4 fresh tables (Singular MMP data) created Oct 2025.
  Could matter for Creative or CSM views later, especially around
  cross-channel install attribution. Not relevant to Meta/Apple/Google UA.
- **`pw_yh_cohort_aggregated_stats_google`** — single table; would need
  more context to know if it belongs.
- **`uni_fb2_*`** family — the unified-large tables (up to 306M rows) are
  built for analyst slicing on geo / placement / creative, not dashboard
  reading. Useful for Ask (NL query) workloads in Phase 2, not for the
  four views in this plan.
- **`receipts_users`** — failed to inspect ("Linked dataset … unlinked").
  Worth a follow-up so we know whether this is a sunset integration or a
  live one we need to relink.

## Appendix C — How to re-run the discovery

```bash
# Auth (one-time): gcloud auth application-default login
npx tsx scripts/discover-bq.ts         # full project enumeration → tmp/bq-discovery/0[1-8]-*.json
npx tsx scripts/discover-bq-focus.ts   # schemas + stats for ~24 high-value tables → tmp/bq-discovery/focus-tables.json
npx tsx scripts/discover-bq-clients.ts # cross-platform client roll-up + Rivery sample → tmp/bq-discovery/clients-rollup.json
```

These three scripts are read-only and reproducible. They were the
evidence basis for every number in this document.

The Pass 2 scripts (added 2026-05-11 afternoon):

```bash
npx tsx scripts/discover-bq-metadata.ts        # tmp/bq-discovery/09-project-metadata.json
npx tsx scripts/discover-bq-side-datasets.ts   # tmp/bq-discovery/10-side-datasets.json
npx tsx scripts/discover-bq-prefixes.ts        # tmp/bq-discovery/11-ods.json through 17-legacy-views.json
npx tsx scripts/discover-bq-md-variants.ts     # tmp/bq-discovery/18-md-variants.json
npx tsx scripts/discover-bq-telemetry.ts       # tmp/bq-discovery/20-looker-telemetry.json
```

Plus two Python analyses (no script files; ran inline):
- `tmp/bq-discovery/19-unmatched-classified.json` (Bucket 4, in-memory classifier over the Pass 1 02-tables-by-dataset.json).
- `tmp/bq-discovery/21-backups-audit.json` (Bucket 6, same).

## Appendix D — Project-level metadata

Evidence: `tmp/bq-discovery/09-project-metadata.json`.

### D.1 Per-dataset access (the meaningful authorization layer)

`omers@yellowhead.com` is `projectReaders` plus an explicit READER on `yellowhead_prod`. That is enough for read-only discovery. For Lumen's service account in production, the same level is needed on `yellowhead_prod`, plus READER on `rivery_activity_anlytics` if Lumen will show a freshness banner.

Notable per-dataset findings:

- `yellowhead_prod` writers: `projectWriters`, `developer@yellowhead.pro`, `service-929186110540@gcp-sa-bigquerydatatransfer.iam.gserviceaccount.com` (the BigQuery Data Transfer Service, which confirms scheduled transfers exist even though I cannot enumerate them).
- `yh_singular` is written by `singular-etl@singular-etl.iam.gserviceaccount.com` (Singular's own ETL identity).
- `pw_yh_cohort_aggregated_stats_google` is a `LINKED` dataset (Analytics Hub subscription), not a default dataset. Owner on our side is `ramina@yellowhead.com`.
- `receipts_users` is also a `LINKED` dataset (Analytics Hub) subscribed to a Pocket Worlds / Metica personalization listing published by external project id `459308824437`. The source publisher has unlinked the listing; subscription is stale.
- `yellowhead_temp` has `vantor_1@hotmail.com` as a named WRITER with a personal Hotmail address. Flag for IAM hygiene.
- `yh_bq_logs` is written by `cloud-logs@google.com` (GCP Cloud Logging sink) and `billing-export-bigquery@system.gserviceaccount.com` (billing export). Confirms it is the BigQuery audit log destination.

### D.2 Routines, RLS, transfers

- **Stored procedures / UDFs across 13 datasets: 0.** No project-level business logic is encoded in routines. Everything lives in views and (presumably) in scheduled queries we cannot see.
- **Row-access policies: 0** across all datasets. Authorization is dataset-level only.
- **Authorized views: cannot enumerate.** `INFORMATION_SCHEMA.OBJECT_PRIVILEGES` requires a literal `WHERE object_name = '...'` predicate in every query, so global listing is not possible. This remains an open ask.

### D.3 Permission gaps Lumen needs to know about

These three things are denied to the current discovery caller:

1. **Project IAM listing** (`resourcemanager.projects.getIamPolicy`). Denied. Cannot enumerate project-level roles.
2. **Scheduled queries / data transfers** (`bigquery.transfers.get`). Denied. Cannot enumerate scheduled queries, so we cannot directly verify the daily refresh cadence of `management_dashboard_*` from outside; we only see the effects (modified timestamps).
3. **Audit log JOBS_BY_PROJECT** (`bigquery.jobs.listAll`). Denied. Telemetry has to go through the Cloud Audit log sink at `yh_bq_logs` instead, which works but is more expensive.

None block Lumen reads. All three block Lumen ops from auditing the pipeline cleanly.

## Appendix E — Side-dataset detail and parallel pipelines

This appendix consolidates everything Pass 2 learned about datasets outside `yellowhead_prod`.

### E.1 `rivery_activity_anlytics` (note the typo in the dataset name)

Evidence: `tmp/bq-discovery/10-side-datasets.json`.

| Table | Rows | Size | Use |
|---|---:|---:|---|
| `rivery_activities` | 299,534 | 89 MB | Per-run log. Columns: `run_id`, `status`, `source_name`, `target_name`, `start_date_utc`, `end_date_utc`, `error_description`, `rpu`. **This is the freshness source.** |
| `river_level_activities` | 352,662 | 102 MB | Per-river daily aggregate. Has `last_run`, `total_files`, `units`, `total_size`, `pending`, `failed`, `running`. |
| `run_level_activities_unflattened` | 280,077 | 101 MB | Paginated raw run data. Most pages empty. Unlikely Lumen-useful. |
| `v_rivery_activity_check` | (view) | — | Shape: `date, river_name, total_rpu, target_name, rpu_per_date`. Definition not inspected; pre-aggregated. |

Lumen's freshness banner can query `rivery_activities WHERE status = 'succeeded'` and `end_date_utc DESC LIMIT 1` per pipeline, or read `river_level_activities.last_run`. Open question Q-Side-3: which is canonical?

### E.2 The Singular / Pocket Worlds parallel pipeline

This is the most significant cross-dataset finding of Pass 2.

`yh_singular` (5.7 TB total, all 4 tables modified today):

| Table | Rows | Size | Date range |
|---|---:|---:|---|
| `singular_events` | 2,647,920,667 | 5,882 GB | 2025-10-02 to today (hourly grain) |
| `singular_creative` | 30,496,818 | 9.5 GB | 2025-01-19 to today |
| `singular_keyword` | 32,131,690 | 8.7 GB | 2025-01-19 to today |
| `singular_cohort` | 1,609,556 | 463 MB | 2025-01-19 to today |

Apps in the data: `Venue` and `com.superbloomgames.atable` (Superbloom Games). Sources include Apple Search Ads, Unity Ads, Moloco, AppLovin.

`pw_yh_cohort_aggregated_stats_google` (LINKED Analytics Hub dataset):

- One table `cohort_aggregated_stats`, 2.6M rows, 1.4 GB, 211 columns.
- Date range 2025-03-01 to 2026-05-10 (today). Refreshed yesterday.
- Columns include `attribution_type` (first_touchpoint / last_touchpoint / hybrid), `is_first_attribution`, `is_last_attribution`, `is_hybrid_attribution`, `attribution_date`, `cohort_age`, `channel`, `platform`, `country_code`, `dma`, `campaign_id`, `campaign_name`, `sub_campaign_id`, `sub_campaign_name`, `creative_id`, `creative_name`, `keyword_id`, `keyword_name`, `publisher_id`, `publisher_name`.
- Channels seen in sample: Moloco, Apple Search Ads.
- Apps in sample: same Superbloom `Venue` and `atable`.
- Owner is `ramina@yellowhead.com`. Source publisher is project id `459308824437` (external; identity unknown).

Plus a long tail of `dwh_*_superbloom_venue`, `dwh_*_pocket_worlds_highrise`, `dwh_*_obsidian_knight`, `dwh_*_kingdom_maker`, `dwh_*_mundo_slots` tables in `yellowhead_prod`. None of these clients are in `management_dashboard_*`.

**Product question (not data question):** should Lumen surface the Superbloom Games / Pocket Worlds clients in its UI, even though they use a fundamentally different pipeline than the other clients? This needs Omer's call. The data is richer (cohort attribution, multi-touch), but the path is parallel to the management_dashboard_* one.

### E.3 The rest of the side datasets

- `seo_screamingfrog.internal_all_prt`: one-shot SEO crawl of yellowHEAD's own marketing site (yellowhead.com), Dec 2025, 3,167 rows. Not relevant to Lumen.
- `yellowhead_temp`: empty (0 tables). Confirmed.
- `receipts_users`: confirmed-stale Analytics Hub subscription. Source listing has been unlinked by the publisher.

### E.4 The ML anomaly precedent

In `yellowhead_prod`, two unprefixed clusters look like an existing anomaly-detection precedent:

- `ml_superbloom_*` (Dec 2025, 6 tables): `ml_superbloom_fact_daily_series_3lvl` (148K rows), `ml_superbloom_features_overall` (3K rows), `ml_superbloom_financial_incidents_overall` (1.2K rows), `ml_superbloom_breakdown_bucket_map` (2K rows), `ml_superbloom_v_ua_raw` (VIEW), `ml_superbloom_v_incident_drilldown` (VIEW).
- `metalstorm_*` (Oct 2025, 8 tables): `metalstorm_installs_anomalies`, `metalstorm_daily_installs_by_activity`, `metalstorm_anomaly_report_by_activity_us`, etc.

These look like exactly the kind of artifacts Lumen's Feed and AI-Mode capabilities would produce. Built by an unknown owner. Coordinating with them is more valuable than reinventing.

### E.5 The rolling-sample backups

`yellowhead_bkp_us_1m` is a live rolling 1-month sample (13 tables refreshed 2026-05-01, including `dwh_fb2_all` at 299M rows / 282 GB). Its sister `yellowhead_bkp_us_6m` rotates every 6 months (26 tables, last refresh 2026-01-01). Neither is a Lumen source, but knowing this exists is useful for fallback discussions. The other four bkp datasets (`yellowhead_bkp`, `yellowhead_bkp_archieved_tables`, `yellowhead_training`, `yellowHEAD_SQL_exam`) are confirmed dead.
