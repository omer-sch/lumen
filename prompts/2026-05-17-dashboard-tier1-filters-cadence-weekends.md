# [SUPERSEDED 2026-05-17] Dashboard Tier 1: OS + Platform filter spine, time-cadence aggregation, weekends comparison, color-coded scorecard (2026-05-17)

> **Do not implement this prompt.** Superseded by `2026-05-17-globalcomix-full-implementation.md`, which bundles this scope with the bug fixes and the Bucket 2 / Bucket 3 work uncovered by the BQ investigation. The investigation also surfaced wrong assumptions baked into this prompt (notably TikTok `hasOs: true` — the column is 100% NULL, OS must come from `campaign_name`). Kept for historical context only.

---

Owner: Omer. Single PR on a new branch off `main`. Five workstreams that close the most visible gaps between Lumen's `/dashboard` and the GlobalComix UA Looker dashboard the yellowHEAD team relies on today. All five sit on data we already query — no new Rivery taps, no new BQ tables. Tier 2 (Paid vs Organic + BCAC, Geographic, Adset drilldown, Attribution Validation) is explicitly out of scope for this PR and will be its own prompt.

## Why we are doing this

Prior-art capture of the live Looker dashboard documented at `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`. The team has roughly 60 Looker pages organized into 5 sections by OS / channel. They do not want fewer analytical capabilities than Looker gives them today — they want the same capabilities presented better. The single biggest UX move is replacing Looker's 5-sections × multiple-pages structure with a two-layer filter spine on a single dashboard page:

- **Layer 1 (OS):** iOS / Android / Web / Total
- **Layer 2 (Platform/channel):** Meta / Google / TikTok / Apple Search Ads / All

Plus the daily-vs-weekly-vs-monthly cadence toggle and the weekends-vs-weekdays comparison the team uses on a quasi-daily basis.

CLAUDE.md was updated in the same session to lock in the subscription-pilot metric vocabulary (CPA D7 / ROI D7 / BCAC / Sub D7 funnel) and the Dashboard / Campaigns IA examples now reflect it. The current `DEFAULT_SLOTS = ["cpaD7", "spend", "installs", "subD7"]` in `DashboardView.tsx` is correct — no change needed there.

## TL;DR

Five workstreams ordered by risk:

1. **WS1** — OS filter (iOS / Android / Web / Total) threaded from the global filter bar through every BQ query.
2. **WS2** — Platform filter (Meta / Google / TikTok / ASA / All, multi-select) threaded the same way.
3. **WS3** — Time-cadence aggregated table (Daily / Weekly / Monthly) on the existing trend data.
4. **WS4** — Weekends-vs-Weekdays comparison panel on the existing trend data.
5. **WS5** — Single-row color-coded scorecard styling on the Network Breakdown table.

Each is independently shippable. Bundle them as one PR so a single dashboard render validates all five.

---

## WS1 — OS filter (iOS / Android / Web / Total)

### Today

The dashboard has no OS filter. `useGlobalFilters` carries `from`, `to`, `client`. The cohort table `uni_adjust_cohort_report_globalcomix` has `_OS_name` natively — we already filter on it (the Google iOS exclusion at `globalcomix-queries.ts` ~line 184). We just don't expose it.

### What "OS" means per data source

Per `src/lib/bq-security.ts` and the multi-source config in `CLIENT_SCHEMA.globalcomix`:

| Source | OS handling |
|---|---|
| Cohort table (`uni_adjust_cohort_report_globalcomix`) | `_OS_name` populated. Values: `'ios'`, `'android'`, `'web'`. Filter directly. |
| Meta spend (`dwh_fb2_globalcomix_adjust`) | `hasOs: true`. Has an `os` column. Filter directly. |
| TikTok spend (`dwh_tik_tok_globalcomix_adjust`) | `hasOs: true`. Has an `os` column. Filter directly. |
| Google spend (`dwh_google_ads_globalcomix_adjust`) | `hasOs: false` (column exists but empty on `No Breakdown` slice). Infer from `campaign_name` using `src/lib/analyst/campaign-classifier.ts` (`classifyCampaign(name).platform`). |
| Apple spend (`dwh_apple_globalcomix_adjust`) | Apple Search Ads is iOS-only by definition. When OS=`iOS` or `Total`: include. When OS=`android` or `web`: exclude entirely. |

### Files

- `src/lib/filters/use-global-filters.ts` — add `os: "ios" | "android" | "web" | "total"` to the state shape, URL search-param encoding, default `"total"`.
- `src/components/shell/` — the TopBar / global filter component. Add an OS segmented control next to the date range picker. Mint accent for active state.
- `src/lib/bq-security.ts` — extend `MultiSourceTable` with the inference strategy (`"column" | "campaign_name" | "implicit_ios"`) so `globalcomix-queries.ts` doesn't need to special-case Apple/Google inline.
- `src/lib/globalcomix-queries.ts` — thread `os` through every query. The dirty work is in `buildSpendSubquery` and `buildCohortSubquery`. Each UNION leg gets a per-source OS predicate built from the table's strategy.
- All 6 `/api/bq/*` route handlers — accept `os` as a query string param, validate against the four allowed values, pass through.
- `src/lib/dashboard/use-dashboard-data.ts` — include `os` in the URL search params.
- `src/lib/cache/keys.ts` — no change needed; the existing `paramHash` will incorporate the new `os` param automatically. **Note: cache footprint multiplies by 4 OS values × N platform values; see WS2.**
- `src/lib/cache/warm.ts` — extend the warmer to walk the relevant combinations (see "Cache strategy" below).

### Change

In `buildSpendSubquery`, replace the flat UNION with per-source legs that each apply their own OS predicate built from `MultiSourceTable.osStrategy`:

```ts
// pseudo, real impl needs the existing dedupe + campaign_name handling preserved
function osPredicateFor(src: MultiSourceTable, os: OsFilter): string {
  if (os === "total") return "TRUE";
  switch (src.osStrategy) {
    case "column":
      return `LOWER(os) = '${os}'`;
    case "implicit_ios":
      return os === "ios" ? "TRUE" : "FALSE";  // emits an empty leg
    case "campaign_name":
      // Use the canonical classifier output. For Google, the classifier
      // returns "ios" | "android" | null based on campaign_name tokens.
      // Project the predicate as a CASE WHEN so SQL stays declarative.
      return classifierSqlPredicate(os);  // helper that emits the WHEN clause
  }
}
```

For the cohort subquery, add `_OS_name = @os` to the WHERE when `os !== "total"`. **Important:** keep the existing Google-iOS exclusion (`NOT (_Network_Attribution LIKE 'Google Ads%' AND _OS_name = 'ios')`) intact — it is independent of the user-facing OS filter, it is a data-quality filter for a known broken attribution.

For the campaign_name strategy (Google), the cleanest path is to inline a `LOWER(campaign_name) LIKE '%_ios_%' OR LOWER(campaign_name) LIKE '%_iphone_%'` style predicate in SQL — but only AFTER aligning the token list with `classifyCampaign` so the two paths can't drift. Add a `getOsTokensForSql(os)` helper in `src/lib/analyst/campaign-classifier.ts` that the SQL builder imports.

### Cache strategy

Each new filter dimension multiplies the cache footprint. Today the cache holds 7 queries × 1 client × 1 date range = 7 keys for the default load. After WS1+WS2 the warmer's defaults give us 7 queries × 1 client × 4 OS values × 6 platform values = 168 keys per default range, which is fine on Upstash. The warmer should pre-populate the most common views (OS=Total + each individual OS + Platform=All) — not the full cross-product. Concretely, extend `warmClientCache` to run:

- (os=total, platform=all) — current default
- (os=ios, platform=all), (os=android, platform=all), (os=web, platform=all) — top-level OS toggles
- (os=total, platform=meta), (os=total, platform=google), (os=total, platform=tiktok), (os=total, platform=apple_search_ads) — top-level platform toggles

= 1 + 3 + 4 = 8 default-window combinations. The user's other selections cold-miss into BigQuery once and then hit on the next access; that's acceptable.

### Acceptance

- Global filter bar renders an OS segmented control with `Total / iOS / Android / Web` chips, defaulting to `Total`. Active chip uses mint accent.
- Selecting an OS updates the URL search param and re-fetches all dashboard data.
- KPI tiles, trend chart, channel mix, network breakdown, payback all respect the OS filter.
- Selecting `iOS` while Apple Search Ads has spend keeps Apple in the network breakdown; selecting `Android` excludes Apple entirely.
- Selecting `iOS` excludes Google iOS via the existing attribution-bug filter (no change to that behavior).
- Unit tests in `tests/unit/lib/globalcomix-queries.test.ts` cover all four OS values × the five spend sources × the cohort table — one assertion per (os, source) pair against the SQL fragment shape.
- E2E spec covers the segmented-control interaction and verifies a network re-fetch.

---

## WS2 — Platform filter (Meta / Google / TikTok / ASA / All)

### Today

`network` is already a dimension in every query (UNION leg label in spend, normalized bucket in cohort). The dashboard renders all networks together; you can't slice to "TikTok only" without going to a different Looker page. AppLovin is not in our spend sources at all (see "Out of scope" below).

### Files

- `src/lib/filters/use-global-filters.ts` — add `platforms: Platform[]` where `Platform = "meta" | "google" | "tiktok" | "apple_search_ads"`. Empty array means "all". URL-encode as comma-separated.
- `src/components/shell/` — multi-select chip group next to the OS control. Default empty (all networks shown).
- `src/lib/globalcomix-queries.ts` — thread `platforms?: string[]` through every query. When set and non-empty, add `AND network IN UNNEST(@platforms)` to the spend leg WHERE and the cohort leg WHERE. When empty, no predicate.
- All 6 `/api/bq/*` route handlers — accept `platforms` as comma-separated query string, parse + validate.
- `src/lib/dashboard/use-dashboard-data.ts` — include `platforms` in URL search params.

### Change

The SQL change is minimal because the dimension exists. The `paramHash` in `cacheKey` will pick up the new params automatically.

UI: a multi-select chip group, NOT a dropdown. Each platform gets a chip with the brand-relevant accent (Meta=violet, Google=mint, TikTok=coral, ASA=neutral). Clicking toggles. An "All" chip on the left resets to empty array. Visually echo the Looker convention: when a platform is selected, the chip fills with its brand color.

### Acceptance

- Filter bar shows four platform chips + an "All" reset chip.
- Selecting one or more platforms filters every dashboard section accordingly.
- Selecting all four equals "All" (no extra request; the empty-array predicate path stays cold).
- URL state survives reload.
- Cache keys hash the platforms array deterministically (the existing canonicalize already sorts object keys; arrays preserve order, so emit the platform list in a canonical order before hashing — see `paramHash` in `src/lib/cache/keys.ts`).

### Out of scope

**AppLovin is not in our spend sources today.** The Looker AppLovin section pulls from `dwh_applovin_globalcomix_adjust` (or similar) which we do not yet UNION. Adding AppLovin is a Tier 2 workstream (new source table + cohort table review + four `bq-security.ts` config entries) and will be its own prompt. Do NOT include AppLovin in WS2's chip list — users seeing it greyed out is worse than seeing only the four we support.

---

## WS3 — Time-cadence aggregated table (Daily / Weekly / Monthly)

### Today

The trend chart shows daily data. The team uses Looker's Monthly View / Weekly View / Daily pages for full-funnel-by-period tables: one row per period with columns for Spend, Impr, clicks, installs, CPI, Install CVR, Sub Start D0, CP Sub Start D0, Sub D0, CPA D0, Sub D7, CPA D7. Lumen has none of this aggregated-per-period view.

`queryGlobalComixTrend` already returns rows at `(date, network)` grain — everything needed to build the monthly/weekly/daily aggregated table client-side. No SQL change. Pure UI.

### Files

- `src/components/dashboard/` — new component `CadenceTable.tsx` that renders the aggregated table.
- `src/lib/dashboard/use-dashboard-data.ts` — expose the existing daily trend data as a derived shape grouped by period.
- `src/lib/dashboard/aggregate-trend.ts` — pure helper (new file) that takes `BQTrendPointByNetwork[]` + a cadence (`"daily" | "weekly" | "monthly"`) and returns `{ periodLabel, range, ...metricSums, ...recomputedRates }[]`.
- `src/components/dashboard/DashboardView.tsx` — slot the CadenceTable below the trend chart, above the NetworkBreakdown.
- `tests/unit/lib/dashboard/aggregate-trend.test.ts`

### Change

The cadence toggle lives on the trend chart header today (per `TrendChart.tsx`). Extend it to four segments: `Daily / Weekly / Monthly`. Default `Daily`.

Aggregation rules (this is where bugs hide):
- **Additive metrics** (Spend, Impr, clicks, installs, Sub Start D0, Sub D0, Sub D7): plain sum across all rows in the period.
- **Rate metrics** (CPI, CTR, CPM, Install CVR, CP Sub Start D0, CPA D0, CPA D7, ROI D7): recompute from sums at the period grain — do NOT average per-day rates. The week's CPI is `SUM(spend) / SUM(installs)`, not `AVG(daily_cpi)`. There is precedent for this rule in `aggregateTrendByDate` in `use-dashboard-data.ts` — follow that pattern.

Weekly grain: ISO weeks starting Monday. Show `"Week 18 (27 Apr – 3 May 2026)"` in the period label column.

Monthly grain: calendar months in the active client's timezone (US for GlobalComix — confirm with Gabby; default UTC if unset).

### Acceptance

- New `Cadence` segmented control on the dashboard renders Daily / Weekly / Monthly.
- Selecting Weekly shows one row per ISO week within the active date range, with the full funnel columns.
- Selecting Monthly shows one row per calendar month.
- Grand total row at the bottom matches the dashboard KPI tile totals (within rounding).
- Unit tests cover (a) plain sum of additive metrics, (b) re-computed-from-sums rate metrics, (c) ISO week boundary edge case (range starting Sunday, range ending mid-week), (d) timezone consistency.

---

## WS4 — Weekends vs Weekdays comparison

### Today

The team uses Looker's "Weekends vs working days" page to check whether weekends differ. For GlobalComix UA right now they do — weekends outperform weekdays on ROI (27.5% vs 24.89%) and Sub CVR (3.79% vs 3.58%). Lumen does not surface this anywhere.

### Files

- `src/components/dashboard/` — new component `WeekendsVsWeekdays.tsx`.
- `src/lib/dashboard/segment-by-weekend.ts` — pure helper (new file) that buckets `BQTrendPointByNetwork[]` into `{ weekends: AggregatedRow; weekdays: AggregatedRow }`.
- `src/components/dashboard/DashboardView.tsx` — slot it in. Recommendation: a compact two-row card below `CadenceTable`, above `NetworkBreakdown`. Bar chart of spend split next to it (Working days bar + Weekends bar).
- `tests/unit/lib/dashboard/segment-by-weekend.test.ts`

### Change

Bucketing rule: `EXTRACT(DAYOFWEEK FROM date)` in BQ-speak is `getUTCDay()` on the JS Date — `0` and `6` (Sunday + Saturday) bucket to `weekends`, the rest to `weekdays`. Use UTC consistently with the rest of the dashboard.

Columns to surface in the two-row table (match Looker's column list for this view):
Spend, Impr, clicks, CTR, installs, CPI, Install CVR, Sub CVR, Sub D7, CP Sub D7, ROI D7.

Apply the same "recompute rates from sums" rule as WS3.

### Acceptance

- The card shows a two-row comparison: "Working days" / "Weekends".
- Each cell has period-delta coloring (green for the better side, neutral if within 5%).
- Bar chart on the right shows total spend per bucket with the same accent colors as KPI tiles.
- Respects the OS + Platform filters from WS1/WS2.
- E2E spec verifies the card renders with the default 30-day window.

---

## WS5 — Color-coded scorecard styling on Network Breakdown

### Today

`src/components/dashboard/NetworkBreakdown.tsx` (~227 lines) renders the per-network table with deltas but the cells themselves are not color-coded. Looker's "Activity Overview new comparison" page is the team's favorite layout — single-row scorecard with conditional cell coloring (green for good values, orange/yellow for warning, red for bad). The team explicitly prefers this over multi-table layouts.

### Files

- `src/components/dashboard/NetworkBreakdown.tsx`
- `src/lib/dashboard/cell-tone.ts` — pure helper (new file) that takes `(metric, value, baseline, lowerIsBetter)` and returns one of `"good" | "neutral" | "warn" | "bad"`. Used to drive the cell background.
- `tests/unit/lib/dashboard/cell-tone.test.ts`

### Change

Per-cell tone is computed from the value vs a baseline:
- For **lower-is-better metrics** (CPI, CP Sub Start D0, CPA D0, CPA D7): `good` if value ≤ baseline × 0.9, `bad` if value ≥ baseline × 1.2, `warn` if ≥ baseline × 1.05.
- For **higher-is-better metrics** (Installs, Sub D7, ROI D7, Install CVR, Sub CVR): inverted.
- For **volume metrics with no obvious "good"** (Spend, Impr, clicks): no tone, neutral.

The baseline is the grand-total average across all networks in the same period — already available client-side. The tone palette:
- `good`: mint tint (use `--color-ua` at ~12% mix into surface — there is precedent in `DashboardView.tsx` for the data-freshness chip)
- `warn`: yellow tint
- `bad`: coral tint
- `neutral`: no tint

Keep the existing delta arrows + percentage deltas next to the value; the cell background is additive, not replacing.

### Acceptance

- Network Breakdown rows show colored cell backgrounds for the rate metrics.
- Hovering a colored cell shows a tooltip explaining the tone ("CPA D7 is 18% above the period average").
- Color tones are stable across re-renders (no flicker on data updates).
- Accessibility: cell background tones meet 4.5:1 contrast against the cell text. Use `--text-primary` and verify against the cell colors.
- Unit tests cover all four tone buckets against synthetic baselines for each metric.

---

## Implementation notes

### Branch and PR shape

Single PR. Branch off `main`, name it `dashboard-tier1-filters-cadence-weekends`. Keep workstream commits separate inside the PR for reviewability — one commit per WS plus a final integration commit if needed.

### Test budget

- WS1: 8-12 new unit tests (per source × per OS), 1 new E2E.
- WS2: 4-6 new unit tests, 1 new E2E.
- WS3: 8-10 new unit tests (aggregation rules + boundary cases), 1 new E2E.
- WS4: 4-6 new unit tests, 1 new E2E.
- WS5: 6-8 new unit tests, 1 new E2E.

Roughly +35-50 tests on top of the existing suite. Existing tests must continue to pass.

### Cache invalidation

After this PR ships, the cache key shape stays the same but the param surface widens (new `os` and `platforms` params hash into `paramHash`). Existing keys (with no OS/platform params) will go cold once the new request shape lands. That's fine — the next dashboard load will repopulate via the warmer. **Do not bump the `v1` version segment in `cacheKey`** — that would invalidate ALL keys including the 7 default-load keys mid-deploy. Let the natural cold-miss path warm the new shape.

### Out of scope explicitly

The following are Tier 2 / Tier 3 from the recommendation. Do NOT do them in this PR:

- AppLovin spend source (new Rivery tap, new `dwh_*` table)
- Paid vs Organic + BCAC (cohort bucketing change + new "Total subs" denominator)
- Geographic view (Country breakdown slice on existing tables + cohort country)
- Adset drilldown (new dimension on existing spend tables)
- Creative drilldown (new ad-level data sources entirely)
- Subscriber Lifecycle (Sub / Churn / Net Sub — needs subscription-state table not yet identified)
- Attribution Validation page (Adjust vs platform self-report side-by-side)

These will each get their own prompt.

### Three open questions to surface in PR description

The PR description should explicitly call out these three questions for Gabby. None block this PR but their answers shape Tier 2:

1. Does `dwh_fb2_globalcomix_adjust` include Web rows, or is there a separate `dwh_fb_web_*` table? Same for Google/TikTok. Determines whether the OS=Web filter is fully correct after this PR.
2. Is there a subscription-state / churn-events table for GlobalComix in BQ?
3. What's the table name for ad-level cohort attribution, and is ad-level spend on a slice of the existing `dwh_*` tables or a separate table?

### Reference

- Prior-art structural map: `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md`
- CLAUDE.md UA metric framing (subscription pilot vocabulary): updated 2026-05-17, see the `UA metric framing depends on the client's monetization model` paragraph.
- Multi-source config: `src/lib/bq-security.ts` lines 132-158.
- Today's query module: `src/lib/globalcomix-queries.ts` (~1100 lines).
- Today's dashboard hook: `src/lib/dashboard/use-dashboard-data.ts`.
- Today's dashboard view: `src/components/dashboard/DashboardView.tsx`.
- Campaign classifier (for the Google OS inference fallback): `src/lib/analyst/campaign-classifier.ts`.
