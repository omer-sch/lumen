# Freshness signal is wrong: investigate and fix (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `freshness-signal-fix`. One workstream that opens with investigation and converges on a fix once the BQ ground truth is known. The investigation step is NOT optional. Do NOT patch the SQL blindly from the hypothesis below.

## The user-visible bug

The dashboard's freshness bar reads `Data as of [date] · synced X hours ago`. The "synced X hours ago" half is wrong: it shows ~30 hours when Rivery actually syncs twice a day (so the value should never exceed ~12 hours). The `yellowHEAD` Looker dashboard, sitting on the same BigQuery warehouse, shows fresh data — so the data IS landed in BQ, but Lumen's freshness query is reading a wrong signal.

A separate complaint about wrong KPI values is intentionally parked. This PR ONLY fixes the freshness bar (`hoursAgo` and the bar's tone-dot color). Do not touch any dashboard KPI query, do not touch `dataAsOf`'s underlying spend-table query (we have a separate, smaller concern about that, addressed at the bottom of this prompt under "Concurrent fix").

## The two signals, in the current code

The freshness UI surfaces two things computed by two different queries and joined in one render:

1. **`hoursAgo`** is computed by `_queryFreshness` in `src/lib/bq-queries.ts` (around line 402). It reads `MAX(date) FROM rivery_activity_anlytics.v_rivery_activity_check`, anchors the date at midnight UTC, and computes hours from that moment to `Date.now()`.

2. **`dataAsOf`** is computed by `_queryGlobalComixDataAsOf` in `src/lib/globalcomix-queries.ts` (around line 1545). It reads `GREATEST(MAX(date))` across the per-network spend tables. This is the gold standard for "what data do we have."

The bug lives in signal #1. Two structural concerns with the current code, prior to any data inspection:

- **Date-vs-timestamp coarseness.** `date` is a BQ `DATE` column (a calendar day), not a `TIMESTAMP`. Anchoring at "midnight UTC of that date" introduces up to 24 hours of slack on its own. If the view's MAX(date) is yesterday for any reason, `hoursAgo` lands somewhere in 24-48 hours.
- **Wrong source table.** BigQuery exposes a real "last modified" timestamp on every table via `__TABLES__.last_modified_time` (millis since epoch). That's the canonical signal for "when did this table get written to." The current code instead reads from an operational view whose `date` semantics aren't documented in the codebase and whose update cadence is opaque.

## Investigation — run BEFORE coding

Run these five queries against BigQuery (project `yellowhead-visionbi-rivery`, location matches the dataset; use `bq query --use_legacy_sql=false` or the BQ console). Capture each result set in the PR description. Do NOT proceed to the fix until all five have run and the findings are written up.

### Q1 — What dates actually exist in the Rivery activity view, last 10

```sql
SELECT date, COUNT(*) AS row_count
FROM `yellowhead-visionbi-rivery.rivery_activity_anlytics.v_rivery_activity_check`
WHERE date IS NOT NULL
GROUP BY date
ORDER BY date DESC
LIMIT 10;
```

### Q2 — Does the view have a timestamp column we're missing

```sql
SELECT column_name, data_type
FROM `yellowhead-visionbi-rivery.rivery_activity_anlytics.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'v_rivery_activity_check';
```

### Q3 — Smoking gun: what the current freshness query returns this instant

```sql
SELECT MAX(date) AS last_updated
FROM `yellowhead-visionbi-rivery.rivery_activity_anlytics.v_rivery_activity_check`
WHERE date IS NOT NULL;
```

### Q4 — Real "table last written" timestamps for the GlobalComix spend tables

```sql
SELECT
  table_id,
  TIMESTAMP_MILLIS(last_modified_time) AS table_last_written_utc,
  TIMESTAMP_DIFF(
    CURRENT_TIMESTAMP(),
    TIMESTAMP_MILLIS(last_modified_time),
    HOUR
  ) AS hours_since_write
FROM `yellowhead-visionbi-rivery.yellowhead_prod.__TABLES__`
WHERE table_id IN (
  'dwh_fb2_globalcomix_adjust',
  'dwh_google_ads_globalcomix_adjust',
  'dwh_tik_tok_globalcomix_adjust',
  'dwh_apple_globalcomix_adjust',
  'dwh_applovin_globalcomix_adjust'
)
ORDER BY last_modified_time DESC;
```

### Q5 — Latest date IN the data per spend table

```sql
SELECT 'dwh_fb2_globalcomix_adjust' AS source, MAX(date) AS latest_date
FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_fb2_globalcomix_adjust`
UNION ALL SELECT 'dwh_google_ads_globalcomix_adjust', MAX(date)
FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_google_ads_globalcomix_adjust`
UNION ALL SELECT 'dwh_tik_tok_globalcomix_adjust', MAX(date)
FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_tik_tok_globalcomix_adjust`
UNION ALL SELECT 'dwh_apple_globalcomix_adjust', MAX(date)
FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_apple_globalcomix_adjust`
UNION ALL SELECT 'dwh_applovin_globalcomix_adjust', MAX(date)
FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_applovin_globalcomix_adjust`
ORDER BY latest_date DESC;
```

## Decision tree for the fix

Once Q1-Q5 have run, pick the branch that matches the data. Each branch has a different fix. Do NOT combine branches.

### Branch A — Q4 shows a table written within the last 12 hours AND Q3 returns a stale date

This is the most likely outcome. It confirms the data is fresh in the warehouse but the Rivery activity view is lagging or has wrong-for-our-purpose date semantics.

**Fix:** Replace the current `_queryFreshness` SQL with one that reads `MAX(last_modified_time)` across the per-network spend tables via `__TABLES__`. Pattern:

```sql
WITH per_table AS (
  SELECT
    table_id,
    TIMESTAMP_MILLIS(last_modified_time) AS last_written_utc
  FROM `yellowhead-visionbi-rivery.yellowhead_prod.__TABLES__`
  WHERE table_id IN (UNNEST([
    'dwh_fb2_globalcomix_adjust',
    'dwh_google_ads_globalcomix_adjust',
    'dwh_tik_tok_globalcomix_adjust',
    'dwh_apple_globalcomix_adjust',
    'dwh_applovin_globalcomix_adjust'
  ]))
)
SELECT MAX(last_written_utc) AS last_updated
FROM per_table;
```

(Generalize: pull the table list from `cfg.spendSources` the same way `_queryGlobalComixDataAsOf` does, so the fix works for any multi-source client, not just GlobalComix. Read `getMultiSourceConfig(client).spendSources` and build the `UNNEST([...])` from it.)

In TypeScript, the value coming back from BQ is now a real timestamp string, not a date. Update the parsing:

```ts
// before: anchored at midnight UTC of a DATE column
const ts = new Date(`${dateStr}T00:00:00Z`).getTime();

// after: parse the timestamp directly
const ts = new Date(timestampStr).getTime();
```

`hoursAgo` math stays the same. The clamp `Math.max(0, ...)` stays. The fallback for parse failure (`hoursAgo: -1`) stays.

### Branch B — Q4 shows tables NOT written in the last 24 hours AND Q3 returns yesterday's date

This would mean Rivery actually hasn't synced today and the freshness bar is correctly surfacing a real problem. In that case the "bug" is the user's mental model. Do NOT patch in this branch; instead, write up the finding in the PR description as "no fix needed, Rivery is actually behind." Update Status.md to flag the BI question for Gabby.

### Branch C — Q2 reveals a real TIMESTAMP column on `v_rivery_activity_check`

If the view exposes a column like `loaded_at` / `last_run` / `end_time` of type `TIMESTAMP` or `DATETIME`, the fix is even simpler: change the SELECT to read MAX(that column) and parse as a timestamp. This is preferable to Branch A only if the view's semantics are documented and trustworthy. If unclear, default to Branch A (read `__TABLES__.last_modified_time`) since that's BQ's native source of truth.

### Branch D — anything weirder

If the data doesn't fit any of the above, stop and write up findings in the PR description without coding a fix. The user will look at it and decide.

## Concurrent fix — Sync Now should invalidate the freshness cache

Regardless of which branch above lands, ALSO fix this gap:

`queryFreshness` in `bq-queries.ts` is wrapped in Next.js `unstable_cache` with `revalidate: 600` (10 min) and tags `["bq", "bq:freshness"]`. The Sync Now button (`POST /api/cache/refresh`) currently invalidates Redis and re-warms it, but does NOT call `revalidateTag("bq:freshness")`. So after Sync Now, the freshness bar still shows the previous value for up to 10 more minutes, even though Redis is fresh.

The fix lives in `src/app/api/cache/refresh/route.ts`. After the `invalidateClientCache(client)` call (line 56 today), add:

```ts
import { revalidateTag } from "next/cache";
// ... in the handler, after invalidateClientCache:
revalidateTag("bq:freshness");
```

Verify by clicking Sync Now twice in quick succession on a dashboard: after the first click the value should already be the post-sync value, not the pre-sync one held for 10 minutes.

## Out of scope

- Do NOT touch `_queryGlobalComixDataAsOf` or its callers. The "Data as of [date]" string can stay as-is in this PR.
- Do NOT change the cache TTL on `queryFreshness`. The 10-min revalidate is fine once the invalidation gap is closed.
- Do NOT touch the dashboard KPI / TrendChart / NetworkBreakdown / cohort queries. The "wrong values" complaint is a separate investigation that needs more data from the user before any patch.
- Do NOT add a new BQ table or view. The fix should use existing tables and existing access.
- Do NOT change the tone-dot threshold (<12 / <24 / >=24 hours). The thresholds are correct; only the input value is wrong.

## File touchpoints

```
src/lib/bq-queries.ts                          // _queryFreshness SQL + timestamp parsing
src/app/api/cache/refresh/route.ts             // add revalidateTag("bq:freshness")
src/types/dashboard.ts                         // verify FreshnessData shape still fits (likely no change)
tests/unit/lib/freshness.test.ts (or similar)  // new — pin the new SQL shape and the timestamp parsing
```

Maybe also `src/lib/globalcomix-queries.ts` if Branch A's fix uses a helper exported from there to read `spendSources`. Acceptable to add a small `getSpendTableIds(client): string[]` helper in `globalcomix-queries.ts` (or wherever `getMultiSourceConfig` lives) and call it from `_queryFreshness`. Don't inline the table list inside `bq-queries.ts` — that drifts.

## Tests

- Unit test for the new `_queryFreshness` SQL: mock the BQ client to return a known timestamp, assert `hoursAgo` is correct given a frozen `Date.now()`. Use `vi.useFakeTimers()` + `vi.setSystemTime(...)` per the existing patterns in `tests/unit/`.
- Unit test for the parse-failure path: mock BQ to return null / malformed → assert `hoursAgo === -1` and `lastUpdated` is current ISO time.
- Unit test for the cache invalidation: hit `/api/cache/refresh`, assert `revalidateTag` was called with `"bq:freshness"`. The Next.js cache mocking pattern is in the existing `globalcomix-queries.test.ts` file.
- E2E: load `/dashboard`, take a screenshot of the freshness bar tone-dot, click Sync Now, take a second screenshot, assert the label text changed (or at minimum, the timestamp updated). If the existing E2E spec doesn't have a hook for the freshness label, add a `data-testid="data-freshness-label"` assertion and use it.

## Acceptance

Manual:

1. Load `/dashboard` against a real BQ environment. The freshness bar should show a `hoursAgo` value that matches the actual elapsed time since the most recent spend-table write (per Q4 above). At time of writing this prompt, Rivery's twice-daily cadence means this should always be under ~12 hours during normal operation.
2. Click Sync Now. The freshness bar updates immediately (no 10-minute lag) and shows the new value.
3. If a spend table is actually stale (Branch B scenario), the bar correctly shows yellow / coral and the elapsed-time math reads true.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes. Test count delta reported in PR description.
3. `npm run build` is clean.
4. E2E specs run green.

## Commit shape

Suggested commits in order:

1. `Investigation: capture Q1-Q5 results in vault Technical doc and PR description`
2. `Fix: queryFreshness reads __TABLES__.last_modified_time across spend sources` (or whichever branch matches)
3. `Fix: Sync Now revalidates bq:freshness tag so the bar updates immediately`
4. `Tests: pin new freshness SQL shape + cache invalidation behavior`

PR title: `Fix freshness signal: use real timestamps, invalidate freshness cache on Sync Now`

PR description should include:
- The full Q1-Q5 result sets, in fenced code blocks. This is the receipt that the fix is grounded in real data.
- Which branch (A / B / C / D) the fix landed on, and why.
- A before / after screenshot of the freshness bar.
- Note on the concurrent cache-invalidation fix.

## Follow-up not part of this PR

- **The "wrong KPI values" complaint.** Needs a specific metric, date range, OS/platform, and a side-by-side compare with Looker. Once the user provides that, a separate investigation PR.
- **Vault doc on Rivery activity view semantics.** After Q1 + Q2 + Q3 results land, write a one-page note in `Lumen Vault/Technical/` documenting what `v_rivery_activity_check.date` actually means, so the next person doesn't have to rediscover it. This is documentation, not code; can be a separate small commit on the same branch or deferred to a vault-only update.
- **A real Rivery sync webhook (Phase 2).** The codebase already has a stub for the eventual Rivery → Lumen webhook that fires `invalidateClientCache` on real sync events. Out of scope here, but flag it: once that webhook is live, the freshness bar can update in seconds rather than minutes after a sync.
