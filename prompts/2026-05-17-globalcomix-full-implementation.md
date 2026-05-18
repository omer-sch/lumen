# GlobalComix full implementation: bug fixes + AppLovin + Bucket 2/3 query expansion + dashboard filter spine + new analytical views (2026-05-17, revised post-merge)

Owner: Omer. Single large PR on a new branch off `main` named `globalcomix-full-implementation`. Closes the gap between Lumen's `/dashboard` and the GlobalComix UA Looker dashboard the yellowHEAD team relies on today. Supersedes the two earlier prompts (`2026-05-17-dashboard-tier1-filters-cadence-weekends.md`, `2026-05-17-bq-deep-investigation-globalcomix.md`); both are kept on disk for traceability only.

## Changes vs the 2026-05-17 draft

The earlier draft was written before `first-real-agent-try` (80 commits, 254 files, +36k lines: Hermes + Smart Reports + analyst layer) merged to `main`. This revision reflects the merged code state. Material changes:

- **Branch base is `main` post-merge.** The earlier "off main" was correct in convention but wrong in practice because `main` was missing the Hermes / analyst work.
- **Type alignment with the analyst layer.** Reuse `IntentChannel` and `IntentPlatform` from `src/lib/analyst/index.ts` (already exported, already used by Hermes / Smart Reports / snapshot.ts) instead of inventing parallel `Platform` / `OsFilter` enums. `OsFilter` is `IntentPlatform | "total"`. `Platform` IS `IntentChannel`.
- **`ANALYST_QUERY_IDS` registry.** Every new query (`weekends`, `geo`, `creatives`, `attribution-validation`, `total-subs`, `subs-os-mix`, `net-sub-trend`) must register in `src/lib/analyst/types.ts` `ANALYST_QUERY_IDS` const. The Hermes citation validator relies on this registry; missing a registration silently breaks provenance.
- **Maturity gate reuse.** When surfacing new D7 / D14 metrics, gate via `COHORT_D7_MATURITY_THRESHOLD` from `src/lib/analyst/maturity-gates.ts`. The deck renderer already uses it; the dashboard must agree so a number displayed in `/dashboard` matches what shows up in a Hermes-generated deck for the same period.
- **WS1.C scope extension.** Fixing the `roas: 0` bug on `_queryGlobalComixCampaigns` (the cohort `_Campaign_ID` join now works) also unblocks per-campaign cohort metrics flowing through `src/lib/agents/hermes/snapshot.ts` into `ReadyData.campaigns`. Update the stale "What's NOT available without a new BQ query" comment block (snapshot.ts:32-46) in the same commit and let cohort-attributed per-campaign Sub D7 / CPA D7 / ROI D7 reach the deck for free.
- **Smart Reports prose-writer prompts are OUT of scope** for this PR. The prompts in `src/lib/smart-reports/prompts/` may need to be taught about the new context fields (organic share, BCAC, ad-level creative deltas) so the deck prose mentions them. That's a separate follow-up prompt and shouldn't gate this PR.
- **Function name fix.** Campaign classifier function is `classifyCampaignName` (not `classifyCampaign` as the earlier draft had).
- **Skipped a re-investigation.** The BQ investigation report and its 6 phase JSON artifacts are still authoritative (no warehouse changes since 2026-05-17). Do not re-run discovery.

## Spec

Source-of-truth specs (read both before starting):

- **`Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md`** (~27 KB, 300 lines, from 6 phases of read-only BQ discovery). Drives every data-layer decision in this prompt.
- **`Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`** (structural map of what the team uses Looker for).

This prompt is the implementation plan that turns the investigation's Bucket 2 + Bucket 3 recommendations into shipped code. Bucket 4 (SKAdNetwork stale, Pubmint missing spend, `event_date` semantics) is open questions for Gabby and is out of scope here.

## TL;DR

Eight workstreams in one PR. Ship order inside the PR matches the numbering. Each WS is independently reviewable; bundle them so a single end-to-end test pass validates the whole.

1. **WS1 — Bug fix foundation.** Three live bugs surfaced by the investigation (TikTok `hasOs`, Organic dropped, `roas: 0`) plus a `hasOs: boolean` → `osStrategy` refactor.
2. **WS2 — AppLovin wire-in.** Three lines of config + two cohort branches. Already in the `IntentChannel` enum, so Hermes / Smart Reports start working for AppLovin automatically when data flows.
3. **WS3 — Cohort dimensional expansion.** The biggest unlock. Today we use 10 of 39 columns on `uni_adjust_cohort_report_globalcomix` and aggregate to `(date, network)`. Expose `_Country`, `_Campaign_ID`, `_Ad_ID`, `_Creative_Attribution`, the Organic bucket, the Sub Start / Trial Start event columns, and D14/D30/D90 windows. Flow new dimensions through `ReadyData` so the analyst / Smart Reports layer can pick them up.
4. **WS4 — New module: subscriber lifecycle.** `src/lib/globalcomix-subs-queries.ts` reading `dwh_total_subs_globalcomix` for daily Sub / Churn / Net Sub. Web shows up here.
5. **WS5 — New query functions: weekends, geo, creatives, attribution validation.** Four new exports in `globalcomix-queries.ts`; each registers in `ANALYST_QUERY_IDS`.
6. **WS6 — Global filter spine: OS + Platform.** URL-driven (`?os=`, `?platforms=`), new chips in `TopBar.tsx`, threaded through API routes and every BQ query. Types reuse `IntentPlatform` / `IntentChannel`.
7. **WS7 — Dashboard UI: cadence table, weekends card, scorecard styling, lifecycle section, paid-vs-organic strip.** Five additive UI changes that consume WS3 / WS4 / WS5 / WS6.
8. **WS8 — Cache warming + tests + housekeeping.** Extend the warmer to cover 8 common (OS × platform) combos. Update Status.md, Decisions.md, BigQuery Warehouse.md.

Estimated PR size: 35-55 files touched. ~half is `globalcomix-queries.ts` + `bq-security.ts` SQL work, ~half is UI + new modules + tests. Test budget: +95 unit, +6 E2E.

---

## WS1 — Bug fix foundation

### WS1.A — TikTok `osStrategy` silently zeroes when OS filter ≠ Total

#### Today

`src/lib/bq-security.ts:149` declares `{ table: "dwh_tik_tok_globalcomix_adjust", network: "TikTok", hasOs: true }`. The investigation confirmed the `os` column on this table is **100% NULL across 90 days**. OS information for TikTok lives in `campaign_name` (the `YH_TT_*_iOS_*` / `YH_TT_*_Android_*` token pattern handled by `classifyCampaignName` in `src/lib/analyst/campaign-classifier.ts`). The moment WS6 ships, any OS filter ≠ Total against TikTok rows returns zero. Silent data loss.

#### Refactor: replace `hasOs: boolean` with `osStrategy`

`hasOs: boolean` is a leaky abstraction; the four spend sources have four different OS-resolution shapes. Make the type carry the strategy:

```ts
// src/lib/bq-security.ts (replace `hasOs: boolean`)
export type OsResolutionStrategy =
  | "column"          // os column populated; use WHERE LOWER(os) = @os
  | "campaign_name"   // os encoded in campaign_name; infer via classifier
  | "implicit_ios"    // source is iOS-only by definition (Apple ASA)
  | "none";           // no OS dimension reachable; include only when OS = total

export type MultiSourceTable = {
  table: string;
  network: string;
  osStrategy: OsResolutionStrategy;
  /** Earliest date the source has spend rows. Used to surface a
   *  date-coverage warning when the active window starts before this. */
  coverageStart?: string; // ISO date
};
```

Set per source (and add AppLovin from WS2):

```ts
spendSources: [
  { table: "dwh_fb2_globalcomix_adjust",        network: "Meta",             osStrategy: "column" },
  { table: "dwh_google_ads_globalcomix_adjust", network: "Google",           osStrategy: "campaign_name" }, // os empty on No Breakdown
  { table: "dwh_tik_tok_globalcomix_adjust",    network: "TikTok",           osStrategy: "campaign_name" }, // BUG FIX (was hasOs: true)
  { table: "dwh_apple_globalcomix_adjust",      network: "Apple Search Ads", osStrategy: "implicit_ios" },
  // AppLovin added in WS2.
],
```

#### Shared SQL classifier predicate

Add a helper to `src/lib/analyst/campaign-classifier.ts` (the file already exports `classifyCampaignName` and a `PLATFORM_TOKENS` set; reuse the same token list so SQL and TS cannot drift):

```ts
// In src/lib/analyst/campaign-classifier.ts
/** Emit a SQL predicate over `<column>` that matches the same OS tokens
 *  classifyCampaignName recognizes. Returned string is safe to interpolate
 *  inline (no user input). Use only with internal column identifiers. */
export function osSqlPredicate(
  os: "ios" | "android" | "web",
  column: string,
): string {
  // Reuse PLATFORM_TOKENS. Each token is a case-insensitive LIKE match
  // surrounded by token delimiters (`_`, `-`, or word boundary).
  // Example output for os="ios", column="campaign_name":
  //   "(LOWER(campaign_name) LIKE '%_ios_%' OR LOWER(campaign_name) LIKE '%-ios-%')"
}
```

Unit test the symmetry: for every fixture campaign name, `classifyCampaignName(name).platform === os` iff the SQL predicate evaluates true. The test fixtures already live in `tests/unit/lib/analyst/campaign-classifier.test.ts`; extend that file.

#### Acceptance

- `MultiSourceTable` carries `osStrategy` instead of `hasOs`. Existing four sources updated as above.
- `osSqlPredicate` exported from `campaign-classifier.ts` and used wherever the spend SQL builder emits the OS predicate for `campaign_name` strategy sources.
- Unit tests: every (strategy × OS value) combination, plus the SQL ↔ TS classifier symmetry.
- All existing tests pass (the refactor is no-op when OS filter = `total`).

---

### WS1.B — Organic bucket dropped in cohort attribution

#### Today

`src/lib/globalcomix-queries.ts:166-170` (the `CASE WHEN _Network_Attribution …` in `buildCohortSubquery`) maps four known paid networks and falls through with `ELSE NULL`. The investigation confirmed real organic attribution exists:

- `Organic` — 40,328 rows / 90d
- `Google Organic Search` — 5,402 rows / 90d
- `Untrusted Devices` — 3,292 rows / 90d

All currently dropped by the downstream `network IS NOT NULL` predicate. The moment WS7 exposes Paid vs Organic / BCAC, the math is wrong without this fix.

#### Change

Replace the cohort CASE block at lines 166-170 with:

```sql
CASE
  WHEN _Network_Attribution LIKE 'Google Ads%'                                       THEN 'Google'
  WHEN _Network_Attribution IN ('Facebook Installs', 'Instagram Installs', 'Off-Facebook Installs') THEN 'Meta'
  WHEN _Network_Attribution = 'TikTok SAN'                                           THEN 'TikTok'
  WHEN _Network_Attribution = 'Apple Search Ads'                                     THEN 'Apple Search Ads'
  WHEN _Network_Attribution IN ('Axon by AppLovin Android', 'Axon by AppLovin iOS')  THEN 'AppLovin'                       -- WS2
  WHEN _Network_Attribution IN ('Organic', 'Google Organic Search', 'Untrusted Devices') THEN 'Organic'                    -- this WS
  -- TODO(open-q-2): Pubmint iOS / Pubmint Android (~7.7k rows 90d) currently fall through.
  -- No matching spend table. Awaiting Gabby's call before bucketing.
  ELSE NULL
END AS network
```

Keep the existing Google iOS attribution filter (`globalcomix-queries.ts:184`) exactly as is — it's a data-quality filter, not a user-facing filter, and operates on the raw `_Network_Attribution` before the CASE.

#### Acceptance

- New `'Organic'` branch in the CASE; `'Untrusted Devices'` folded in per the investigation's product call.
- New `'AppLovin'` branch (paired with WS2's spendSources entry).
- Unit test: `_Network_Attribution = 'Organic'` produces `network = 'Organic'`; downstream `network IS NOT NULL` keeps it.
- Unit test: `'Pubmint iOS'` still falls through to NULL with a TODO marker visible in the SQL string.

---

### WS1.C — Hard-coded `roas: 0` on campaigns query AND stale snapshot.ts comment

#### Today

`src/lib/globalcomix-queries.ts:853` returns `CAST(0 AS FLOAT64) AS roas` with the comment at lines 818-823 claiming the cohort `_Campaign_Attribution` doesn't reliably match. The investigation confirmed that for GlobalComix the cohort table's `_Campaign_ID` (a different column than `_Campaign_Attribution`) IS a real id and joins cleanly.

The same stale assumption leaks into `src/lib/agents/hermes/snapshot.ts:32-46`, which lists "Cohort-attributed sub funnel at the CAMPAIGN level" under "What's NOT available without a new BQ query". That comment block needs to update in the same commit.

#### Change

Rewrite `_queryGlobalComixCampaigns` to LEFT JOIN cohort on `_Campaign_ID`:

```sql
WITH curr AS (
  SELECT campaign_id,
         ANY_VALUE(campaign_name) AS campaign_name_raw,
         ANY_VALUE(network) AS network,
         SUM(cost_usd) AS spend, SUM(installs) AS installs
  FROM ${spendSub}
  WHERE date BETWEEN ${FROM} AND ${TO}
  GROUP BY campaign_id
),
curr_cohort AS (
  SELECT _Campaign_ID AS campaign_id,
         SUM(_7D_Revenue_Total)              AS rev_d7,
         SUM(_7D_Paying_Users)               AS sub_d7,
         SUM(_7D_subscription_start_Events)  AS sub_start_d7
  FROM ${cohortSub} c
  WHERE _Day_Date BETWEEN ${FROM} AND ${TO}
    AND network IS NOT NULL
  GROUP BY _Campaign_ID
),
prev AS ( …existing prev-period spend CTE… )
SELECT
  c.campaign_id,
  COALESCE(c.campaign_name_raw, c.campaign_id) AS campaign_name,
  c.network, c.spend, c.installs,
  cc.sub_d7, cc.sub_start_d7,
  SAFE_DIVIDE(c.spend, NULLIF(c.installs, 0))         AS cpi,
  SAFE_DIVIDE(c.spend, NULLIF(cc.sub_d7, 0))           AS cpa_d7,
  SAFE_DIVIDE(cc.rev_d7, NULLIF(c.spend, 0))           AS roi_d7,    -- was: roas (always 0)
  SAFE_DIVIDE(c.spend - p.spend, NULLIF(p.spend, 0))   AS spend_delta
FROM curr c
LEFT JOIN curr_cohort cc USING (campaign_id)
LEFT JOIN prev p          USING (campaign_id)
WHERE c.spend > 0
ORDER BY c.spend DESC
LIMIT 100
```

Update the `CampaignRow` type in `src/types/dashboard.ts`:
- Rename `roas` → `roi_d7` (the name is more honest for GlobalComix's subscription monetization).
- Add `sub_d7?: number | null`, `sub_start_d7?: number | null`, `cpa_d7?: number | null`.

Update consumers in `src/components/campaigns/` to read `roi_d7` instead of `roas`. Update `EnrichedCampaignRow` in `src/lib/analyst/types.ts:222` (it extends `BQCampaignRow`, so the new fields flow automatically).

#### snapshot.ts comment fix

Update `src/lib/agents/hermes/snapshot.ts:32-46` ("What's NOT available without a new BQ query") to remove the campaign-level cohort claim. The new buildable shape is:

```ts
// What's available from the existing BQ queries:
//   * networks: per-network totals (… same as before …)
//   * campaigns: per-campaign spend + installs + cpi + spendDelta, PLUS cohort-attributed
//     sub_d7 + sub_start_d7 + cpa_d7 + roi_d7 (post-2026-05-17 join fix).
//   * trend: daily per-(date, network) rows for the active period.
//
// What's NOT available without a new BQ query:
//   * Period-over-period deltas at the NETWORK level for spend / sub funnel (only cpa_d7
//     has trailing baseline). Network deltas left undefined; renderer skips the arrow.
```

The snapshot builder doesn't need code changes today — `EnrichedCampaignRow` widens to carry the new fields automatically, and `buildHermesSnapshot` passes `args.ready.campaigns` through. The deck renderer can opt in to the new fields when the Smart Reports follow-up prompt teaches the prose-writer about them.

#### Acceptance

- Per-campaign rows show real ROI D7 values, not zeros.
- `CampaignRow.roi_d7` replaces `CampaignRow.roas`; all consumers updated.
- Unit test against a fixture: campaigns with no cohort match return `sub_d7: null` (not zero) so the dashboard can render `—`.
- `snapshot.ts` comment block updated in the same commit.
- E2E spec: `/campaigns` shows non-zero ROI D7 for at least the top 3 spending campaigns.

---

## WS2 — AppLovin wire-in

### Background

`dwh_applovin_globalcomix_adjust` exists, 9,009 rows since 2026-05-05. Cohort attribution split across two strings (`Axon by AppLovin Android`, `Axon by AppLovin iOS`). AppLovin is already in `IntentChannel` enum (`src/lib/analyst/types.ts:32`) and Hermes already accepts AppLovin reports — they just fail to produce data because the BQ layer doesn't UNION it. This WS unblocks downstream consumers automatically.

### Changes

1. **`src/lib/bq-security.ts`** — add to `spendSources` (line 150-ish, end of the array):

   ```ts
   {
     table: "dwh_applovin_globalcomix_adjust",
     network: "AppLovin",
     osStrategy: "column",       // AppLovin populates os reliably (verified)
     coverageStart: "2026-05-05"
   },
   ```

2. **`src/lib/globalcomix-queries.ts`** — the cohort branch is added in WS1.B (single combined CASE block). Also add to `CAMPAIGN_NAME_COLUMN_BY_TABLE` (line ~77):

   ```ts
   dwh_applovin_globalcomix_adjust: "campaign_name",
   ```

3. **`src/lib/mock/clients.ts`** — update `CLIENT_NETWORK_COVERAGE.globalcomix`:

   ```ts
   globalcomix: ["Meta", "TikTok", "Google", "Apple Search Ads", "AppLovin"],
   ```

4. **`src/lib/agents/hermes/snapshot.ts:76`** — extend `BQ_NETWORK_NAMES_FOR_CHANNEL`:

   ```ts
   const BQ_NETWORK_NAMES_FOR_CHANNEL: Record<IntentChannel, readonly string[]> = {
     meta: ["Meta", "Facebook"],
     google: ["Google", "Google Ads", "Google Ads ACI"],
     tiktok: ["TikTok"],
     apple_search_ads: ["Apple", "Apple Search Ads"],
     applovin: ["AppLovin"], // <-- add
   };
   ```

### Coverage warning

When the active date window starts before `2026-05-05`, AppLovin shows zero spend / zero subs. Surface this as an inline tooltip on the AppLovin row in Network Breakdown, using the new `coverageStart` field on `MultiSourceTable`. Add a small helper `coverageGapFor(source, range): { isPartial: boolean; sinceDate: string }` in `bq-security.ts` so the same logic is reusable for any future young source.

### Acceptance

- AppLovin joins the spend UNION; total Spend on the dashboard for any date range including post-2026-05-05 increases vs the pre-PR value.
- AppLovin appears in the Network Breakdown table and the channel donut.
- Cohort revenue / sub_d7 attributes to `'AppLovin'` for both Axon attribution strings.
- A Hermes-generated deck with `intent.channels = ["applovin"]` now produces non-empty per-channel sections instead of falling back to "no data".
- Coverage tooltip renders on the AppLovin row when the active range starts before 2026-05-05.

---

## WS3 — Cohort dimensional expansion

### Background

Today `buildCohortSubquery` aggregates to `(date, normalized_network)` only. The `uni_adjust_cohort_report_globalcomix` table has 39 columns; we use 10. This WS surfaces enough of the unused columns to power Geographic, Campaign / Ad drilldown, Paid-vs-Organic, BCAC, and the cleaner Trial Start / Sub Start funnel without changing the cohort FROM.

### Change strategy

Parameterize `buildCohortSubquery` by the calling query's grain:

```ts
type CohortGroupBy = "date" | "network" | "os" | "country" | "campaign_id" | "ad_id" | "creative";

function buildCohortSubquery(client: string, opts: {
  groupBy: CohortGroupBy[];
  /** Default true after WS1.B. Set false only if a caller intentionally wants paid-only. */
  includeOrganic?: boolean;
}): string;
```

Each caller passes the dimensions it needs. The subquery projects them through and groups by them.

### New columns to expose

Project these through `buildCohortSubquery` when their dimension is requested in `groupBy`:

- `_OS_name AS os` — already filtered on (Google iOS exclusion); now expose
- `_Country AS country`
- `_Campaign_ID AS campaign_id`
- `_Ad_ID AS ad_id`
- `_Creative_Attribution AS creative_name`

Always-on additive metrics (sum and project regardless of `groupBy`):

- `_*_subscription_start_Events` → `sub_start_d0`, `sub_start_d7`, `sub_start_d14`
- `_*_trial_start_Events` → `trial_start_d0`, `trial_start_d7`, `trial_start_d14`
- `_14D_Revenue_Total` → `rev_d14`, `_30D_Revenue_Total` → `rev_d30`, `_90D_Revenue_Total` → `rev_d90` (some already pulled — document)
- `_14D_Paying_Users` → `sub_d14`, `_30D_Paying_Users` → `sub_d30`, `_90D_Paying_Users` → `sub_d90`

### Switch sub_start source

Today `_queryGlobalComixKPIs` derives `sub_start` from spend-table `num_ftd7` (see comment at `globalcomix-queries.ts:152-161`). The investigation confirms the cleaner source is the cohort's `_7D_subscription_start_Events`. Switch:

```sql
-- old (in the KPI query's curr/prev CTEs):
SUM(ftd_d7) AS sub_start
-- new (sourced from cohort, not spend):
SUM(_7D_subscription_start_Events) AS sub_start
```

This moves `sub_start` from spend → cohort. Keep `ftd_d7` on the spend rows for back-compat, but the canonical `sub_start` is now cohort-sourced. Document the source change inline at the CTE site and at line 152.

### Maturity gating

Any new D7 / D14 cohort metric surfaced to the UI must respect `COHORT_D7_MATURITY_THRESHOLD` from `src/lib/analyst/maturity-gates.ts` (already used by `snapshot.ts:15`). When cohort size is below threshold, the metric value is null and the cell renders as `—`. Helper:

```ts
import { COHORT_D7_MATURITY_THRESHOLD, isMatureCohort } from "@/lib/analyst/maturity-gates";
const matureValue = isMatureCohort(row.cohort_d7) ? row.cpa_d7 : null;
```

If `isMatureCohort` doesn't exist as an export, add it as a one-liner there.

### Acceptance

- `buildCohortSubquery(client, { groupBy, includeOrganic })` accepts and respects `groupBy` and `includeOrganic`.
- `_queryGlobalComixKPIs` returns `sub_start_d0`, `sub_start_d7`, `sub_start_d14`, `trial_start_d0`, `trial_start_d7`, `trial_start_d14` as new fields on `KPIData`. Existing callers tolerate the additions (none should break).
- `sub_start` flows from cohort `_7D_subscription_start_Events`, not spend `num_ftd7`. Documented inline.
- Unit test: for a sample 30-day window, `sub_start_d7` from cohort matches the Looker Activity Overview KPI within ±2% (the Looker number is the team's trust baseline; use the prior-art doc's screenshot numbers).
- Maturity threshold is enforced on every D7/D14 metric flowing to the UI.

---

## WS4 — New module: subscriber lifecycle (`globalcomix-subs-queries.ts`)

### Background

`dwh_total_subs_globalcomix`:
- Schema: `(event_date DATE, os STRING, sub_type STRING, sub_count INT)`
- `sub_type` ∈ `{'subscribe', 'unsubscribe'}`
- `os` ∈ `{'iOS', 'Android', 'Web'}` (Web has 3,748 rows over the full table history)
- Daily aggregate per `(event_date, os, sub_type)` — NOT per-user
- Future-dated `event_date` rows exist up to 2027-03-17 (Open Question 3; filter to `event_date <= CURRENT_DATE()` for safety)

### File: `src/lib/globalcomix-subs-queries.ts`

Mirror the structure of `globalcomix-queries.ts`. Three exported async functions, each cached via `withRedisCache`:

```ts
queryGlobalComixSubsDaily(
  client: string, from: string, to: string, os?: OsFilter
): Promise<SubsDailyRow[]>

queryGlobalComixSubsOsMix(
  client: string, from: string, to: string
): Promise<SubsOsMixRow[]>

queryGlobalComixNetSubTrend(
  client: string, from: string, to: string, os?: OsFilter
): Promise<NetSubPoint[]>
```

### SQL for queryGlobalComixSubsDaily

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
  AND event_date <= CURRENT_DATE()              -- guard future-dated rows
  ${os && os !== 'total' ? `AND LOWER(os) = '${os.toLowerCase()}'` : ''}
GROUP BY event_date, os
ORDER BY event_date, os
```

### Web is in IntentPlatform already

`Intent.platforms` already declares `["android", "ios", "web"]`. The new `OsFilter` type (WS6) is `IntentPlatform | "total"`, so Web is a first-class value. Spend tables that have no Web data (Apple ASA, AppLovin) use `osStrategy: "implicit_ios"` or `"none"` and gracefully zero when `os = web`. The lifecycle frame is where Web actually matters; WS7.D renders it accordingly.

### ANALYST_QUERY_IDS registration

Add to `src/lib/analyst/types.ts` ANALYST_QUERY_IDS:

```ts
export const ANALYST_QUERY_IDS = {
  // …existing entries…
  TOTAL_SUBS_DAILY:    "total-subs-daily",
  TOTAL_SUBS_OS_MIX:   "total-subs-os-mix",
  NET_SUB_TREND:       "net-sub-trend",
} as const;
```

### API route

Add `src/app/api/bq/total-subs/route.ts` matching the convention of `/api/bq/dashboard-kpis/route.ts`. Accept `client, from, to, os?`. Strategy dispatch in `bq-queries.ts` (Playw3 / 100play return empty arrays, matching the existing pattern).

### Acceptance

- `globalcomix-subs-queries.ts` exists, three functions exported and cached.
- `/api/bq/total-subs` returns daily Sub / Churn / Net Sub rows for a 30-day window.
- Web rows included when `os=web` or `os=total`; excluded for `ios` / `android`.
- Future-dated rows past `CURRENT_DATE()` filtered out.
- All three queries registered in `ANALYST_QUERY_IDS`.
- E2E spec: `/dashboard` Lifecycle section renders with real numbers.

---

## WS5 — New analytical query functions

Four new exports in `globalcomix-queries.ts`. Each accepts `(client, from, to, os?: OsFilter, platforms?: IntentChannel[])`. Each registers in `ANALYST_QUERY_IDS`.

### WS5.A — `queryGlobalComixWeekends`

Bucket the spend UNION + cohort by `EXTRACT(DAYOFWEEK FROM date) IN (1, 7)`. Return two rows: `{ bucket: 'weekday', spend, installs, sub_d7, cpa_d7, roi_d7, install_cvr, sub_cvr, … }` and the weekend counterpart. Recompute rate metrics from sums (never average daily rates). Registers as `"weekends"`.

### WS5.B — `queryGlobalComixGeo`

GROUP BY `_Country` on the cohort + `breakdown_value` on the spend `Country` slice. Country normalization: cohort uses full names (`"United States"`), spend uses ISO-2 (`"US"`). Add `src/lib/iso-country-codes.ts` with the ISO-3166 mapping (~250 entries; one-time static file). Return one row per country with `{ country_code, country_name, spend, installs, sub_d7, rev_d7, cpa_d7, roi_d7, sub_paid, sub_organic }`. Registers as `"geo"`.

### WS5.C — `queryGlobalComixCreatives`

Per-ad rows. Cohort GROUP BY `_Ad_ID, _Creative_Attribution` for funnel + readable name. LEFT JOIN spend `breakdown_type = 'Creatives'` slice for cost / clicks / impressions (Meta only — TikTok creatives flow via the No Breakdown rows already, verify). LEFT JOIN `ods_fb2_creatives_globalcomix` on `_Ad_ID = _creative_id` for Meta thumbnails. Return `{ ad_id, ad_name, creative_name, network, thumbnail_url?, spend, installs, sub_start_d7, sub_d7, cpa_d7, roi_d7 }`. Limit top 100 by spend. Registers as `"creatives"`.

### WS5.D — `queryGlobalComixAttributionValidation`

Per-network side-by-side. JOIN base spend table + `_adjust` table per network on `(date, campaign_id)`. Project platform-self-reported columns (`fb_installs`, `fb_subscribe_total` for Meta; `conversions`, `subscription_purchase` for Google; `tiktok_installs`, `tiktok_purchase` for TikTok; `apple_installs` for Apple; `installs_applovin` for AppLovin) alongside Adjust-attributed columns. Return `{ network, week_iso, platform_installs, adjust_installs, platform_subs, adjust_subs, delta_pct }`. iOS only (matches Looker page scope). Registers as `"attribution-validation"`.

### Cache, API routes, dispatch

Each function gets:
- A `queryGlobalComix*` cached export.
- An `/api/bq/<name>/route.ts` route in the same shape as `dashboard-kpis`.
- A dispatch line in `bq-queries.ts` for Playw3/100play no-op fallback.

### Acceptance

- All four exports work against the live warehouse.
- Each cached with a 12h TTL.
- Each API route returns expected JSON shapes for a 30-day window.
- Unit tests cover aggregation rules + edge cases per function.
- Attribution Validation correctly excludes Google iOS on the Adjust side (existing data-quality filter) but includes it platform-self-reported, so the drift is visible.
- All four registered in `ANALYST_QUERY_IDS`.

---

## WS6 — Global filter spine: OS + Platform

### Type alignment

Reuse the analyst-layer enums. Do NOT invent parallel types:

```ts
// src/lib/filters/types.ts (new file)
import type { IntentPlatform, IntentChannel } from "@/lib/analyst";

export type OsFilter = IntentPlatform | "total";     // "ios" | "android" | "web" | "total"
export type PlatformFilter = IntentChannel;          // "meta" | "google" | "tiktok" | "apple_search_ads" | "applovin"

export const ALL_OS: OsFilter[] = ["total", "ios", "android", "web"];
export const ALL_PLATFORMS: PlatformFilter[] = ["meta", "google", "tiktok", "apple_search_ads", "applovin"];
```

### `useGlobalFilters` extension

Update `src/lib/filters/use-global-filters.ts`:

- Extend `GlobalFilters` interface at line 8: add `os: OsFilter` and `platforms: PlatformFilter[]`.
- URL encoding: `?os=ios` (default `total`, omitted from URL). `?platforms=meta,google` (default empty = all, omitted).
- Add `setOs(os)` and `setPlatforms(p[])` callbacks matching the existing `setRange` pattern.
- Validate URL values; fall back to defaults on garbage.

### Filter UI in `TopBar.tsx`

Two new components in `src/components/shell/`:

**`OsFilter.tsx`** — Segmented control. Four chips: `Total / iOS / Android / Web`. Mint accent (`--color-ua`) for active. Defaults to `Total`.

**`PlatformFilter.tsx`** — Multi-select chip group. Five chips: `Meta / Google / TikTok / ASA / AppLovin`. Each chip uses the brand convention from `src/lib/dashboard/network-colors.ts`. Plus an `All` reset chip on the left. Empty selection = all networks.

Slot both into `TopBar.tsx` (current filter slot is at lines 61-62, next to `<DateRangePicker />` and `<ClientSelector />`). The filter row already wraps on narrow viewports.

### API route param threading

Every `/api/bq/*` route accepts optional `os` and `platforms`:

- `os` defaults to `total` when absent.
- `platforms` is a comma-separated list. Empty / absent means all.
- Validate strictly; reject unknown values with 400.

Add an `optionalParams` helper next to `requireParams` in `src/app/api/bq/_lib/handle.ts`.

### Query function param threading

Every public `queryGlobalComix*` function accepts `os: OsFilter = "total", platforms?: PlatformFilter[]` after the existing `(client, from, to)`. The SQL builder:

- `OS = "total"`: emit no OS predicate.
- `OS = "ios"|"android"|"web"`: per-source predicate via `osStrategy`:
  - `"column"`: `WHERE LOWER(os) = '<os>'`
  - `"campaign_name"`: use `osSqlPredicate(os, "campaign_name")` from WS1.A's helper
  - `"implicit_ios"`: include only when OS = `"ios"` or `"total"`; emit `WHERE FALSE` to zero the leg otherwise
  - `"none"`: include only when OS = `"total"`; emit `WHERE FALSE` otherwise
- Cohort OS predicate: `WHERE LOWER(_OS_name) = '<os>'`
- For `platforms` non-empty: `WHERE network IN UNNEST(@platforms)`

### Dashboard hook + URL

`useDashboardData` in `src/lib/dashboard/use-dashboard-data.ts` reads `os, platforms` from `useGlobalFilters` and passes them to every fetch.

### Cache key implications

`paramHash` in `src/lib/cache/keys.ts` already canonicalizes objects with sorted keys. The new params hash naturally. **Do not bump the `v1` segment** — that invalidates all existing cache. Let the natural cold-miss path warm the new shape.

### Acceptance

- URL `?os=ios&platforms=meta,google` re-fetches the dashboard with only Meta + Google + iOS data.
- OS = `iOS` while platform = `AppLovin` returns AppLovin iOS rows (AppLovin has `osStrategy: "column"`).
- OS = `iOS` does NOT silently zero TikTok (the WS1.A bug fix).
- All chips persist across page refresh.
- Unit tests cover: every OS strategy × every OS value, platform IN-list predicate generation, URL state round-trip.
- E2E test: full filter combo set survives a hard refresh.

---

## WS7 — Dashboard UI updates

Five additive UI changes to `/dashboard` consuming the new queries.

### WS7.A — Cadence aggregated table (Daily / Weekly / Monthly)

New component `src/components/dashboard/CadenceTable.tsx`. Toggle Daily / Weekly / Monthly above the table. Reads `useDashboardData().trend` (per-(date, network)) and aggregates client-side via `src/lib/dashboard/aggregate-trend.ts` (new pure helper).

- Additive metrics: sum.
- Rate metrics: recompute from sums (never average daily rates).
- ISO weeks (Monday start). Period labels: `"Week 18 (27 Apr – 3 May 2026)"`, `"May 2026"`.

Slot below the TrendChart, above NetworkBreakdown.

### WS7.B — Weekends vs Weekdays card

New component `src/components/dashboard/WeekendsVsWeekdays.tsx`. Consumes `/api/bq/weekends`. Two-row table + spend bar chart. Respects OS + Platform filters via the WS6 spine.

### WS7.C — Network Breakdown color-coded scorecard

Update `src/components/dashboard/NetworkBreakdown.tsx`. Use **previous-period same-network** as the baseline (per the conversation; the network query already embeds the trailing 30d baseline for the existing status pill — reuse the same plumbing). The cell tone helper `src/lib/dashboard/cell-tone.ts`:

- Lower-is-better (CPI, CPA D0, CPA D7, CP Sub Start): `good` ≤ baseline × 0.9, `bad` ≥ baseline × 1.2, `warn` ≥ baseline × 1.05.
- Higher-is-better (Sub D7, ROI D7, Install CVR): inverted.
- Volume (Spend, Impr, clicks): no tone.

Hover tooltip explains the tone: `"CPA D7 is 18% above this network's previous-period average."`

### WS7.D — Lifecycle section (Sub / Churn / Net Sub)

New component `src/components/dashboard/SubscriberLifecycle.tsx`. Consumes `/api/bq/total-subs`. KPI strip (Subs / Churn / Net Sub totals), OS donut (iOS / Android / Web), Net Sub Over Time bar chart. Slot below NetworkBreakdown.

**This section ignores the global OS filter.** Subscriber lifecycle is its own scope; Web users matter for lifecycle even if the rest of the dashboard is iOS-only. Show a small note: `"Lifecycle includes all OS regardless of the dashboard filter."`

### WS7.E — Paid vs Organic strip (BCAC headline)

New compact card showing: Sub Total, Net Total, BCAC headline number, Sub Paid / Sub Organic donut. Cohort drives the donut (Paid networks + Organic + Untrusted Devices). BCAC = `total_spend / total_subs` (paid spend over all subs paid + organic). Slot above the trend chart so BCAC is visible as a headline.

### Acceptance

- All five UI additions render without layout overflow at 1280×800.
- All five respect the global filters from WS6 (except 7.D Lifecycle, intentionally).
- All five degrade gracefully when their data source is empty or in flight.
- Existing dashboard tests pass (no regressions on existing tiles / trend / channel mix).

---

## WS8 — Cache warming + tests + housekeeping

### Cache warmer extension

Update `src/lib/cache/warm.ts`. Add:

- All four new query functions from WS5 (`queryGlobalComixWeekends`, `queryGlobalComixGeo`, `queryGlobalComixCreatives`, `queryGlobalComixAttributionValidation`).
- All three new functions from WS4 (`queryGlobalComixSubsDaily`, `queryGlobalComixSubsOsMix`, `queryGlobalComixNetSubTrend`).
- The 8 common (OS × platform) combinations:
  1. `(os=total, platforms=[])` — current default
  2. `(os=ios, platforms=[])`, `(os=android, platforms=[])`, `(os=web, platforms=[])`
  3. `(os=total, platforms=[meta])`, `(os=total, platforms=[google])`, `(os=total, platforms=[tiktok])`, `(os=total, platforms=[apple_search_ads])`

That's 8 combos × ~12 queries ≈ 96 cache keys per warm pass. Upstash handles it. DO NOT warm the cross-product (20 combos × 12 = 240 keys); the data says users start at one orthogonal slice and drill from there.

### Test coverage

Per-WS budget:
- WS1: 14 unit tests (3 bugs + osStrategy refactor + snapshot.ts).
- WS2: 6 unit tests.
- WS3: 15 unit tests (cohort expansion, sub_start switch, dimensional groupBy, maturity gating).
- WS4: 10 unit tests, 1 E2E.
- WS5: 22 unit tests.
- WS6: 12 unit tests (filter state + SQL predicate generation), 1 E2E.
- WS7: 12 unit tests (new components + cell-tone helper), 2 E2E (cadence toggle, lifecycle section renders).
- WS8: 4 unit tests on the warmer.

Target: +95 unit, +4 E2E. Existing 847+ suite must continue to pass.

### Housekeeping at PR close

1. **`Lumen Vault/Status.md`** — Move dashboard / data-layer items from "in flight" to a "shipped" section. New "in flight" entry for the Smart Reports prose-writer follow-up (which teaches Hermes / Smart Reports about the new context fields).
2. **`Lumen Vault/Decisions.md`** — Append a dated entry summarizing what shipped, the three bugs fixed, the new tables wired, the new analytical views, and the three open questions punted to Gabby.
3. **`Lumen Vault/Technical/BigQuery Warehouse.md`** — Update the table inventory to reflect: `dwh_applovin_globalcomix_adjust` wired, `dwh_total_subs_globalcomix` as a new module's source, cohort dimensional expansion exposing 6 new dimensions, Meta `ods_fb2_creatives_globalcomix` LEFT JOIN, cohort attribution-validation joins.
4. **CLAUDE.md** — No change (UA framing was already updated 2026-05-17).
5. **PR description** — Surface the three open questions for Gabby explicitly:
   - SKAdNetwork ingestion path (`ods_adjust_skad_report_globalcomix` stale since 2025-08-04)
   - Pubmint cohort attribution without matching spend table (~7.7k rows / 90d)
   - `dwh_total_subs_globalcomix.event_date` semantics (future-dated rows up to 2027-03-17)

---

## Implementation notes

### Branch and PR shape

Single branch `globalcomix-full-implementation` off `main` (which now contains the merged Hermes / Smart Reports / analyst-layer work). Commits inside the PR follow the WS numbering — one commit per WS (or per WS.A/B sub-letter where the WS has internal segmentation). Final commit is the housekeeping pass.

### Order inside the PR

Strict order:

1. WS1 — bugs + osStrategy refactor. Anything after assumes the bugs are gone.
2. WS2 — AppLovin. Pure additive config.
3. WS3 — cohort expansion. Unblocks WS4 / WS5 / WS7 / downstream Smart Reports.
4. WS4 — subs module. Standalone.
5. WS5 — four new query exports.
6. WS6 — filter spine. Now that queries take `os` / `platforms`, wire it.
7. WS7 — UI updates.
8. WS8 — cache + tests + housekeeping.

### Read-only investigation already done

DO NOT re-run BQ discovery. The investigation report at `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md` and the JSON artifacts at `tmp/bq-discovery/2026-05-17-globalcomix/` are the source of truth. If a column or table name appears wrong, check the JSON artifacts first; only run a new BQ query as a last resort.

### Out of scope (explicit)

- **Smart Reports prose-writer prompts** in `src/lib/smart-reports/prompts/`. Once WS3 exposes organic / country / ad-level dimensions to `ReadyData`, the prose-writer prompts may need to be taught to use them ("paid spend is 70% of subs, organic is up 324% MoM"). This is a separate follow-up prompt; the data path lands here, the prose update lands next.
- Meta Web spend from raw ods landing tables (`ods_fb2_insight_general_web_globalcomix` + geo / placement). Defer; needs parser work.
- D14/D30/D90 cohort retention rate + LTV-per-paying-user from the per-window ods tables. Defer; not in any of the 12 Looker frames.
- `ods_adjust_overview_report_globalcomix` engagement metrics. Defer.
- Subscription Plan Mix from `ods_url_subs_globalcomix`. Defer.
- ASA Keyword Performance from `ods_apple_searchterms_globalcomix`. Defer.
- Analyst-layer integration with the new views (anomaly detection on weekends data, country-level anomstack, creative-level rankings). The data lands here; the analyst hooks are a follow-up.

### Open questions (do NOT block this PR)

1. **SKAdNetwork**: surface the staleness in the Attribution Validation view (WS5.D) and leave a TODO comment for Gabby. Source: `ods_adjust_skad_report_globalcomix` stopped updating 2025-08-04.
2. **Pubmint**: drop to NULL bucket as documented in WS1.B; TODO comment near the CASE.
3. **`dwh_total_subs.event_date` semantics**: filter to `<= CURRENT_DATE()` for safety; TODO comment near the SQL in WS4.

### Reference

- Investigation report: `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md`
- Phase artifacts: `tmp/bq-discovery/2026-05-17-globalcomix/{A..F}-*.json`
- Prior-art structural map: `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`

Current code touchpoints (post-merge state, verified 2026-05-17):

- `src/lib/globalcomix-queries.ts` (~1100 lines) — primary SQL file
- `src/lib/bq-security.ts` lines 81-103 (`MultiSourceTable` type, `hasOs` → `osStrategy`) and lines 146-151 (`spendSources` array)
- `src/lib/filters/use-global-filters.ts` (161 lines) — current `GlobalFilters` interface at line 8
- `src/components/shell/TopBar.tsx` lines 61-62 — filter slot
- `src/lib/dashboard/use-dashboard-data.ts` — dashboard fetch orchestrator
- `src/components/dashboard/DashboardView.tsx` — dashboard layout
- `src/components/dashboard/NetworkBreakdown.tsx` — scorecard target
- `src/lib/cache/{with-redis-cache,keys,warm,invalidate,stats}.ts` — cache layer
- `src/lib/analyst/types.ts` — `Intent`, `IntentChannel`, `IntentPlatform`, `ReadyData`, `EnrichedCampaignRow`, `ANALYST_QUERY_IDS`
- `src/lib/analyst/campaign-classifier.ts` — `classifyCampaignName`, `PLATFORM_TOKENS` (add `osSqlPredicate` here in WS1.A)
- `src/lib/analyst/maturity-gates.ts` — `COHORT_D7_MATURITY_THRESHOLD`
- `src/lib/agents/hermes/snapshot.ts` lines 32-46 (stale "What's NOT available" comment to update in WS1.C) and lines 72-110 (`BQ_NETWORK_NAMES_FOR_CHANNEL`, extend in WS2)
- `src/types/dashboard.ts` — `CampaignRow`, `NetworkRow`, `BQTrendPointByNetwork` (extend in WS1.C and WS3)
