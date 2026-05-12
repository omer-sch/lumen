# Playw3 Agent View — Data Review

Generated: 2026-05-11T10:26:32.852Z
Source: `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`

## Executive summary

- **Verdict: NO — not safe for production headline KPIs today.** Spend is trustworthy after applying the breakdown filter, but Installs / CPI cannot be sourced from this view and ROAS is mostly zero.
- Coverage: 78,578 rows spanning 2025-06-10 → 2026-03-24. 195 missing date(s) inside the span — investigate.
- Networks: 2 present — Facebook (590419.8834), Twitter (7418.0466).
- Quality: revenue null 1.4%, installs zero 0.0%, roas null 22.8%.
- **CRITICAL — fan-out detected:** 1 (date,network) combination(s) on the latest date contain >1 breakdown_type. Simple SUM(spend_usd) will double-count. See section 8.

## 1. Full schema inspection

_Confirm the actual column names and types of v_playw3_agent. The schema in code may be out of date._

```sql
SELECT column_name, data_type, is_nullable
FROM `yellowhead-visionbi-rivery`.yellowhead_prod.INFORMATION_SCHEMA.COLUMNS
WHERE table_name = 'v_playw3_agent'
ORDER BY ordinal_position
```

Ran in 1240ms. Returned 43 row(s).

| column_name | data_type | is_nullable |
| --- | --- | --- |
| date | DATE | YES |
| week_start | DATE | YES |
| week_label | STRING | YES |
| week_number | INT64 | YES |
| network | STRING | YES |
| breakdown_type | STRING | YES |
| breakdown_value | STRING | YES |
| campaign_id | STRING | YES |
| campaign_name | STRING | YES |
| campaign_status | STRING | YES |
| btb_campaign_name | STRING | YES |
| ad_group_id | STRING | YES |
| adset_name | STRING | YES |
| adset_status | STRING | YES |
| ad_id | STRING | YES |
| creative_id | STRING | YES |
| creative_name | STRING | YES |
| creative_text | STRING | YES |
| creative_image_url | STRING | YES |
| creative_thumbnail_url | STRING | YES |
| spend_usd | FLOAT64 | YES |
| spend_original_currency | FLOAT64 | YES |
| spend_currency | STRING | YES |
| impressions | INT64 | YES |
| clicks | INT64 | YES |
| url_clicks | INT64 | YES |
| ctr | FLOAT64 | YES |
| cpm | FLOAT64 | YES |
| purchases | INT64 | YES |
| mobile_purchases | INT64 | YES |
| leads | INT64 | YES |
| ftd_lifetime | INT64 | YES |
| installs | INT64 | YES |
| btb_conversions | INT64 | YES |
| retention_d3 | INT64 | YES |
| retention_d7 | INT64 | YES |
| cpi | FLOAT64 | YES |
| cost_per_ftd | FLOAT64 | YES |
| cpl | FLOAT64 | YES |
| revenue_original_currency | FLOAT64 | YES |
| revenue_usd | FLOAT64 | YES |
| roas | FLOAT64 | YES |
| rate_eur_to_usd | FLOAT64 | YES |

## 2. Date range and row count

_Understand total volume and whether there are gaps in the date series._

```sql
SELECT
  COUNT(*) AS total_rows,
  MIN(date) AS earliest_date,
  MAX(date) AS latest_date,
  DATE_DIFF(MAX(date), MIN(date), DAY) + 1 AS date_span_days,
  COUNT(DISTINCT date) AS distinct_dates,
  DATE_DIFF(MAX(date), MIN(date), DAY) + 1 - COUNT(DISTINCT date) AS missing_date_count
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
```

Ran in 1124ms. Returned 1 row(s).

| total_rows | earliest_date | latest_date | date_span_days | distinct_dates | missing_date_count |
| --- | --- | --- | --- | --- | --- |
| 78,578 | 2025-06-10 | 2026-03-24 | 288 | 93 | 195 |

## 3. Network breakdown

_See which networks are present, their coverage dates, and relative spend weight._

```sql
SELECT
  network,
  COUNT(*) AS row_count,
  MIN(date) AS earliest,
  MAX(date) AS latest,
  SUM(spend_usd) AS total_spend,
  SUM(installs) AS total_installs
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
GROUP BY network
ORDER BY total_spend DESC
```

Ran in 764ms. Returned 2 row(s).

| network | row_count | earliest | latest | total_spend | total_installs |
| --- | --- | --- | --- | --- | --- |
| Facebook | 77,472 | 2026-01-12 | 2026-03-24 | 590419.8834 | _null_ |
| Twitter | 1,106 | 2025-06-10 | 2025-07-01 | 7418.0466 | _null_ |

## 4. Key metric null and zero rates

_Surface data quality issues. High null rates on revenue/ROAS are common because attribution data backfills over days — this is expected but must be documented. (Note: v_playw3_agent exposes a single `roas` column — no D0/D7/D30 split.)_

```sql
SELECT
  COUNTIF(spend_usd IS NULL)   AS spend_null,
  COUNTIF(spend_usd = 0)       AS spend_zero,
  COUNTIF(installs IS NULL)    AS installs_null,
  COUNTIF(installs = 0)        AS installs_zero,
  COUNTIF(revenue_usd IS NULL) AS revenue_null,
  COUNTIF(revenue_usd = 0)     AS revenue_zero,
  COUNTIF(roas IS NULL)        AS roas_null,
  COUNTIF(roas = 0)            AS roas_zero,
  COUNTIF(cpi IS NULL)         AS cpi_null,
  COUNTIF(cpi = 0)             AS cpi_zero,
  COUNTIF(impressions IS NULL) AS impressions_null,
  COUNTIF(clicks IS NULL)      AS clicks_null,
  COUNT(*)                     AS total_rows
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
```

Ran in 1442ms. Returned 1 row(s).

| spend_null | spend_zero | installs_null | installs_zero | revenue_null | revenue_zero | roas_null | roas_zero | cpi_null | cpi_zero | impressions_null | clicks_null | total_rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 27 | 16,793 | 78,578 | 0 | 1,106 | 75,266 | 17,926 | 58,842 | 78,578 | 0 | 8,004 | 27 | 78,578 |

## 5. Breakdown distribution (breakdown_type × breakdown_value)

_v_playw3_agent has no `os` column — `os` is one of the breakdown_values inside the `breakdown_type` dimension. This query enumerates how the view fans out spend across dimensions. Summing across all breakdowns double-counts spend; pick one canonical breakdown_type for any roll-up._

```sql
SELECT
  breakdown_type,
  breakdown_value,
  COUNT(*) AS row_count,
  SUM(spend_usd) AS spend,
  SUM(installs) AS installs
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
GROUP BY breakdown_type, breakdown_value
ORDER BY spend DESC
LIMIT 50
```

Ran in 742ms. Returned 50 row(s).

| breakdown_type | breakdown_value | row_count | spend | installs |
| --- | --- | --- | --- | --- |
| No Breakdown | No Breakdown | 4,256 | 200515.6511 | _null_ |
| Placement | facebook | 3,196 | 122285.5759 | _null_ |
| Country | US | 1,295 | 70365.4815 | _null_ |
| Placement | instagram | 2,360 | 52140.5447 | _null_ |
| Placement | audience_network | 2,291 | 22073.936 | _null_ |
| Country | PH | 192 | 10716.6582 | _null_ |
| Country | AU | 362 | 6875.7705 | _null_ |
| Country | NG | 461 | 6169.5922 | _null_ |
| Country | BR | 500 | 5887.8823 | _null_ |
| Country | DE | 491 | 5373.8878 | _null_ |
| Country | CA | 372 | 4326.3124 | _null_ |
| Country | MX | 700 | 4310.036 | _null_ |
| Country | IN | 160 | 3832.3156 | _null_ |
| Country | ZA | 501 | 3819.6655 | _null_ |
| Country | United States | 551 | 3709.0146 | _null_ |
| Country | EG | 301 | 2849.0347 | _null_ |
| Country | UZ | 340 | 2808.307 | _null_ |
| Country | SE | 373 | 2615.3858 | _null_ |
| Country | IL | 498 | 2384.7686 | _null_ |
| Country | IT | 389 | 2255.1374 | _null_ |
| Country | TH | 482 | 2243.0591 | _null_ |
| Country | ID | 145 | 2100.9535 | _null_ |
| Country | TN | 505 | 1987.9448 | _null_ |
| Country | DZ | 446 | 1842.4844 | _null_ |
| Country | TR | 503 | 1821.2564 | _null_ |
| Country | SY | 337 | 1770.407 | _null_ |
| Country | MA | 515 | 1760.9459 | _null_ |
| Country | FR | 472 | 1578.7314 | _null_ |
| Country | VN | 481 | 1526.1549 | _null_ |
| Country | MY | 458 | 1485.3384 | _null_ |
| Country | PT | 480 | 1416.8308 | _null_ |
| Country | GB | 231 | 1391.851 | _null_ |
| Country | PL | 543 | 1356.5135 | _null_ |
| Country | RO | 431 | 1137.4364 | _null_ |
| Country | KR | 425 | 1068.2558 | _null_ |
| Country | NZ | 338 | 997.5853 | _null_ |
| Country | AR | 502 | 971.368 | _null_ |
| Country | KZ | 498 | 963.9217 | _null_ |
| Country | CO | 487 | 961.562 | _null_ |
| Country | UA | 515 | 939.3553 | _null_ |
| Country | NP | 280 | 865.723 | _null_ |
| Country | GE | 150 | 839.8672 | _null_ |
| Country | JO | 444 | 797.121 | _null_ |
| Country | HN | 413 | 743.3519 | _null_ |
| Country | LB | 440 | 717.3812 | _null_ |
| Country | AZ | 506 | 694.335 | _null_ |
| Country | LK | 481 | 678.046 | _null_ |
| Country | AE | 460 | 676.2858 | _null_ |
| Country | MW | 286 | 656.9478 | _null_ |
| Country | NL | 393 | 642.7826 | _null_ |

## 6. Campaign and ad-group counts

_Scope of the account — how many campaigns, ad-groups, and ads exist per network. (v_playw3_agent uses `ad_group_id`/`ad_id`; there is no `adset_id` column.)_

```sql
SELECT
  network,
  COUNT(DISTINCT campaign_id) AS campaigns,
  COUNT(DISTINCT ad_group_id) AS ad_groups,
  COUNT(DISTINCT ad_id)       AS ads,
  MIN(date)                   AS earliest,
  MAX(date)                   AS latest
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
GROUP BY network
ORDER BY campaigns DESC
```

Ran in 941ms. Returned 2 row(s).

| network | campaigns | ad_groups | ads | earliest | latest |
| --- | --- | --- | --- | --- | --- |
| Facebook | 46 | 68 | 276 | 2026-01-12 | 2026-03-24 |
| Twitter | 4 | 4 | 60 | 2025-06-10 | 2025-07-01 |

## 7. Monthly spend trend

_See the spend trajectory over time per network. Reveals if the account is growing, shrinking, or has gaps in specific months._

```sql
SELECT
  FORMAT_DATE('%Y-%m', date) AS month,
  network,
  SUM(spend_usd) AS spend,
  SUM(installs)  AS installs,
  SAFE_DIVIDE(SUM(spend_usd), NULLIF(SUM(installs), 0)) AS cpi
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
GROUP BY 1, 2
ORDER BY 1 ASC, spend DESC
```

Ran in 818ms. Returned 5 row(s).

| month | network | spend | installs | cpi |
| --- | --- | --- | --- | --- |
| 2025-06 | Twitter | 7154.8515 | _null_ | _null_ |
| 2025-07 | Twitter | 263.195 | _null_ | _null_ |
| 2026-01 | Facebook | 239568.9323 | _null_ | _null_ |
| 2026-02 | Facebook | 350850.9512 | _null_ | _null_ |
| 2026-03 | Facebook | 0 | _null_ | _null_ |

## 8. Double-count check (breakdown aggregation)

_On the most recent date, check whether the same spend appears in multiple breakdown rows. If breakdown_types_present > 1 and spend_with_breakdowns is much higher than expected, the view is fanning out spend across breakdown dimensions and simple SUM will double-count. This is the most critical quality check._

```sql
SELECT
  date,
  network,
  SUM(spend_usd) AS spend_with_breakdowns,
  COUNT(DISTINCT breakdown_type) AS breakdown_types_present
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
WHERE date = (SELECT MAX(date) FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`)
GROUP BY date, network
ORDER BY network
```

Ran in 817ms. Returned 1 row(s).

| date | network | spend_with_breakdowns | breakdown_types_present |
| --- | --- | --- | --- |
| 2026-03-24 | Facebook | 0 | 3 |

## 9. Dedupe verification — naive vs filtered totals (last 30 days)

_Side-by-side check: naive SUM(spend_usd) across all breakdown_types vs SUM filtered to breakdown_type = 'No Breakdown'. If the dedupe filter is correct, the filtered total should be a clean ~1/N of the naive total (where N is the number of breakdown_types). This is the proof that bq-queries.ts's WHERE breakdown_type = 'No Breakdown' predicate produces the right answer._

```sql
WITH window_dates AS (
  SELECT
    DATE_SUB((SELECT MAX(date) FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`), INTERVAL 30 DAY) AS lo,
    (SELECT MAX(date) FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`) AS hi
)
SELECT
  'naive (all breakdown_types)' AS variant,
  SUM(spend_usd) AS spend_30d,
  SUM(installs)  AS installs_30d,
  COUNT(*)       AS row_count
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`, window_dates
WHERE date BETWEEN window_dates.lo AND window_dates.hi
UNION ALL
SELECT
  'filtered (breakdown_type = \'No Breakdown\')' AS variant,
  SUM(spend_usd) AS spend_30d,
  SUM(installs)  AS installs_30d,
  COUNT(*)       AS row_count
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`, window_dates
WHERE date BETWEEN window_dates.lo AND window_dates.hi
  AND breakdown_type = 'No Breakdown'
```

Ran in 637ms. Returned 2 row(s).

| variant | spend_30d | installs_30d | row_count |
| --- | --- | --- | --- |
| naive (all breakdown_types) | 45216.5971 | _null_ | 5,714 |
| filtered (breakdown_type = 'No Breakdown') | 15072.199 | _null_ | 857 |

## 10. Recent 30-day KPI summary

_Get a real headline number. This is what the Lumen dashboard will show — confirm it looks plausible. (Uses the single `roas` column the view exposes; no D0/D7/D30 split.)_

```sql
SELECT
  network,
  SUM(spend_usd) AS spend_30d,
  SUM(installs)  AS installs_30d,
  SAFE_DIVIDE(SUM(spend_usd), NULLIF(SUM(installs), 0)) AS cpi_30d,
  SAFE_DIVIDE(SUM(revenue_usd), NULLIF(SUM(spend_usd), 0)) AS roas_30d_recomputed,
  AVG(roas) AS avg_roas
FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
WHERE date >= DATE_SUB(
  (SELECT MAX(date) FROM `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`),
  INTERVAL 30 DAY
)
GROUP BY network
ORDER BY spend_30d DESC
```

Ran in 798ms. Returned 1 row(s).

| network | spend_30d | installs_30d | cpi_30d | roas_30d_recomputed | avg_roas |
| --- | --- | --- | --- | --- | --- |
| Facebook | 45216.5971 | _null_ | _null_ | 0.0374 | 0.0405 |

## Schema notes

All columns required by `src/lib/bq-queries.ts` (`spend_usd`, `revenue_usd`, `installs`, `date`, `network`, `campaign_id`, `campaign_name`) are present.
**Absent (task prompt assumed they existed, they do not):** adset_id, os, cpc, roas_d0, roas_d7, roas_d14, roas_d30, roas_d90. The view exposes a single `roas` column rather than a D0/D7/D14/D30/D90 split, uses `ad_group_id`/`ad_id` instead of `adset_id`, and has no `os` column (OS is one breakdown_value inside `breakdown_type`).

## Issues log

1. **CRITICAL** — `installs` is NULL in 100.0% of v_playw3_agent rows (78,578 of 78,578). The Lumen Installs KPI and CPI (= spend / installs) will be 0 / NULL for Playw3. Either source the install count from a different column / view, or stop showing Installs and CPI in the UI for this client.
2. **CRITICAL** — `cpi` is NULL in 100% of v_playw3_agent rows. Recomputing from spend/installs also fails because installs is NULL. The CPI tile cannot be populated from this view.
3. **CRITICAL** — Fan-out on latest date: Facebook (3 breakdown_types). Lumen's bq-queries.ts must filter to a single breakdown row per (date, campaign, adset) before SUM.
4. **WARNING** — Date series has 195 missing day(s) between 2025-06-10 and 2026-03-24.
5. **INFO** — revenue_usd zero rate: 95.8% of rows (75,266 of 78,578).
6. **INFO** — View contains multiple breakdown_type values: No Breakdown, Placement, Country. Verify section 5 to choose the correct filter.

## Recommended actions

- **DO NOT ship Installs / CPI tiles for Playw3 until the install count is sourced.** `v_playw3_agent.installs` is NULL in 100% of rows. Either ask BI for the right column / join the AppsFlyer install signal in, or hide those two KPI tiles for this client.
- **Fan-out fix applied** in `src/lib/bq-security.ts` via `dedupePredicate: "breakdown_type = 'No Breakdown'"` for the Playw3 schema, threaded through every aggregation in `src/lib/bq-queries.ts`. Verified: naive 30-day spend ($45216.60) reduces to filtered ($15072.20) — a 3.00× collapse consistent with the 3 breakdown_types present in the view.
- **Revenue is zero in >90% of rows.** ROAS will read ~0 across the board. Confirm whether Twitter has any revenue mapping, and whether Facebook conversions are wired into the right column.
- **Ask BI to investigate missing date(s)** in the v_playw3_agent series (195 of 288 days have no rows). Full-day gaps create misleading deltas in 7d/30d windows.
- **Update the Playw3 coverage UI label.** Twitter rows end at 2025-07-01; current 30/90-day windows show Facebook-only data. Either drop "Twitter" from the coverage footnote or qualify it with "Twitter (historical, through 2025-07-01)".
