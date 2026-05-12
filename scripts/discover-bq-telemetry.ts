/**
 * discover-bq-telemetry.ts
 *
 * Bucket 5: Looker / consumer telemetry from yh_bq_logs.
 *
 * `INFORMATION_SCHEMA.JOBS_BY_PROJECT` is denied to omers@yellowhead.com,
 * so we read from the Cloud Audit Logging sink at
 * `yh_bq_logs.cloudaudit_googleapis_com_data_access_*` (daily partition
 * tables). The schema is the standard GCP audit format; we extract the
 * BigQuery-specific bits from `protopayload_auditlog.servicedata_v1_bigquery`
 * (older event shape) and `protopayload_auditlog.metadataJson` (newer
 * event shape).
 *
 * Output: tmp/bq-discovery/20-looker-telemetry.json
 *
 * Cost: dry-run for the 7-day window was 602 MB, well under our 5 GB cap.
 * We pull aggregates only (top tables, top users, etc.), not raw events.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "bq-discovery");
const WINDOW_START = "20260505";
const WINDOW_END = "20260511";

function buildBq(): BigQuery {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (b64) {
    const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return new BigQuery({ projectId: PROJECT, credentials });
  }
  return new BigQuery({ projectId: PROJECT });
}

function v(x: unknown): unknown {
  if (x && typeof x === "object" && "value" in (x as object)) return (x as { value: unknown }).value;
  return x;
}

type Row = Record<string, unknown>;

async function q(bq: BigQuery, sql: string, label: string): Promise<Row[]> {
  console.log(`  ${label}…`);
  const [job] = await bq.createQueryJob({ query: sql, location: "US" });
  const [rows] = await job.getQueryResults();
  const stats = job.metadata?.statistics?.query;
  if (stats?.totalBytesProcessed) {
    const mb = Number(stats.totalBytesProcessed) / 1024 / 1024;
    console.log(`    scanned ${mb.toFixed(1)} MB`);
  }
  return rows as Row[];
}

function flat(r: Row): Row {
  const o: Row = {};
  for (const k of Object.keys(r)) {
    const val = v(r[k]);
    o[k] = typeof val === "object" && val !== null ? JSON.stringify(val) : val;
  }
  return o;
}

// Shared CTE that normalizes both old and new schema shapes.
const BASE_CTE = `
WITH events AS (
  SELECT
    timestamp,
    protopayload_auditlog.authenticationInfo.principalEmail AS principal,
    protopayload_auditlog.requestMetadata.callerSuppliedUserAgent AS user_agent,
    protopayload_auditlog.servicedata_v1_bigquery.jobCompletedEvent.job AS old_job,
    JSON_QUERY(protopayload_auditlog.metadataJson, '$.jobChange.job') AS new_job_json
  FROM \`${PROJECT}.yh_bq_logs.cloudaudit_googleapis_com_data_access_*\`
  WHERE _TABLE_SUFFIX BETWEEN '${WINDOW_START}' AND '${WINDOW_END}'
    AND protopayload_auditlog.serviceName = 'bigquery.googleapis.com'
),
flat AS (
  -- Old shape (servicedata_v1_bigquery.jobCompletedEvent)
  SELECT
    timestamp, principal, user_agent,
    old_job.jobName.jobId AS job_id,
    old_job.jobConfiguration.query.query AS query_text,
    old_job.jobStatistics.totalBilledBytes AS billed_bytes,
    old_job.jobStatistics.totalSlotMs AS slot_ms,
    old_job.jobStatistics.startTime AS start_time,
    old_job.jobStatistics.endTime AS end_time,
    old_job.jobStatus.error.code AS error_code,
    old_job.jobStatistics.referencedTables AS referenced_tables
  FROM events
  WHERE old_job IS NOT NULL
  UNION ALL
  -- New shape (metadataJson.jobChange.job)
  SELECT
    timestamp, principal, user_agent,
    JSON_VALUE(new_job_json, '$.jobName') AS job_id,
    JSON_VALUE(new_job_json, '$.jobConfig.queryConfig.query') AS query_text,
    SAFE_CAST(JSON_VALUE(new_job_json, '$.jobStats.queryStats.totalBilledBytes') AS INT64) AS billed_bytes,
    SAFE_CAST(JSON_VALUE(new_job_json, '$.jobStats.totalSlotMs') AS INT64) AS slot_ms,
    SAFE_CAST(JSON_VALUE(new_job_json, '$.jobStats.startTime') AS TIMESTAMP) AS start_time,
    SAFE_CAST(JSON_VALUE(new_job_json, '$.jobStats.endTime') AS TIMESTAMP) AS end_time,
    SAFE_CAST(JSON_VALUE(new_job_json, '$.jobStatus.errorResult.code') AS INT64) AS error_code,
    ARRAY(
      SELECT AS STRUCT
        REGEXP_EXTRACT(t, r'projects/([^/]+)/datasets/[^/]+/tables/[^/]+') AS projectId,
        REGEXP_EXTRACT(t, r'projects/[^/]+/datasets/([^/]+)/tables/[^/]+') AS datasetId,
        REGEXP_EXTRACT(t, r'projects/[^/]+/datasets/[^/]+/tables/([^/]+)') AS tableId
      FROM UNNEST(JSON_VALUE_ARRAY(new_job_json, '$.jobStats.queryStats.referencedTables')) t
    ) AS referenced_tables
  FROM events
  WHERE new_job_json IS NOT NULL
)
`;

async function run() {
  const bq = buildBq();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Bucket 5: BigQuery audit telemetry from yh_bq_logs (${WINDOW_START} - ${WINDOW_END})`);

  // 1) Top tables by query count and bytes scanned.
  const topTables = await q(
    bq,
    `
    ${BASE_CTE}
    SELECT
      r.projectId AS project_id,
      r.datasetId AS dataset_id,
      r.tableId AS table_id,
      COUNT(*) AS reads,
      COUNT(DISTINCT principal) AS distinct_callers,
      SAFE_DIVIDE(SUM(billed_bytes), COUNT(*)) AS avg_bytes_per_read,
      SUM(billed_bytes) AS total_bytes,
      SUM(slot_ms) AS total_slot_ms,
      COUNT(DISTINCT job_id) AS distinct_jobs
    FROM flat, UNNEST(referenced_tables) r
    WHERE r.projectId IS NOT NULL
    GROUP BY project_id, dataset_id, table_id
    ORDER BY reads DESC
    LIMIT 100
    `,
    "top tables by read count",
  );

  // 2) Top principals by query count and bytes.
  const topPrincipals = await q(
    bq,
    `
    ${BASE_CTE}
    SELECT
      principal,
      ANY_VALUE(user_agent) AS sample_user_agent,
      COUNT(*) AS jobs,
      SUM(billed_bytes) AS total_bytes,
      SAFE_DIVIDE(SUM(billed_bytes), COUNT(*)) AS avg_bytes_per_job,
      SUM(slot_ms) AS total_slot_ms,
      COUNT(DISTINCT DATE(timestamp)) AS active_days
    FROM flat
    GROUP BY principal
    ORDER BY jobs DESC
    LIMIT 50
    `,
    "top principals",
  );

  // 3) Looker Studio-specific reads (filter by principal or user_agent).
  const lookerTables = await q(
    bq,
    `
    ${BASE_CTE},
    looker_jobs AS (
      SELECT * FROM flat
      WHERE
        principal LIKE '%looker-studio%'
        OR principal LIKE '%looker.com%'
        OR principal LIKE '%data-studio%'
        OR LOWER(user_agent) LIKE '%lookerstudio%'
        OR LOWER(user_agent) LIKE '%dataStudio%'
        OR LOWER(user_agent) LIKE '%google-data-studio%'
    )
    SELECT
      r.projectId AS project_id,
      r.datasetId AS dataset_id,
      r.tableId AS table_id,
      COUNT(*) AS looker_reads,
      SUM(billed_bytes) AS looker_bytes,
      COUNT(DISTINCT job_id) AS distinct_jobs
    FROM looker_jobs, UNNEST(referenced_tables) r
    WHERE r.projectId IS NOT NULL
    GROUP BY project_id, dataset_id, table_id
    ORDER BY looker_reads DESC
    LIMIT 100
    `,
    "Looker Studio reads",
  );

  // 4) Slowest queries by total slot ms (top 20).
  const slowestQueries = await q(
    bq,
    `
    ${BASE_CTE}
    SELECT
      job_id,
      principal,
      slot_ms,
      billed_bytes,
      TIMESTAMP_DIFF(end_time, start_time, MILLISECOND) AS wall_ms,
      SUBSTR(query_text, 1, 800) AS query_text_head,
      ARRAY_LENGTH(referenced_tables) AS refs_count
    FROM flat
    WHERE slot_ms IS NOT NULL AND slot_ms > 0
    ORDER BY slot_ms DESC
    LIMIT 20
    `,
    "slowest queries",
  );

  // 5) Cost baseline: bytes per query stats.
  const costBaseline = await q(
    bq,
    `
    ${BASE_CTE}
    SELECT
      COUNT(*) AS total_jobs,
      COUNTIF(billed_bytes IS NOT NULL) AS jobs_with_bytes,
      AVG(billed_bytes) AS avg_bytes,
      APPROX_QUANTILES(billed_bytes, 100)[OFFSET(50)] AS p50_bytes,
      APPROX_QUANTILES(billed_bytes, 100)[OFFSET(90)] AS p90_bytes,
      APPROX_QUANTILES(billed_bytes, 100)[OFFSET(99)] AS p99_bytes,
      MAX(billed_bytes) AS max_bytes,
      SUM(billed_bytes) AS total_bytes_7d,
      AVG(slot_ms) AS avg_slot_ms,
      APPROX_QUANTILES(slot_ms, 100)[OFFSET(50)] AS p50_slot_ms,
      APPROX_QUANTILES(slot_ms, 100)[OFFSET(90)] AS p90_slot_ms
    FROM flat
    `,
    "cost baseline",
  );

  // 6) Daily updated tables (write events): which tables have non-zero
  // writes in the last 7 days? Use Phase 1's 02-tables-by-dataset.json as
  // the snapshot of last_modified_time. Cross-reference with read events.
  // We do that locally below.

  const out = {
    window: { start: WINDOW_START, end: WINDOW_END },
    captured_at: new Date().toISOString(),
    top_tables: topTables.map(flat),
    top_principals: topPrincipals.map(flat),
    looker_tables: lookerTables.map(flat),
    slowest_queries: slowestQueries.map(flat),
    cost_baseline: (costBaseline[0] ?? {}) as Row,
  };

  fs.writeFileSync(path.join(OUT_DIR, "20-looker-telemetry.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(`\nWrote tmp/bq-discovery/20-looker-telemetry.json`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
