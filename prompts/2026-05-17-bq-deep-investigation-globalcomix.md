# BigQuery deep investigation — GlobalComix data coverage (2026-05-17)

Owner: Omer. Single investigation pass, read-only BQ queries against `yellowhead-visionbi-rivery.yellowhead_prod`. Authentication already configured (see `src/lib/bq.ts` — service account via `GOOGLE_APPLICATION_CREDENTIALS_JSON` or ADC). This is a research workstream that produces two deliverables; no production code changes in this PR.

## Why this is happening

Tier 1 dashboard work (OS + platform filters, cadence aggregation, weekends panel) was specced at `prompts/2026-05-17-dashboard-tier1-filters-cadence-weekends.md`. Before that PR lands, we need to confirm what BigQuery data is actually reachable for the Tier 2 / Tier 3 workstreams (Subscriber Lifecycle, Paid vs Organic + BCAC, Geographic, Adset, Creative drilldown, Attribution Validation). The principle:

**Every chart Looker shows is rendered from data physically present in BigQuery. We do not yet know how much of it lives in tables we already query, how much lives in tables we don't query, and how much lives in client-pushed sources that may not be in BQ at all.**

This investigation answers that question completely. Output drives the next two prompts: query-layer upgrades and analyst/agent updates.

## Prior context

A previous discovery pass ran 2026-05-11 (`tmp/bq-discovery/00-meta.json`). Useful prior findings, all needing fresh verification:

- 13 GlobalComix-related `dwh_*` tables found, not the 4 we currently query.
- **`dwh_total_subs_globalcomix` exists** — likely the source behind Looker's "Total Sub & Churn View" lifecycle page. We have never touched it.
- Each ad platform has both a base table (`dwh_fb2_globalcomix`) and an `_adjust` variant (`dwh_fb2_globalcomix_adjust`). We use `_adjust`. The base versions may be platform-self-reported (the data behind the iOS Attribution Validation page).
- `dwh_google_ads_final_globalcomix` is a "final" variant of unknown purpose.
- `dwh_mntn_globalcomix` exists. MNTN is documented as dead in `Status.md` — exclude from analysis but note it in the table inventory.
- **AppLovin did not show up in the prior grep.** Looker has a full AppLovin section so the data must exist somewhere. Either the prior discovery missed it (scope was narrow) or the table is named in a way the grep didn't catch (e.g. `dwh_alv_*`, `dwh_applov_*`, `dwh_max_*` for MAX/AppLovin Audiences). **Confirm explicitly.**

Reference docs for what the team uses Looker for, including which metrics map to which Looker page:

- `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md` — structural map of all 9 analytical frames in the Looker dashboard and the metric vocabulary each one uses.

Existing query module to compare against:

- `src/lib/globalcomix-queries.ts` — what we pull today, with extensive comments explaining warehouse quirks (Meta `campagin_name` typo, fan-out via `breakdown_type`, Google iOS attribution filter, etc.).
- `src/lib/bq-security.ts` lines 132-158 — multi-source config: which tables are wired, OS handling per source.

## Deliverables

Two artifacts. Both versioned under the vault and the repo so they survive the session.

### Deliverable 1: investigation report

Path: `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md`

Comprehensive markdown report following the structure in "Report shape" below. This is the source of truth that drives every follow-up prompt.

### Deliverable 2: machine-readable artifact set

Path: `tmp/bq-discovery/2026-05-17-globalcomix/` (new subdirectory).

JSON files, one per phase of the investigation, so any follow-up script can read structured data without parsing markdown. Suggested file names listed under each phase.

## Investigation phases

Execute in order. Each phase produces a JSON output file. Phase F (the synthesis) reads all prior outputs and writes the markdown report.

### Phase A — Table inventory

Goal: enumerate every table in `yellowhead-visionbi-rivery.yellowhead_prod` whose name contains `globalcomix` (case-insensitive), plus any table that might serve GlobalComix without containing the slug (rare but possible — e.g. shared dim tables).

Queries:

```sql
-- All tables touching globalcomix by name
SELECT table_name, table_type, creation_time, row_count, size_bytes,
       TIMESTAMP_MILLIS(last_modified_time) AS last_modified
FROM `yellowhead-visionbi-rivery.yellowhead_prod.__TABLES__`
WHERE LOWER(table_name) LIKE '%globalcomix%'
ORDER BY table_name;
```

For each table found, also pull:

```sql
SELECT column_name, data_type, is_nullable
FROM `yellowhead-visionbi-rivery.yellowhead_prod.INFORMATION_SCHEMA.COLUMNS`
WHERE LOWER(table_name) = LOWER('<table>')
ORDER BY ordinal_position;
```

Output: `tmp/bq-discovery/2026-05-17-globalcomix/A-table-inventory.json` — array of `{ table, type, rowCount, sizeBytes, lastModified, columns: [{name, type, nullable}] }`.

Also run a broad search for likely AppLovin / web / creative-level table names with these substrings: `applovin`, `alv`, `max`, `creative`, `ad_level`, `web`, `fb_web`, `google_web`, `tt_web`. Report any matches even when they're not GlobalComix-specific (their existence tells us whether the data type exists in this warehouse at all).

### Phase B — Spend-table internal structure

Goal: for each ad-platform spend table (`dwh_fb2_globalcomix_adjust`, `dwh_google_ads_globalcomix_adjust`, `dwh_tik_tok_globalcomix_adjust`, `dwh_apple_globalcomix_adjust`, plus their non-`_adjust` counterparts and any AppLovin / web variants Phase A surfaced), decode:

1. **What `breakdown_type` values exist** and how many rows each has in the last 90 days:

```sql
SELECT breakdown_type, COUNT(*) AS row_count, MIN(date) AS min_date, MAX(date) AS max_date
FROM `yellowhead-visionbi-rivery.yellowhead_prod.<table>`
WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY breakdown_type
ORDER BY row_count DESC;
```

2. **For each non-`No Breakdown` slice**, sample 5 rows and report which extra columns are populated (Country, Placement, Network, Creatives, Adset, etc.):

```sql
SELECT * FROM `yellowhead-visionbi-rivery.yellowhead_prod.<table>`
WHERE breakdown_type = '<slice>' AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
LIMIT 5;
```

3. **The dimensions available across all slices.** For each table, report:
   - Whether `os` is populated, and on which `breakdown_type` slices it has non-null values (this is critical — `bq-security.ts` says Google `os` is empty on No Breakdown; verify and check whether it's populated on other slices)
   - Whether `adset_id` / `adset_name` / `ad_id` / `ad_name` columns exist (any slice)
   - Whether `country` exists as a column on a Country slice
   - Whether `placement` / `network` / `creative_name` exist on their respective slices
   - Whether platform-self-reported install columns exist (e.g. `installs_p` vs `installs_a`, `mobile_app_install`, `app_install_attributions`, etc. — sniff column names that look platform-attributed vs Adjust-attributed)

Output: `tmp/bq-discovery/2026-05-17-globalcomix/B-spend-table-structure.json`.

### Phase C — Cohort table deep-decode

Goal: fully understand `uni_adjust_cohort_report_globalcomix`. We use roughly 10 columns out of probably 50+. The other 40 may hold most of the Looker data.

1. Full column list with types (already from Phase A; pull again for completeness here).

2. **Distinct `_Network_Attribution` values** with row counts in last 90 days:

```sql
SELECT _Network_Attribution, COUNT(*) AS rows, MIN(_Day_Date) AS first_seen, MAX(_Day_Date) AS last_seen
FROM `yellowhead-visionbi-rivery.yellowhead_prod.uni_adjust_cohort_report_globalcomix`
WHERE _Day_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY _Network_Attribution
ORDER BY rows DESC;
```

The dropped bucket (`ELSE NULL` in our code) almost certainly contains `'Organic'`. **Confirm.** This is the unlock for Paid vs Organic + BCAC.

3. **Distinct `_OS_name` values** with row counts.

4. **Country dimension probe.** Query for any column matching `country` (case-insensitive) or `_geo` or `_region`. If none, check whether there's a sibling cohort table keyed by country (e.g. `uni_adjust_cohort_report_globalcomix_country` or similar).

5. **All `_*_subscription_*` and `_*_trial_*` columns**, with a sample non-zero row from each. Goal: map the full subscription funnel (Trial Start, Sub Start D0, Sub D0, Sub D7, Sub D14) to authoritative columns and document which is the canonical source for each metric.

6. **All `_*_Revenue_*` columns** — we already pull D0/D7/D14/D30/D90, confirm and list any others.

7. **All `_*_Cohort_*`, `_*_Retained_*`, `_*_Paying_*` columns** — we use a few; list all.

Output: `tmp/bq-discovery/2026-05-17-globalcomix/C-cohort-table-deep.json`.

### Phase D — Subscription / churn investigation

Goal: understand `dwh_total_subs_globalcomix` end-to-end. **This is the biggest single unlock if it carries what Looker shows.**

1. Schema (from Phase A).
2. Date range and row count.
3. Grain: is it daily? Per-user? Per-(date, OS)? Sample 20 rows ordered by date desc.
4. **Does it carry Sub, Churn, and Net Sub as columns?** Or are those derived in Looker from a `state` column with a `'active'` / `'cancelled'` enum? Or is it events (one row per subscribe / cancel event)?
5. Cross-reference grain with Looker's "Total Sub & Churn View":
   - Daily Sub / Churn / Net Sub table — does this table support it directly or do we need to derive?
   - OS donut (iOS 66.6%, Android 26.2%, Web 7.2%) — is there an OS column on this table?
6. **Is this client-pushed or Adjust-pushed?** Look for a `_Sync_Day` or `last_updated` style column. Compare freshness to the spend tables.

Also: search the dataset for any **sibling tables** with names like `dwh_subs_*`, `dwh_subscription_*`, `dwh_user_*`, `dwh_event_*`. Look for anything that might carry sub events at a finer grain than `dwh_total_subs`.

Output: `tmp/bq-discovery/2026-05-17-globalcomix/D-subscription-churn.json`.

### Phase E — AppLovin, web, and creative-level investigation

Goal: confirm or deny three things.

1. **AppLovin spend.** Looker shows it. Where does it live?
   - Search `INFORMATION_SCHEMA.TABLES` for any table containing `applovin`, `alv`, `max`, `audience_network` (Facebook Audience Network historically powered AppLovin in some workflows).
   - If a candidate exists, dump schema and last-90d row count. Confirm the network attribution string matches what would join to the cohort table.

2. **Web-specific spend.** Looker's "General Web" section pulls from somewhere distinct from the mobile spend tables.
   - Either web data is on the existing `dwh_fb2_globalcomix_adjust` etc. (an `os = 'web'` row?) — verify in Phase B
   - Or there's a separate set of tables (`dwh_fb_web_*`, `dwh_google_web_*`, `dwh_tt_web_*`, etc.) — search for them
   - Also check for `dwh_*_globalcomix_web_*` or `uni_*_globalcomix_web_*` patterns

3. **Ad-level / creative-level cohort.** Looker's TikTok Creative Breakdown shows per-ad funnel metrics. The current cohort table is keyed by `(_Day_Date, _Network_Attribution, _OS_name)` — that's network-level, not ad-level. Either:
   - There's a parallel cohort table keyed by `ad_id` or `creative_id` (search for `uni_adjust_cohort_report_globalcomix_creative` or similar)
   - Or the creative dimension is on a slice of the existing spend tables (a `breakdown_type = 'Creatives'` slice) and Looker joins creative to revenue via campaign_id + day, accepting some attribution looseness
   - Or it's not in BQ at all and Looker pulls from a different source

Document what's there. Sample rows from any creative-level table.

Output: `tmp/bq-discovery/2026-05-17-globalcomix/E-applovin-web-creative.json`.

### Phase F — Looker frame → BQ source mapping

Goal: for every chart and KPI on every page of the Looker dashboard described in `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`, identify the exact `(table, column, breakdown_type, filter)` tuple in BigQuery that produces it.

This is the synthesis phase. It reads outputs A-E and writes the markdown report. For each frame, the output should include:

- **Frame name** (e.g. "Subscriber Lifecycle")
- **Looker page(s)** that render it
- **Data points on the page** (every KPI tile value, every chart series, every table column)
- **Per data point: BQ source verdict**, one of:
  - ✅ **Already in our queries** — `globalcomix-queries.ts` already pulls this. Cite the function name and column.
  - 🟡 **In a table we query, not currently exposed** — table + column + any required `breakdown_type` predicate. Cite the SQL change needed (one line typical).
  - 🟠 **In a different BQ table we don't query** — table name, column, grain. Cite the new query module needed.
  - 🔴 **Not in BigQuery** — flag as unreachable from this layer; note whether it's client-pushed, third-party, or unknown.
  - ❓ **Unknown** — investigation needed (rare; should be near-zero after Phases A-E).

- **Per data point: known data-quality caveats** (e.g. Google iOS attribution gap, Meta typo column, freshness lag, fan-out predicate required).

Order frames in roughly the order from the prior-art doc:

1. Period Overview (KPI tiles + trend + country donut + Top-N country table)
2. Activity Overview (channel breakdown table + donut + multi-series trend)
3. Activity Overview new comparison (single-row scorecard with conditional coloring)
4. Monthly View / Weekly View / Daily (per-period aggregated table + per-campaign side-by-side)
5. Weekends vs working days (two-row comparison + bar chart)
6. Total Sub & Churn View (daily Sub/Churn/Net Sub + OS donut + Net Sub Over Time)
7. Paid vs Organic View (KPI tiles inc. BCAC + Net Sub trend + Paid/Organic donut + Spend & BCAC dual-axis)
8. Campaign View / Adset View (per-row drilldown with full funnel)
9. Creative Breakdown / Creative Overview (per-ad table + Top Ad trend chart)
10. Geographic / GEO (donut + choropleth + per-country table)
11. Adjust vs Platforms (iOS) (two stacked tables, same metrics, different attribution sources)
12. Metric Definitions page (the formula glossary — note the per-channel event-name map)

Output: the vault markdown document (Deliverable 1).

## Report shape

The vault markdown should follow this structure:

```markdown
# BQ Investigation — GlobalComix Data Coverage (2026-05-17)

Tags: #technical #bigquery #globalcomix #investigation
Related: [[Prior Art - GlobalComix UA Looker Dashboard (2026-05-17)]] | [[BigQuery Warehouse]] | [[Data Infrastructure]]

## Executive summary
- 3-5 sentences: how much of the Looker dashboard is reachable from BQ today, what's the biggest single unlock, what (if anything) is genuinely missing.

## Warehouse map
- Table inventory grouped by purpose (spend / cohort / subscription / dim / management dashboard).
- For each table: one-line description, grain, refresh cadence (inferred from `last_modified` or `_Sync_Day`-like column), freshness lag.

## Frame-by-frame coverage
- One section per Looker frame following the verdict format above.
- Each data point gets a row in a coverage table.

## The four buckets (synthesis)
- Bucket 1 — Already in our queries: list every Lumen query function and the data points it serves, plus any unused columns we already pull.
- Bucket 2 — In tables we query, needs new SQL: list every (table, column or breakdown_type slice) we don't expose. For each, the SQL change needed.
- Bucket 3 — In other BQ tables: list every new table we'd need to wire into the multi-source UNION or a new query module. For each, the join shape.
- Bucket 4 — Not in BQ: list anything genuinely unreachable, with our best guess at the source (client-pushed, third-party, schema gap).

## Recommendations
- Concrete next-step list. For Buckets 1+2, the SQL changes can ship in one PR (Tier 2 query upgrade prompt). For Bucket 3, each new table is its own workstream. For Bucket 4, the asks go to Gabby.

## Open questions
- Questions that need Gabby / Ramina / client to answer (kept minimal — most should be answered by the investigation itself).
```

## Operating rules

- **Read-only.** No `CREATE`, `INSERT`, `UPDATE`, `DELETE`, or `MERGE`. Every query in this investigation is a `SELECT`.
- **Cap query bytes.** Use `--maximum_bytes_billed` or partition predicates on `date` / `_Day_Date` to keep any single query under 5 GB scan. The dataset is in US region; respect that location.
- **Sample where possible.** For schema inspection, 5 rows is enough. For breakdown_type enumeration, last 90 days is enough.
- **Don't truncate the report.** The markdown should be comprehensive — this is the source-of-truth artifact. Length is fine (the prior-art doc is ~400 lines and that's healthy).
- **Cite line:col in the existing code where relevant.** When the verdict references `globalcomix-queries.ts` or `bq-security.ts`, link to the exact spot.
- **No code changes to Lumen in this PR.** Discovery + report only. The query-layer upgrade is a separate prompt that this report unblocks.

## Acceptance criteria

- All 6 phase JSON files exist in `tmp/bq-discovery/2026-05-17-globalcomix/`.
- The vault markdown is written, internally linked, and follows the structure above.
- Every Looker analytical frame from the prior-art doc has a verdict in the markdown.
- Bucket 4 (genuinely not in BQ) is named explicitly. If empty, say "empty — every Looker data point is reachable from BQ".
- AppLovin's status is resolved (found or definitively not present in any GlobalComix-related table).
- `dwh_total_subs_globalcomix` is fully decoded (grain, schema, source pipeline, freshness).
- The "Open questions" section has 3 or fewer items. If more, push harder on the investigation.

## What this unblocks

After this lands, the next two prompts become writeable:

1. **Tier 2 query-layer upgrade** — extends `globalcomix-queries.ts` to expose Bucket 2 data (organic, country, multi-window revenue, OS dimension on cohort, adset dimension, platform-self-reported installs) and adds new query modules for Bucket 3 tables (`dwh_total_subs_globalcomix`, AppLovin, web-specific, creative-level).

2. **Analyst layer + agent updates** — extends `src/lib/analyst/` to read the new data, extends Smart Reports to write about it. Hermes, Smart Reports, and the upcoming dashboard upgrades all consume from the analyst layer, so this is the single point of integration.

The dashboard UI upgrades from the Tier 1 prompt (OS filter, platform filter, cadence table, weekends panel, scorecard styling) are independent of this investigation and can ship in parallel.
