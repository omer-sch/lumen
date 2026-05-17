# GlobalComix full implementation: bug fixes + AppLovin + Bucket 2/3 query expansion + dashboard filter spine + new analytical views (2026-05-17)

Owner: Omer. Single large PR on a new branch off `main` named `globalcomix-full-implementation`. Closes the gap between Lumen's `/dashboard` and the GlobalComix UA Looker dashboard the yellowHEAD team relies on today. Supersedes the two earlier prompts (`2026-05-17-dashboard-tier1-filters-cadence-weekends.md` and `2026-05-17-bq-deep-investigation-globalcomix.md`); both are kept on disk for traceability only.

## Spec

The source-of-truth spec for what data exists and where is the BQ investigation report at:

**`Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md`** (~27 KB, 300 lines, written by Claude Code on 2026-05-17 from 6 phases of read-only BQ discovery).

The structural map of what the team uses Looker for today is at:

**`Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`**.

Read both before starting. This prompt is the implementation plan that turns the investigation's "Bucket 2 + Bucket 3" recommendations into shipped code. The investigation's "Bucket 4" items (SKAdNetwork stale, Pubmint missing spend, `event_date` semantics) are open questions for Gabby and are out of scope here.

## TL;DR

Eight workstreams in one PR. Ship order inside the PR matches the numbering. Each workstream is independently reviewable; bundle them so a single end-to-end test pass validates the whole.

1. **WS1 — Bug fix foundation.** Three live bugs found by the investigation: TikTok `osStrategy` (silently zeroes TikTok under any OS filter), Organic bucket dropped (`ELSE NULL` in cohort), `roas: 0` hard-coded on campaigns query. Refactor `MultiSourceTable.hasOs` to a richer `osStrategy` type while we're in there.
2. **WS2 — AppLovin wire-in.** Three lines of config plus two cohort attribution branches. Trivial code change, unlocks the AppLovin chip + chapter everywhere.
3. **WS3 — Cohort dimensional expansion.** The biggest unlock. Today we use 10 of 39 columns on `uni_adjust_cohort_report_globalcomix` and aggregate to `(date, network)`. Expose `_Country`, `_Campaign_ID`, `_Ad_ID`, `_Creative_Attribution`, the Organic bucket, the Sub Start / Trial Start event columns, and the D14/D30/D90 windows. Single SQL file change.
4. **WS4 — New module: subscriber lifecycle.** `src/lib/globalcomix-subs-queries.ts` reading `dwh_total_subs_globalcomix` for daily Sub / Churn / Net Sub. Drives the Looker Total Sub & Churn View. Web shows up as an OS here.
5. **WS5 — New query functions: weekends, geo, creatives, attribution validation.** Four new exports in `globalcomix-queries.ts`. Each reads from tables we already query.
6. **WS6 — Global filter spine: OS + Platform.** URL-driven filter state (`?os=`, `?platforms=`), new chips in `TopBar.tsx`, thread through all API routes, thread through every BQ query that respects scope. Web added as the fourth OS value.
7. **WS7 — Dashboard UI: cadence table, weekends card, scorecard styling, new sections.** Five additive UI changes to `/dashboard` that consume WS3/4/5/6.
8. **WS8 — Cache warming + tests.** Extend the warmer to cover the 8 common (OS × platform) combos. Comprehensive unit + E2E coverage. Update `Status.md` and `Decisions.md` at the end.

Estimated test count delta: +80 to +120 unit tests, +6 E2E specs.

Estimated PR size: 30-50 files touched. Roughly half is `globalcomix-queries.ts` SQL work, half is UI + new modules + tests.

---

## WS1 — Bug fix foundation

### Background

The 2026-05-17 BQ investigation surfaced three live bugs in production.

### WS1.A — TikTok `osStrategy` silently zeroes when OS filter ≠ Total

#### Today

`src/lib/bq-security.ts:149` declares `{ table: "dwh_tik_tok_globalcomix_adjust", network: "TikTok", hasOs: true }`. The investigation confirmed the `os` column on this table is **100% NULL across 90 days**. OS information for TikTok lives in `campaign_name` instead (the `YH_TT_*_iOS_*` / `YH_TT_*_Android_*` token pattern). The current code, the moment we ship the OS filter in WS6, will issue `WHERE LOWER(os) = 'ios'` against TikTok rows and return zero. Silent data loss.

#### Refactor: replace `hasOs: boolean` with `osStrategy`

`hasOs: boolean` is a leaky abstraction. The four sources actually have four different OS-resolution shapes. Make the type carry the strategy:

```ts
// src/lib/bq-security.ts
export type OsResolutionStrategy =
  | "column"          // os column populated; use WHERE LOWER(os) = @os
  | "campaign_name"   // os encoded in campaign_name; infer via classifier
  | "implicit_ios"    // source is iOS-only by definition (Apple ASA)
  | "none";           // no OS dimension reachable; include only when OS=total

export type MultiSourceTable = {
  table: string;
  network: string;
  osStrategy: OsResolutionStrategy;
  /** Earliest date the source has spend rows. Used to surface a date-coverage
   *  warning when the active date window starts before this. */
  coverageStart?: string; // ISO date
};
```

Set per source:

```ts
spendSources: [
  { table: "dwh_fb2_globalcomix_adjust",       network: "Meta",              osStrategy: "column" },
  { table: "dwh_google_ads_globalcomix_adjust", network: "Google",            osStrategy: "campaign_name" }, // confirmed empty on No Breakdown
  { table: "dwh_tik_tok_globalcomix_adjust",    network: "TikTok",            osStrategy: "campaign_name" }, // <-- BUG FIX: was hasOs: true
  { table: "dwh_apple_globalcomix_adjust",      network: "Apple Search Ads",  osStrategy: "implicit_ios" },
  // AppLovin added in WS2
],
```

#### Shared classifier predicate

Add a helper to `src/lib/analyst/campaign-classifier.ts` (already has `classifyCampaign().platform`) that emits a SQL predicate for a given OS value. SQL and TS classifier MUST share the same token list so they cannot drift:

```ts
// in campaign-classifier.ts
export function osSqlPredicate(os: "ios" | "android" | "web", column: string): string {
  // Reuse the same token list classifyCampaign() walks. Each token is a
  // case-insensitive LIKE pattern surrounded by underscores or word
  // boundaries. The list lives in one CONST exported from this file.
  // Returns e.g. "(LOWER(<col>) LIKE '%_ios_%' OR LOWER(<col>) LIKE '%_iphone_%')"
}
```

Confirm with a unit test that for the same campaign_name, `classifyCampaign(name).platform === os` iff the SQL predicate matches.

#### Acceptance

- `bq-security.ts` `MultiSourceTable` has `osStrategy` instead of `hasOs`.
- TikTok strategy is `campaign_name`.
- Google strategy remains `campaign_name`.
- Apple strategy is `implicit_ios`.
- Meta strategy is `column`.
- Unit test asserts that for each strategy + OS combo, the SQL builder emits the predicate the report at section "WS1.A acceptance" prescribes.
- Existing tests pass unchanged (no functional behavior changes when OS filter = `total`).

---

### WS1.B — Organic bucket dropped in cohort attribution

#### Today

`src/lib/globalcomix-queries.ts` lines 165-170 (the `CASE WHEN _Network_Attribution …` in `buildCohortSubquery`) maps four known paid networks and falls through with `ELSE NULL`. The investigation confirmed `_Network_Attribution` carries real attribution values for Organic too:

- `Organic` — 40,328 rows / 90 days
- `Google Organic Search` — 5,402 rows / 90 days
- `Untrusted Devices` — 3,292 rows / 90 days

All currently dropped by the `network IS NOT NULL` predicate downstream. The moment WS7 exposes Paid vs Organic / BCAC, the math is wrong without this fix.

#### Change

Add an `Organic` bucket to `buildCohortSubquery`:

```sql
CASE
  WHEN _Network_Attribution LIKE 'Google Ads%'                                       THEN 'Google'
  WHEN _Network_Attribution IN ('Facebook Installs', 'Instagram Installs', 'Off-Facebook Installs') THEN 'Meta'
  WHEN _Network_Attribution = 'TikTok SAN'                                           THEN 'TikTok'
  WHEN _Network_Attribution = 'Apple Search Ads'                                     THEN 'Apple Search Ads'
  WHEN _Network_Attribution IN ('Axon by AppLovin Android', 'Axon by AppLovin iOS')  THEN 'AppLovin'       -- added in WS2
  WHEN _Network_Attribution IN ('Organic', 'Google Organic Search', 'Untrusted Devices') THEN 'Organic'   -- this WS
  ELSE NULL
END AS network
```

Keep `network IS NOT NULL` in consumer queries. The Organic bucket is "Other Paid" categorization-wise but the investigation's product call is to keep `'Organic'` as the canonical label and treat `Untrusted Devices` as an Organic-adjacent bucket (Adjust flags these but they fail device-fingerprint verification; they are not paid).

#### Pubmint and other paid-not-mapped strings

The cohort also shows `Pubmint iOS / Pubmint Android` (~7.7k rows 90d) with no matching spend table. Add a TODO comment near the CASE block flagging this as Open Question 2 from the investigation. **Do not fold Pubmint into any paid bucket in this PR** — the per-network spend split breaks if we attribute cohort revenue to a network that has no `cost_usd`. Leave it as the `ELSE NULL` drop until Gabby confirms the source.

#### Acceptance

- New `'Organic'` branch in the CASE.
- Unit test: an `_Network_Attribution = 'Organic'` row produces `network = 'Organic'` and is NOT dropped by the downstream `network IS NOT NULL`.
- Unit test: `'Pubmint iOS'` still falls through to NULL.
- The existing Google iOS attribution filter (`NOT (_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios')`) stays exactly as is. It is a data-quality filter and independent of the user-facing OS filter.

---

### WS1.C — Hard-coded `roas: 0` on campaigns query

#### Today

`src/lib/globalcomix-queries.ts:853` returns `CAST(0 AS FLOAT64) AS roas` with the comment that the cohort `_Campaign_Attribution` doesn't reliably match `campaign_id`. The investigation confirmed that for GlobalComix the cohort's `_Campaign_ID` (different column than `_Campaign_Attribution`) is a real id and joins cleanly.

#### Change

Rewrite the campaigns query to LEFT JOIN cohort on `_Campaign_ID`:

```sql
WITH curr AS (
  SELECT campaign_id, ANY_VALUE(campaign_name) AS campaign_name_raw,
         ANY_VALUE(network) AS network,
         SUM(cost_usd) AS spend, SUM(installs) AS installs
  FROM ${spendSub}
  WHERE date BETWEEN ${FROM} AND ${TO}
  GROUP BY campaign_id
),
curr_cohort AS (
  SELECT _Campaign_ID AS campaign_id,
         SUM(_7D_Revenue_Total) AS rev_d7,
         SUM(_7D_Paying_Users)  AS sub_d7,
         SUM(_7D_subscription_start_Events) AS sub_start_d7
  FROM ${cohortSub} c
  WHERE _Day_Date BETWEEN ${FROM} AND ${TO}
    AND network IS NOT NULL
  GROUP BY _Campaign_ID
),
prev AS ( … )
SELECT
  c.campaign_id,
  COALESCE(c.campaign_name_raw, c.campaign_id) AS campaign_name,
  c.network, c.spend, c.installs,
  cc.sub_d7, cc.sub_start_d7,
  SAFE_DIVIDE(c.spend, NULLIF(c.installs, 0))                AS cpi,
  SAFE_DIVIDE(c.spend, NULLIF(cc.sub_d7, 0))                  AS cpa_d7,
  SAFE_DIVIDE(cc.rev_d7, NULLIF(c.spend, 0))                  AS roi_d7,     -- was roas
  SAFE_DIVIDE(c.spend - p.spend, NULLIF(p.spend, 0))          AS spend_delta
FROM curr c
LEFT JOIN curr_cohort cc USING (campaign_id)
LEFT JOIN prev p          USING (campaign_id)
WHERE c.spend > 0
ORDER BY c.spend DESC
LIMIT 100
```

Rename `roas` to `roi_d7` on the API response while we're touching this, since "ROAS" implies pure revenue/spend ratio and we're computing the GlobalComix-flavor ROI D7. Update the `CampaignRow` type and the consumer in `src/components/campaigns/`.

#### Note: the `_Campaign_Attribution` comment in the code is now stale

Update the existing comment block above the query to reflect the new join shape and reference the investigation report's Bucket 2 entry.

#### Acceptance

- Per-campaign rows show real ROI D7 values, not zeros.
- Unit test against a fixture asserts the LEFT JOIN behavior: campaigns with no cohort match return `sub_d7: null`, `roi_d7: null` (not zero — null is "no data", zero is "real zero spend or revenue").
- The `roas` field is renamed to `roi_d7` in the type and the API response. Frontend consumer updated.
- E2E spec: `/campaigns` shows non-zero ROI D7 column for at least the top 3 spending campaigns.

---

## WS2 — AppLovin wire-in

### Background

`dwh_applovin_globalcomix_adjust` exists, has 9,009 rows since 2026-05-05, and is already on the same `_adjust` cadence as the other four spend sources. Cohort attribution lives across two `_Network_Attribution` strings: `Axon by AppLovin Android` and `Axon by AppLovin iOS`. Three small changes.

### Changes

1. **`src/lib/bq-security.ts`** — add to `spendSources`:

   ```ts
   { table: "dwh_applovin_globalcomix_adjust", network: "AppLovin", osStrategy: "column", coverageStart: "2026-05-05" },
   ```

   AppLovin DOES populate `os` per the investigation (verified iOS/Android). Use `osStrategy: "column"`.

2. **`src/lib/globalcomix-queries.ts`** — add cohort branch (already shown in WS1.B):

   ```sql
   WHEN _Network_Attribution IN ('Axon by AppLovin Android', 'Axon by AppLovin iOS') THEN 'AppLovin'
   ```

   And add to `CAMPAIGN_NAME_COLUMN_BY_TABLE`:

   ```ts
   dwh_applovin_globalcomix_adjust: "campaign_name",
   ```

3. **`src/lib/mock/clients.ts`** — update `CLIENT_NETWORK_COVERAGE.globalcomix` to include AppLovin:

   ```ts
   globalcomix: ["Meta", "TikTok", "Google", "Apple Search Ads", "AppLovin"],
   ```

### Coverage warning

When the active date window starts before `2026-05-05`, AppLovin shows zero spend / zero subs because the source didn't exist yet. Surface this as a small inline tooltip on the AppLovin row in the Network Breakdown table (use the existing `coverageStart` field on `MultiSourceTable`). The investigation's Open Question note about "started 2026-05-05" is exactly this case — not a bug, just a young source.

### Acceptance

- `dwh_applovin_globalcomix_adjust` joins the spend UNION; total Spend on the dashboard for any date range including post-2026-05-05 increases vs the pre-PR value.
- AppLovin appears as the 5th row in Network Breakdown.
- Activity Overview channel donut includes AppLovin.
- Cohort revenue / sub_d7 attributes to `'AppLovin'` for both `Axon by AppLovin Android` and `Axon by AppLovin iOS` rows.
- Coverage tooltip renders on the AppLovin row when active range starts before 2026-05-05.

---

## WS3 — Cohort dimensional expansion

### Background

Today `buildCohortSubquery` aggregates to `(date, network)` only. The `uni_adjust_cohort_report_globalcomix` table has 39 columns; we use 10. The investigation enumerates the gap. This workstream surfaces enough of the unused columns to power Geographic, Campaign / Ad drilldown, Paid-vs-Organic, BCAC, and the cleaner Trial Start / Sub Start funnel without changing the cohort FROM.

### Change strategy

The cohort subquery (`buildCohortSubquery`) needs to become parameterized by the calling query's grain. Today it always GROUPs BY 1, 2 (date, normalized network). The new shape:

```ts
function buildCohortSubquery(client: string, opts: {
  groupBy?: Array<"date" | "network" | "os" | "country" | "campaign_id" | "ad_id" | "creative">;
  /** If true, include the 'Organic' bucket in the network CASE. Default true (after WS1.B). */
  includeOrganic?: boolean;
}): string;
```

Each caller passes the dimensions it needs. The subquery projects them through and groups by them. Consumers downstream join on whatever subset they need.

### New columns to expose

Pull these from the cohort and project them through `buildCohortSubquery`:

- `_OS_name` AS `os` — already filtered on, now expose
- `_Country` AS `country`
- `_Campaign_ID` AS `campaign_id`
- `_Ad_ID` AS `ad_id`
- `_Creative_Attribution` AS `creative_name`
- All `_*_subscription_start_Events` columns AS `sub_start_d0`, `sub_start_d7`, `sub_start_d14`
- All `_*_trial_start_Events` columns AS `trial_start_d0`, `trial_start_d7`, `trial_start_d14`
- `_14D_Revenue_Total` AS `rev_d14`, `_30D_Revenue_Total` AS `rev_d30`, `_90D_Revenue_Total` AS `rev_d90` (already pulled, document)
- `_14D_Paying_Users` AS `sub_d14`, `_30D_Paying_Users` AS `sub_d30`, `_90D_Paying_Users` AS `sub_d90`

### Switch sub_start source

The existing `_queryGlobalComixKPIs` derives `sub_start` from `num_ftd7` on the spend tables (per a comment in `globalcomix-queries.ts:152-161`). The investigation confirms the cleaner source is the cohort's `_7D_subscription_start_Events`. Switch:

```sql
-- old:
SUM(ftd_d7) AS sub_start
-- new:
SUM(_7D_subscription_start_Events) AS sub_start
```

This means `sub_start` now flows from the cohort subquery, not the spend subquery. Update the KPI query's CTEs accordingly. Keep `ftd_d7` as a column on the spend rows for backwards compatibility, but the canonical `sub_start` is now cohort-sourced.

### Acceptance

- `buildCohortSubquery(client, opts)` accepts a `groupBy` option and projects the requested dimensions.
- `_queryGlobalComixKPIs` returns `sub_start_d0`, `sub_start_d7`, `sub_start_d14`, `trial_start_d0`, `trial_start_d7`, `trial_start_d14` as new fields on the `KPIData` shape. Existing callers tolerate the additions (none should break).
- A new unit test asserts that for a given date range, `sub_start` from cohort matches the Looker "Sub Start D7" KPI within ±1% (sample real numbers from the prior-art doc's Activity Overview screenshot).
- `_queryGlobalComixKPIs.sub_start` switches from `ftd_d7`-derived to `_7D_subscription_start_Events`-derived. Document the source change inline.
- The existing 7 cached query functions stay backward compatible (their wire shape can grow; consumers handle missing fields gracefully).

---

## WS4 — New module: subscriber lifecycle (`globalcomix-subs-queries.ts`)

### Background

`dwh_total_subs_globalcomix` is the source of Looker's "Total Sub & Churn View":

- Schema: `(event_date DATE, os STRING, sub_type STRING, sub_count INT)`
- `sub_type` ∈ `{'subscribe', 'unsubscribe'}`
- `os` ∈ `{'iOS', 'Android', 'Web'}` (Web has 3,748 rows)
- Daily aggregate per `(event_date, os, sub_type)`, not per-user
- Future-dated `event_date` rows exist up to 2027-03-17 (Open Question 3; for now filter to `event_date <= CURRENT_DATE()`)

This is a new query module because it's a different table with a different grain than the cohort/spend universe.

### File: `src/lib/globalcomix-subs-queries.ts`

Mirror the structure of `globalcomix-queries.ts`:

- `import "server-only"`, `withRedisCache`, `getBigQueryClient`, `qualifyTable`
- Singleton table constant: `const SUBS_TABLE = "dwh_total_subs_globalcomix"`
- Three exported async functions, each cached via `withRedisCache`:

```ts
// 1. Daily Sub / Churn / Net Sub. One row per (event_date, os). Optional OS filter.
queryGlobalComixSubsDaily(client: string, from: string, to: string, os?: OsFilter): Promise<SubsDailyRow[]>

// 2. OS mix donut. Aggregated subs/churn/net by OS for the period.
queryGlobalComixSubsOsMix(client: string, from: string, to: string): Promise<SubsOsMixRow[]>

// 3. Cumulative Net Sub over time. Used for the "Net Sub Over Time" chart.
queryGlobalComixNetSubTrend(client: string, from: string, to: string, os?: OsFilter): Promise<NetSubPoint[]>
```

### SQL for #1 (daily Sub / Churn / Net Sub)

```sql
SELECT
  event_date AS date,
  os,
  SUM(CASE WHEN sub_type = 'subscribe'   THEN sub_count ELSE 0 END) AS subs,
  SUM(CASE WHEN sub_type = 'unsubscribe' THEN sub_count ELSE 0 END) AS churn,
  SUM(CASE WHEN sub_type = 'subscribe'   THEN sub_count ELSE 0 END)
  - SUM(CASE WHEN sub_type = 'unsubscribe' THEN sub_count ELSE 0 END) AS net_sub
FROM `${SUBS_TABLE}`
WHERE event_date BETWEEN @from AND @to
  AND event_date <= CURRENT_DATE()       -- guard against future-dated rows (Open Question 3)
  ${os && os !== 'total' ? `AND LOWER(os) = '${os.toLowerCase()}'` : ''}
GROUP BY event_date, os
ORDER BY event_date, os
```

### Web as an OS — the Lumen-side decision

`dwh_total_subs.os` includes `'Web'` (3,748 rows). Lumen's filter system has not yet defined an `OsFilter` type. **In WS6, define `OsFilter = "total" | "ios" | "android" | "web"` from the start.** The lifecycle frame is the one place Web is non-trivial; the spend / cohort queries should treat `os = "web"` as `osStrategy: "none"` for sources that have no Web row (Apple ASA, AppLovin) and gracefully return zero with a coverage note.

### API route

Add `src/app/api/bq/total-subs/route.ts` matching the convention of `/api/bq/dashboard-kpis/route.ts`. Accept `client, from, to, os?` params. Dispatch to `queryGlobalComixSubsDaily` etc. Strategy dispatch in `bq-queries.ts` (Playw3 / 100play return empty arrays, matching the pattern in `_queryDashboardKPIs`).

### Acceptance

- `globalcomix-subs-queries.ts` exists with three exported functions, each cached.
- `/api/bq/total-subs` returns daily Sub / Churn / Net Sub rows for a 30-day window.
- Web rows are included when `os=web` is specified or `os=total`; excluded for `ios` / `android`.
- Future-dated rows past `CURRENT_DATE()` are filtered out.
- Unit test against a fixture confirms the CASE-based subscribe/unsubscribe split.
- E2E spec: visit `/dashboard`, see the new Lifecycle section render with real numbers.

---

## WS5 — New analytical query functions

Four new exports in `globalcomix-queries.ts`. Each reads from tables we already query. Each accepts `(client, from, to, os?: OsFilter, platforms?: Platform[])`.

### WS5.A — `queryGlobalComixWeekends`

SQL: bucket the spend UNION + cohort data by `EXTRACT(DAYOFWEEK FROM date) IN (1, 7)` for weekend vs working day. Return two rows: `{ bucket: 'weekday', spend, installs, sub_d7, cpa_d7, roi_d7, cvr, … }` and the weekend counterpart. Recompute rate metrics from sums (do not average daily rates).

### WS5.B — `queryGlobalComixGeo`

SQL: GROUP BY `_Country` on the cohort + `breakdown_value` on the spend `Country` slice. Country normalization needed: cohort uses full names ("United States"), spend uses ISO-2 ("US"). Add a static mapping in a new `src/lib/iso-country-codes.ts` (about 250 entries) and normalize both to ISO-2 for the join. Return one row per country with `{ country_code, country_name, spend, installs, sub_d7, rev_d7, cpa_d7, roi_d7, sub_paid, sub_organic }`.

### WS5.C — `queryGlobalComixCreatives`

Per-ad rows. Cohort GROUP BY `_Ad_ID, _Creative_Attribution` for funnel + readable name; LEFT JOIN spend `breakdown_type = 'Creatives'` slice for cost / clicks / impressions; LEFT JOIN `ods_fb2_creatives_globalcomix` on `_Ad_ID = _creative_id` for Meta thumbnails. Return `{ ad_id, ad_name, creative_name, network, thumbnail_url?, spend, installs, sub_start_d7, sub_d7, cpa_d7, roi_d7 }`. Limit to top 100 by spend.

### WS5.D — `queryGlobalComixAttributionValidation`

Per-network side-by-side. JOIN base spend table + `_adjust` spend table per network on `(date, campaign_id)`. Project platform-self-reported columns (`fb_installs`, `fb_subscribe_total` for Meta; `conversions`, `subscription_purchase` for Google; `tiktok_installs`, `tiktok_purchase` for TikTok; `apple_installs` for Apple; `installs_applovin` for AppLovin) alongside Adjust-attributed columns (`installs`, `_7D_subscription_start_Events`). Return `{ network, week_iso, platform_installs, adjust_installs, platform_subs, adjust_subs, delta_pct }`. iOS only for now (matches the Looker page scope).

### Cache, API routes, dispatch

Each function gets:
- A `queryGlobalComix*` cached export
- An `/api/bq/<name>/route.ts` route in the same shape as `dashboard-kpis`
- A dispatch line in `bq-queries.ts` if Playw3/100play need a no-op fallback

### Acceptance

- All four exports work against the live warehouse.
- Each is cached with a 12h TTL via `withRedisCache`.
- Each API route returns expected JSON shapes for a 30-day window.
- Unit tests cover the aggregation rules + edge cases per function.
- The Attribution Validation function correctly excludes Google iOS from the Adjust side (per the existing data-quality filter) but includes it on the platform-self-reported side, so the drift is visible.

---

## WS6 — Global filter spine: OS + Platform

### Type model

```ts
// src/lib/filters/types.ts (new file)
export type OsFilter = "total" | "ios" | "android" | "web";
export type Platform = "meta" | "google" | "tiktok" | "apple_search_ads" | "applovin";
```

### `useGlobalFilters` extension

Update `src/lib/filters/use-global-filters.ts`:

- Add `os: OsFilter` and `platforms: Platform[]` to `GlobalFilters`.
- URL encoding: `?os=ios` (default `total`, omitted from URL). `?platforms=meta,google` (default empty = all, omitted from URL). Comma-separated values in URL.
- Add `setOs(os: OsFilter)` and `setPlatforms(p: Platform[])` callbacks.
- Validate URL values; fall back to defaults on garbage.

### Filter UI in `TopBar.tsx`

Two new components in `src/components/shell/`:

**`OsFilter.tsx`** — Segmented control. Four chips: `Total / iOS / Android / Web`. Mint accent (`--color-ua`) for active. Defaults to `Total`.

**`PlatformFilter.tsx`** — Multi-select chip group. Five chips: `Meta / Google / TikTok / ASA / AppLovin`. Each chip's color matches the brand convention used elsewhere (refer to `src/lib/dashboard/network-colors.ts`). Plus an `All` reset chip on the left. Empty selection = all networks.

Slot both into `TopBar.tsx` next to `<DateRangePicker />` and `<ClientSelector />`. On narrow viewports they wrap to a second row (the TopBar already wraps).

### API route param threading

Every `/api/bq/*` route accepts `os?` and `platforms?` query params:

- `os` defaults to `total` when absent.
- `platforms` is a comma-separated list of `Platform` values. Empty / absent means all.
- Validate strictly; reject unknown values with 400.

`requireParams` in `src/app/api/bq/_lib/handle.ts` gets a sibling `optionalParams` helper for these.

### Query function param threading

Every public `queryGlobalComix*` function accepts `os: OsFilter = "total", platforms?: Platform[]` after the existing `(client, from, to)`. The SQL builder receives them and:

- For OS = `total`: emit no OS predicate.
- For OS = `ios|android|web`: emit per-source predicates via `osStrategy`:
  - `column`: `WHERE LOWER(os) = '<os>'`
  - `campaign_name`: `WHERE <osSqlPredicate(os, 'campaign_name')>`
  - `implicit_ios`: include only when OS = `ios` or `total`; emit `WHERE FALSE` to zero the source when OS ≠ ios
  - `none`: include only when OS = `total`; emit `WHERE FALSE` otherwise
- Cohort OS predicate: `WHERE LOWER(_OS_name) = '<os>'`
- For platforms = empty / absent: no predicate. For non-empty: `WHERE network IN UNNEST(@platforms)`

### Dashboard hook + URL

`useDashboardData` in `src/lib/dashboard/use-dashboard-data.ts` reads `os, platforms` from `useGlobalFilters` and passes them to every fetch.

### Cache key implications

The `paramHash` in `src/lib/cache/keys.ts` already canonicalizes objects with sorted keys. The new `os, platforms` params hash naturally. **Do not bump the `v1` segment** — that invalidates all existing cache. Let the natural cold-miss path warm the new shape.

### Acceptance

- URL `?os=ios&platforms=meta,google` re-fetches the dashboard with only Meta + Google + iOS data.
- OS chip set to `iOS` while platform chip set to `AppLovin` returns AppLovin iOS rows (since AppLovin has `osStrategy: "column"` and the data has both OS values).
- OS chip set to `iOS` does NOT silently zero TikTok (the WS1.A bug fix).
- All chips persist across page refresh.
- Unit tests cover: every OS strategy × every OS value combination, platform IN-list predicate generation, URL state round-trip.
- E2E test: full filter combo set survives a hard refresh.

---

## WS7 — Dashboard UI updates

Five additive UI changes to `/dashboard` consuming the new queries.

### WS7.A — Cadence aggregated table (Daily / Weekly / Monthly)

New component `src/components/dashboard/CadenceTable.tsx`. Toggle Daily / Weekly / Monthly above the table. Reads `useDashboardData().trend` (now per-(date, network)) and aggregates client-side using `src/lib/dashboard/aggregate-trend.ts` (new pure helper). Rules per WS3 of the superseded prompt:

- Additive metrics: sum.
- Rate metrics: recompute from sums (never average daily rates).
- ISO weeks (Monday start). Period labels: `"Week 18 (27 Apr – 3 May 2026)"`, `"May 2026"`.

Slot below the TrendChart, above NetworkBreakdown.

### WS7.B — Weekends vs Weekdays card

New component `src/components/dashboard/WeekendsVsWeekdays.tsx`. Consumes `/api/bq/weekends`. Two-row table + spend bar chart. Respects OS + Platform filters via the WS6 spine.

### WS7.C — Network Breakdown color-coded scorecard

Update `src/components/dashboard/NetworkBreakdown.tsx`. Use **previous-period same-network** as the baseline (not cross-network grand-total — the product decision from our conversation). The cell tone helper `src/lib/dashboard/cell-tone.ts`:

- For lower-is-better metrics (CPI, CPA D0, CPA D7, CP Sub Start): `good` if value ≤ baseline × 0.9, `bad` if ≥ baseline × 1.2, `warn` if ≥ baseline × 1.05.
- For higher-is-better (Sub D7, ROI D7, Install CVR): inverted.
- For volume metrics (Spend, Impr, clicks): no tone.

The previous-period data is already in the per-network breakdown query (per Status.md note about the existing trailing-30d baseline embed). Hover tooltip explains the tone in words: `"CPA D7 is 18% above this network's previous-period average."`

### WS7.D — Lifecycle section (Sub / Churn / Net Sub)

New component `src/components/dashboard/SubscriberLifecycle.tsx`. Consumes `/api/bq/total-subs`. Renders:
- KPI strip: Subs / Churn / Net Sub for the period (totals).
- OS donut (iOS / Android / Web).
- Net Sub Over Time bar chart.

Slot below NetworkBreakdown. **This section ignores the global OS filter** (subscriber lifecycle is its own scope; Web users matter for lifecycle even if the rest of the dashboard is iOS-only). Show a small note explaining this.

### WS7.E — Paid vs Organic strip (BCAC headline)

New compact card showing: Sub Total, Net Total, BCAC headline number, Sub Paid / Sub Organic donut. Uses cohort data (Paid + Organic + Untrusted Devices) for the donut, and `total_spend / total_subs` for BCAC. Slot above the trend chart so BCAC is visible as a headline.

### Acceptance

- All five UI additions render without layout overflow on a 1280×800 viewport.
- All five respect the global filters from WS6 (except 7.D Lifecycle, intentionally).
- All five degrade gracefully when their data source is empty or in flight.
- Existing dashboard test passes (no regressions on existing tiles / trend / channel mix).

---

## WS8 — Cache warming + tests + housekeeping

### Cache warmer extension

Update `src/lib/cache/warm.ts`:

- Add the four new query functions (`queryGlobalComixWeekends`, `queryGlobalComixGeo`, `queryGlobalComixCreatives`, `queryGlobalComixAttributionValidation`) to the warm pass.
- Add `queryGlobalComixSubsDaily`, `queryGlobalComixSubsOsMix`, `queryGlobalComixNetSubTrend` from the new module.
- Add the 8 common (OS × platform) combinations for the most-used filter slices:
  1. `(os=total, platforms=[])` — current default
  2. `(os=ios, platforms=[])`, `(os=android, platforms=[])`, `(os=web, platforms=[])`
  3. `(os=total, platforms=['meta'])`, `(os=total, platforms=['google'])`, `(os=total, platforms=['tiktok'])`, `(os=total, platforms=['apple_search_ads'])`
- That is 8 combinations × roughly 12 queries = ~96 cache keys per warm pass. Upstash handles this easily.
- DO NOT warm the cross-product (4 × 5 = 20 combos × 12 queries = 240 keys); the data says users start at one orthogonal slice and drill from there.

### Test coverage

Each workstream's acceptance criteria call out specific tests. Aggregate budget:

- WS1 — 12 unit tests across the three bugs + the osStrategy refactor.
- WS2 — 6 unit tests.
- WS3 — 15 unit tests across the cohort expansion, sub_start switch, dimensional grouping.
- WS4 — 10 unit tests, 1 E2E.
- WS5 — 20 unit tests across the four new exports.
- WS6 — 12 unit tests across filter state + SQL predicate generation, 1 E2E.
- WS7 — 12 unit tests across the new components + the cell tone helper, 2 E2E (cadence toggle, lifecycle section renders).
- WS8 — 4 unit tests on the warmer.

Total target: +90 unit, +4 E2E. Existing 847+ suite must continue to pass.

### Housekeeping at PR close

Update at the end of the PR, NOT during development:

1. **`Status.md`** — Move the dashboard / data-layer items from "in flight" to "shipped" sections. Add a new "in flight" entry for the analyst-layer + Smart Reports follow-up.
2. **`Decisions.md`** — Append a single dated entry summarizing what shipped, the three bugs fixed, the new tables wired, the new analytical views, and the open questions punted to Gabby.
3. **`Lumen Vault/Technical/BigQuery Warehouse.md`** — Update the table inventory to reflect that we now query `dwh_applovin_globalcomix_adjust`, `dwh_total_subs_globalcomix`, the cohort dimensional expansion, and the Meta creatives + cohort attribution-validation joins.
4. **CLAUDE.md** — No change needed (the UA framing was already updated to subscription metrics on 2026-05-17).
5. **PR description** — Surface the three open questions for Gabby explicitly:
   - SKAdNetwork ingestion path (stale since 2025-08-04)
   - Pubmint cohort attribution without matching spend table
   - `dwh_total_subs_globalcomix.event_date` semantics (future-dated rows up to 2027-03-17)

---

## Implementation notes

### Branch and PR shape

Single branch `globalcomix-full-implementation` off `main`. Commits inside the PR follow the WS numbering — one commit per WS (or per WS.A/B sub-letter where the WS has internal segmentation), so a reviewer can walk the diff WS by WS. Final commit is the housekeeping pass.

### Order inside the PR

Strict order:

1. WS1 — bugs first. Anything after this assumes the bugs are gone.
2. WS2 — AppLovin. Pure additive config.
3. WS3 — cohort expansion. Unblocks WS4/5/7.
4. WS4 — subs module. Standalone.
5. WS5 — four new query exports.
6. WS6 — filter spine. Now that all the queries take `os`/`platforms`, wire it.
7. WS7 — UI updates.
8. WS8 — cache + tests + housekeeping.

### Read-only investigation already done

Do NOT re-run BQ discovery. The investigation report at `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md` and the JSON artifacts at `tmp/bq-discovery/2026-05-17-globalcomix/` are the source of truth. If a column or table name turns out to be wrong, check the JSON artifacts first; only run a new BQ query as a last resort.

### Out of scope

- Meta Web spend from raw ods landing tables (`ods_fb2_insight_general_web_globalcomix` + geo / placement). Defer; needs parser work.
- D14/D30/D90 cohort retention rate + LTV per paying user from the per-window ods tables (`ods_adjust_14d_cohorts_report_globalcomix` etc.). Defer; not in any of the 12 Looker frames.
- `ods_adjust_overview_report_globalcomix` engagement metrics at full attribution grain. Defer; not in scope.
- Subscription Plan Mix from `ods_url_subs_globalcomix`. Defer; not in the 12 frames.
- ASA Keyword Performance from `ods_apple_searchterms_globalcomix`. Defer.
- Analyst layer + Smart Reports integration (Hermes / Smart Reports reading the new dimensions). Separate workstream after this PR ships.

### Open questions (do NOT block this PR)

1. SKAdNetwork: surface the staleness in the Attribution Validation view (WS5.D) and leave a TODO for Gabby.
2. Pubmint: drop to NULL bucket as documented in WS1.B; TODO comment near the CASE.
3. `dwh_total_subs.event_date` semantics: filter to `<= CURRENT_DATE()` for safety; TODO comment near the SQL in WS4.

### Reference

- Investigation report: `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md`
- Phase artifacts: `tmp/bq-discovery/2026-05-17-globalcomix/{A..F}-*.json`
- Prior-art structural map: `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`
- Current data layer: `src/lib/globalcomix-queries.ts` (~1100 lines), `src/lib/bq-security.ts` (the multi-source config block at lines 132-158)
- Current dashboard hook: `src/lib/dashboard/use-dashboard-data.ts`
- Current dashboard view: `src/components/dashboard/DashboardView.tsx`
- Current filter system: `src/lib/filters/use-global-filters.ts`
- TopBar (filter slot): `src/components/shell/TopBar.tsx`
- Campaign classifier (the shared OS token helper goes here): `src/lib/analyst/campaign-classifier.ts`
- Cache layer: `src/lib/cache/{with-redis-cache,keys,warm,invalidate,stats}.ts`
