/**
 * discover-bq-md-variants.ts
 *
 * Bucket 3h: row count + latest date for every management_dashboard_* table
 * variant. Phase 1 claimed the 86 per-client variants are duplicates or
 * empty; this script verifies that and finds any client present in a
 * variant but absent from the six cross-client tables.
 *
 * Output: tmp/bq-discovery/18-md-variants.json
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = "yellowhead_prod";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "bq-discovery");

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

async function q(bq: BigQuery, sql: string): Promise<Row[]> {
  const [rows] = await bq.query({ query: sql, location: "US" });
  return rows as Row[];
}

const CROSS_CLIENT = new Set([
  "management_dashboard_fb2",
  "management_dashboard_apple",
  "management_dashboard_google",
  "management_dashboard_tiktok",
  "management_dashboard_linkedin",
  "management_dashboard_fb_ios14",
]);

async function run() {
  const bq = buildBq();
  console.log("Probing management_dashboard_* variants…");

  // List all md tables.
  const all = (await q(
    bq,
    `
      SELECT t.table_name, ts.row_count, ts.size_bytes, ts.last_modified_time
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\` t
      LEFT JOIN \`${PROJECT}.${DATASET}.__TABLES__\` ts ON ts.table_id = t.table_name
      WHERE STARTS_WITH(t.table_name, 'management_dashboard_')
      ORDER BY t.table_name
    `,
  )).map((r) => ({
    table_name: String(r.table_name),
    row_count: r.row_count != null ? Number(r.row_count) : null,
    size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    last_modified: r.last_modified_time != null ? new Date(Number(r.last_modified_time)).toISOString() : null,
  }));
  console.log(`  total md tables: ${all.length} (cross-client: ${CROSS_CLIENT.size}; variants: ${all.length - CROSS_CLIENT.size})`);

  // First, get the set of master_account values in the cross-client tables (the canonical client list).
  console.log("  cross-client master_account roster…");
  const crossRoster = await q(
    bq,
    `
      WITH base AS (
        SELECT master_account FROM \`${PROJECT}.${DATASET}.management_dashboard_fb2\`
        UNION ALL SELECT master_account FROM \`${PROJECT}.${DATASET}.management_dashboard_apple\`
        UNION ALL SELECT master_account FROM \`${PROJECT}.${DATASET}.management_dashboard_google\`
        UNION ALL SELECT master_account FROM \`${PROJECT}.${DATASET}.management_dashboard_tiktok\`
        UNION ALL SELECT master_account FROM \`${PROJECT}.${DATASET}.management_dashboard_linkedin\`
        UNION ALL SELECT master_account FROM \`${PROJECT}.${DATASET}.management_dashboard_fb_ios14\`
      )
      SELECT DISTINCT LOWER(TRIM(master_account)) AS client_key
      FROM base WHERE master_account IS NOT NULL
    `,
  );
  const crossKeys = new Set(crossRoster.map((r) => String(r.client_key)));
  console.log(`  cross-client clients: ${crossKeys.size}`);

  // For each variant, probe rows, dates, and the distinct master_account.
  // Schema is mostly the same 15 cols but per-client variants sometimes
  // have 17 (extra os, currency). master_account column always present.
  console.log("  probing each variant (one query each, capped to first 7d)…");
  const variants = all.filter((t) => !CROSS_CLIENT.has(t.table_name));
  const results: Array<{
    table: string;
    row_count: number | null;
    size_bytes: number | null;
    last_modified: string | null;
    rows_actual: number | null;
    earliest: string | null;
    latest: string | null;
    distinct_master_accounts: string[];
    error: string | null;
  }> = [];

  // Run in serial to keep slot consumption sane; each query is tiny.
  for (let i = 0; i < variants.length; i++) {
    const t = variants[i];
    try {
      const r = await q(
        bq,
        `
          SELECT
            COUNT(*) AS row_count,
            MIN(date) AS earliest,
            MAX(date) AS latest,
            ARRAY_AGG(DISTINCT LOWER(TRIM(master_account)) IGNORE NULLS) AS clients
          FROM \`${PROJECT}.${DATASET}.${t.table_name}\`
        `,
      );
      const row = r[0] ?? {};
      results.push({
        table: t.table_name,
        row_count: t.row_count,
        size_bytes: t.size_bytes,
        last_modified: t.last_modified,
        rows_actual: row.row_count != null ? Number(row.row_count) : null,
        earliest: row.earliest ? String(v(row.earliest)) : null,
        latest: row.latest ? String(v(row.latest)) : null,
        distinct_master_accounts: (row.clients as unknown[] | undefined)?.map((x) => String(v(x))) ?? [],
        error: null,
      });
    } catch (e) {
      results.push({
        table: t.table_name,
        row_count: t.row_count,
        size_bytes: t.size_bytes,
        last_modified: t.last_modified,
        rows_actual: null,
        earliest: null,
        latest: null,
        distinct_master_accounts: [],
        error: (e as Error).message.split("\n")[0],
      });
    }
    if ((i + 1) % 10 === 0) console.log(`    progress: ${i + 1}/${variants.length}`);
  }

  // Classify each variant.
  const classified = results.map((r) => {
    const clients = r.distinct_master_accounts.filter(Boolean);
    const newClients = clients.filter((c) => !crossKeys.has(c));
    let verdict: string;
    if (r.error) verdict = `error: ${r.error}`;
    else if ((r.rows_actual ?? 0) === 0) verdict = "empty";
    else if (newClients.length > 0) verdict = `unique-client (${newClients.join(", ")})`;
    else verdict = "duplicate-of-cross-client";
    return { ...r, verdict, new_clients: newClients };
  });

  // Summary
  const summary = {
    total_variants: variants.length,
    empty: classified.filter((c) => c.verdict === "empty").length,
    duplicate: classified.filter((c) => c.verdict === "duplicate-of-cross-client").length,
    unique_client: classified.filter((c) => c.verdict.startsWith("unique-client")).length,
    error: classified.filter((c) => c.verdict.startsWith("error")).length,
    unique_clients_found: Array.from(
      new Set(classified.flatMap((c) => c.new_clients)),
    ).sort(),
  };

  const out = {
    captured_at: new Date().toISOString(),
    cross_client_tables: Array.from(CROSS_CLIENT),
    cross_client_master_account_count: crossKeys.size,
    summary,
    variants: classified,
  };

  fs.writeFileSync(path.join(OUT_DIR, "18-md-variants.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(`\nWrote tmp/bq-discovery/18-md-variants.json`);
  console.log("Summary:", JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
