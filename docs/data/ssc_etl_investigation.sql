-- Smart Sleep Coach ETL investigation
-- Goal: figure out who/what populates SSC's dwh_* tables, so we know whether
-- to consume them as-is or rebuild the transformation ourselves.
-- Run in order. Step 2 depends on Step 1's output. Step 3 depends on Step 2's.

-- ---------------------------------------------------------------------------
-- STEP 1: Find SSC's tables in yellowhead_prod
-- ---------------------------------------------------------------------------
-- Expected output: handful of rows including ods_* raw landings and dwh_*
-- cleaned versions. Note exact table names for Step 2.

SELECT table_name, table_type
FROM `yellowhead-visionbi-rivery.yellowhead_prod.INFORMATION_SCHEMA.TABLES`
WHERE LOWER(table_name) LIKE '%sleep%'
   OR table_name LIKE '%_ssc%'
   OR table_name LIKE '%ssc_%'
ORDER BY table_name;


-- ---------------------------------------------------------------------------
-- STEP 2: Who writes to each SSC dwh_* table, how often, what statement type
-- ---------------------------------------------------------------------------
-- Expected output: one row per (dwh table, writer identity, statement_type)
-- combination over the last 14 days. Reveals whether writes are dominated by
-- Rivery's service account, developer@yellowhead.pro, or something else.

SELECT
  destination_table.table_id   AS dest_table,
  user_email,
  statement_type,
  COUNT(*)                     AS writes,
  MIN(creation_time)           AS first_write,
  MAX(creation_time)           AS last_write,
  ROUND(AVG(total_bytes_processed) / POW(10,9), 2) AS avg_gb_processed
FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
  AND destination_table.project_id = 'yellowhead-visionbi-rivery'
  AND destination_table.dataset_id = 'yellowhead_prod'
  AND (LOWER(destination_table.table_id) LIKE '%sleep%'
       OR destination_table.table_id LIKE '%_ssc%'
       OR destination_table.table_id LIKE '%ssc_%')
  AND statement_type IS NOT NULL
GROUP BY dest_table, user_email, statement_type
ORDER BY dest_table, writes DESC;


-- ---------------------------------------------------------------------------
-- STEP 3: Pull full SQL of writes to one specific dwh table
-- ---------------------------------------------------------------------------
-- Replace PASTE_TABLE_NAME_HERE with a table from Step 2.
-- The `query` column holds the actual transformation SQL we want to read.

SELECT
  creation_time,
  user_email,
  statement_type,
  total_bytes_processed,
  query
FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
  AND destination_table.project_id = 'yellowhead-visionbi-rivery'
  AND destination_table.dataset_id = 'yellowhead_prod'
  AND destination_table.table_id   = 'PASTE_TABLE_NAME_HERE'
  AND statement_type IN ('INSERT','MERGE','CREATE_TABLE_AS_SELECT','UPDATE','SCRIPT')
ORDER BY creation_time DESC
LIMIT 5;


-- ---------------------------------------------------------------------------
-- BONUS: If Step 1 returns nothing, widen the SSC search
-- ---------------------------------------------------------------------------
-- Some clients are named with very different abbreviations in the warehouse
-- vs in the sales roster. If `%sleep%` and `%ssc%` find nothing, fall back to
-- looking for the master_account name itself.

SELECT DISTINCT table_name
FROM `yellowhead-visionbi-rivery.yellowhead_prod.INFORMATION_SCHEMA.COLUMN_FIELD_PATHS`
WHERE column_name = 'master_account'
  AND table_name LIKE 'dwh_%'
LIMIT 20;
-- Then for each dwh table found, query for SSC's master_account value:
-- SELECT DISTINCT master_account FROM `...dwh_xxx` WHERE LOWER(master_account) LIKE '%sleep%' LIMIT 5;
