# Freshness Signal Investigation (2026-05-19)

Tags: #technical #bigquery #freshness #investigation
Related: [[BQ Investigation - GlobalComix Data Coverage (2026-05-17)]]

## TL;DR

Lumen's freshness bar read "synced ~30 hours ago" while the warehouse was actually current. The cause: `_queryFreshness` (`src/lib/bq-queries.ts`) was reading `MAX(date)` from `rivery_activity_anlytics.v_rivery_activity_check`, a DATE column, then anchoring at midnight UTC of that date. The view lagged a day and the midnight anchor added up to 24h of slack on top.

Fixed by switching to `__TABLES__.last_modified_time` across the active client's per-network spend tables. That's BigQuery's own "this table was just written" timestamp, in millis since epoch, no calendar coarseness. The cache-invalidation gap (Sync Now didn't clear the 10-min Next-cache hold on freshness) is fixed in the same PR.

## What `v_rivery_activity_check.date` actually means

`rivery_activity_anlytics.v_rivery_activity_check` (note the upstream typo in the dataset name) exposes one row per `(date, river_name, target_name)` with two FLOAT64 cost-tracking columns (`total_rpu`, `rpu_per_date`). It has no timestamp column. The `date` column is DATE-typed and tracks the activity window the river touched, not the moment of the most recent run.

Cadence in practice (observed 2026-05-19 at 07:10 UTC):
- View's `MAX(date)` = `2026-05-18` (yesterday). So calling `MAX(date)` at 07:10 UTC on 2026-05-19 anchors at `2026-05-18T00:00:00Z` and yields `hoursAgo = 31`.
- The actual GlobalComix spend tables (`dwh_*_globalcomix_adjust`) were written at `2026-05-19 07:03:xx UTC`. `hours_since_write = 0`.

The view is fine as a "did Rivery run anything in this calendar window" rollup. It is wrong as a "when did Lumen's data last refresh" signal. The two questions are not the same.

## Investigation results (2026-05-19)

### Q1 — Last 10 dates in the activity view
```
| date       | row_count |
| 2026-05-18 |      1720 |
| 2026-05-17 |      1724 |
| 2026-05-16 |      1720 |
| 2026-05-15 |      1720 |
| 2026-05-14 |      1720 |
| 2026-05-13 |      1797 |
| 2026-05-12 |      1750 |
| 2026-05-11 |      1720 |
| 2026-05-10 |      1710 |
| 2026-05-09 |      1720 |
```

### Q2 — Columns on `v_rivery_activity_check`
```
| date         | DATE    |
| river_name   | STRING  |
| total_rpu    | FLOAT64 |
| target_name  | STRING  |
| rpu_per_date | FLOAT64 |
```
No TIMESTAMP / DATETIME column. Branch C (read a real timestamp on the view) is unreachable from this view as-shipped.

### Q3 — What the current freshness query returns
```
| last_updated |
|   2026-05-18 |
```

### Q4 — `__TABLES__.last_modified_time` on the spend tables
```
| table_id                          | table_last_written_utc | hours_since_write |
| dwh_fb2_globalcomix_adjust        |    2026-05-19 07:03:45 |                 0 |
| dwh_google_ads_globalcomix_adjust |    2026-05-19 07:03:44 |                 0 |
| dwh_tik_tok_globalcomix_adjust    |    2026-05-19 07:03:41 |                 0 |
| dwh_apple_globalcomix_adjust      |    2026-05-19 07:03:41 |                 0 |
| dwh_applovin_globalcomix_adjust   |    2026-05-19 07:03:39 |                 0 |
```

### Q5 — Latest data date in each spend table
```
| dwh_fb2_globalcomix_adjust        |  2026-05-19 |
| dwh_google_ads_globalcomix_adjust |  2026-05-19 |
| dwh_tik_tok_globalcomix_adjust    |  2026-05-19 |
| dwh_apple_globalcomix_adjust      |  2026-05-19 |
| dwh_applovin_globalcomix_adjust   |  2026-05-19 |
```

## Decision

Branch A from the investigation tree. Freshness query now reads:

```sql
SELECT MAX(TIMESTAMP_MILLIS(last_modified_time)) AS last_updated
FROM `{PROJECT}.{DATASET}.__TABLES__`
WHERE table_id IN (<client's spend table ids>)
```

The TS layer parses the returned ISO timestamp directly and computes `hoursAgo` as `(now - ts) / 3_600_000`. No calendar anchoring.

Client table list comes from a new helper `getFreshnessTableIds(client)` in `bq-security.ts`. For multi-source clients (today: only GlobalComix), the helper returns `multiSource.spendSources.map(s => s.table)`. For other strategies and the no-client case, the helper falls back to GlobalComix's spend tables because every client lands on the same Rivery cadence and GlobalComix is the only dashboard-live client today.

## Concurrent fix: Sync Now and the freshness cache

`queryFreshness` is wrapped in `unstable_cache({ revalidate: 600, tags: ['bq', 'bq:freshness'] })`. The Sync Now button (`POST /api/cache/refresh`) used to invalidate Redis and re-warm it but did not call `revalidateTag("bq:freshness")`, so the next `/api/bq/freshness` fetch would still hit the Next cache and serve the pre-sync value for up to ten minutes. Now fixed by adding the tag invalidation after `invalidateClientCache` in the refresh route.

Note: the client hook `useFreshness` does not auto-refetch on Sync Now success today — it only fetches on `client` change. So even after this fix, the freshness BAR in the UI does not visibly update until the user navigates or reloads. That's a UX gap, not a backend gap. Tracked as a follow-up.

## Out of scope (deferred)

- A real Rivery → Lumen webhook firing `invalidateClientCache` on sync events. Codebase already has a stub. Phase 2.
- Client-side refetch trigger for `useFreshness` on Sync Now success (the UX gap above). Small change, separate PR.
- The "wrong KPI values" complaint surfaced alongside the freshness bug. Needs a specific metric + date range + side-by-side compare with Looker before a query is touched.
