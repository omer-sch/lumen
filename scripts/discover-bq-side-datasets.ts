/**
 * discover-bq-side-datasets.ts
 *
 * Bucket 2: side datasets. For each: full schema, row count, latest
 * modification, small sample, and a verdict.
 *
 *   - rivery_activity_anlytics   focus on the watermark / freshness signal
 *   - yh_singular                what does Singular track, why isn't it wired in
 *   - pw_yh_cohort_aggregated_stats_google   2.6M rows, 1.4 GB, sample with TABLESAMPLE
 *   - seo_screamingfrog          single SEO crawl dump
 *   - receipts_users             Analytics Hub unlinked subscription (confirmed via bq show)
 *   - yellowhead_temp            confirm empty or document content
 *
 * Read-only. Output: tmp/bq-discovery/10-side-datasets.json
 */

import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "bq-discovery");
const OUT_FILE = path.join(OUT_DIR, "10-side-datasets.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

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

function flat(r: Row): Row {
  const o: Row = {};
  for (const k of Object.keys(r)) {
    const val = v(r[k]);
    o[k] = typeof val === "object" && val !== null ? JSON.stringify(val) : val;
  }
  return o;
}

function shell(cmd: string): { stdout: string; stderr: string; ok: boolean } {
  try {
    const stdout = cp.execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { stdout, stderr: "", ok: true };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      stdout: typeof err.stdout === "string" ? err.stdout : err.stdout?.toString("utf-8") ?? "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf-8") ?? "",
      ok: false,
    };
  }
}

async function listTables(bq: BigQuery, ds: string): Promise<Row[]> {
  // INFORMATION_SCHEMA.TABLES + __TABLES__ for size info.
  return q(
    bq,
    `
      SELECT
        t.table_name, t.table_type, t.creation_time, t.ddl,
        ts.row_count, ts.size_bytes, ts.last_modified_time
      FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.TABLES\` t
      LEFT JOIN \`${PROJECT}.${ds}.__TABLES__\` ts ON ts.table_id = t.table_name
      ORDER BY t.table_name
    `,
  );
}

async function getCols(bq: BigQuery, ds: string, table: string): Promise<Row[]> {
  return q(
    bq,
    `
      SELECT column_name, data_type, is_nullable, is_partitioning_column, clustering_ordinal_position
      FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = '${table.replace(/'/g, "")}'
      ORDER BY ordinal_position
    `,
  );
}

async function sampleRows(
  bq: BigQuery,
  ds: string,
  table: string,
  rowCount: number,
  n = 5,
): Promise<{ rows: Row[]; method: string }> {
  // For tables above 100M rows use TABLESAMPLE SYSTEM (1 PERCENT).
  // For everything else, plain LIMIT.
  if (rowCount > 100_000_000) {
    try {
      const rows = await q(
        bq,
        `SELECT * FROM \`${PROJECT}.${ds}.${table}\` TABLESAMPLE SYSTEM (1 PERCENT) LIMIT ${n}`,
      );
      return { rows: rows.map(flat), method: "tablesample-1pct" };
    } catch {
      // fall through to limit
    }
  }
  const rows = await q(bq, `SELECT * FROM \`${PROJECT}.${ds}.${table}\` LIMIT ${n}`);
  return { rows: rows.map(flat), method: "limit" };
}

type TableProbe = {
  table_name: string;
  table_type: string;
  row_count: number | null;
  size_bytes: number | null;
  creation_time: string | null;
  last_modified_time: string | null;
  ddl: string | null;
  columns: Row[];
  sample: Row[];
  sample_method: string;
  date_span?: { earliest: string | null; latest: string | null; date_col: string } | null;
  notes?: string;
};

async function probeDataset(
  bq: BigQuery,
  ds: string,
  opts: { sampleSize?: number; dateColPriority?: string[] } = {},
): Promise<{ tables: TableProbe[]; access?: unknown; description?: string | null; type?: string | null; error?: string }> {
  const sampleSize = opts.sampleSize ?? 5;
  const priority = opts.dateColPriority ?? ["date", "day", "event_date", "report_date", "data_date", "ds"];

  // bq show for type/description.
  const meta = shell(`bq show --format=prettyjson ${PROJECT}:${ds}`);
  let metaParsed: { access?: unknown; description?: string; type?: string } | null = null;
  try {
    metaParsed = meta.ok ? JSON.parse(meta.stdout) : null;
  } catch {
    metaParsed = null;
  }

  let tables: Row[];
  try {
    tables = await listTables(bq, ds);
  } catch (e) {
    return {
      tables: [],
      access: metaParsed?.access ?? null,
      description: metaParsed?.description ?? null,
      type: metaParsed?.type ?? null,
      error: (e as Error).message,
    };
  }

  const out: TableProbe[] = [];
  for (const t of tables) {
    const table_name = String(t.table_name);
    const table_type = String(t.table_type);
    const row_count = t.row_count != null ? Number(t.row_count) : null;
    const size_bytes = t.size_bytes != null ? Number(t.size_bytes) : null;
    const creation_time = t.creation_time ? String(v(t.creation_time)) : null;
    const last_modified_time = t.last_modified_time != null
      ? new Date(Number(t.last_modified_time)).toISOString()
      : null;

    const columns = await getCols(bq, ds, table_name);
    const colNames = columns.map((c) => String(c.column_name));
    const colNamesLower = new Set(colNames.map((s) => s.toLowerCase()));

    // Pick a date col
    let dateCol: string | null = null;
    for (const p of priority) {
      const match = colNames.find((c) => c.toLowerCase() === p.toLowerCase());
      if (match) { dateCol = match; break; }
    }
    if (!dateCol) {
      const c = columns.find((x) => /^(DATE|TIMESTAMP|DATETIME)$/i.test(String(x.data_type)));
      if (c) dateCol = String(c.column_name);
    }

    let date_span: TableProbe["date_span"] = null;
    if (dateCol && /^[A-Za-z_][A-Za-z0-9_]*$/.test(dateCol) && (row_count ?? 0) > 0 && table_type === "BASE TABLE") {
      try {
        const rows = await q(
          bq,
          `SELECT MIN(\`${dateCol}\`) AS earliest, MAX(\`${dateCol}\`) AS latest FROM \`${PROJECT}.${ds}.${table_name}\``,
        );
        date_span = {
          earliest: rows[0]?.earliest ? String(v(rows[0].earliest)) : null,
          latest: rows[0]?.latest ? String(v(rows[0].latest)) : null,
          date_col: dateCol,
        };
      } catch (e) {
        date_span = { earliest: null, latest: null, date_col: `${dateCol} (error: ${(e as Error).message.split("\n")[0]})` };
      }
    }

    let sample: { rows: Row[]; method: string } = { rows: [], method: "skipped" };
    if ((row_count ?? 0) > 0 && (table_type === "BASE TABLE" || table_type === "VIEW")) {
      try {
        sample = await sampleRows(bq, ds, table_name, row_count ?? 0, sampleSize);
      } catch (e) {
        sample = { rows: [{ __error: (e as Error).message.split("\n")[0] }], method: "error" };
      }
    }

    // Heuristic notes
    const notes: string[] = [];
    if (colNamesLower.has("date") || colNamesLower.has("event_date")) notes.push("has date column");
    if (colNamesLower.has("master_account") || colNamesLower.has("client")) notes.push("has client column");
    if (colNamesLower.has("campaign_id")) notes.push("has campaign_id");
    if (table_type === "VIEW") notes.push("VIEW (check ddl for source tables)");
    if ((row_count ?? 0) === 0) notes.push("empty");

    out.push({
      table_name,
      table_type,
      row_count,
      size_bytes,
      creation_time,
      last_modified_time,
      ddl: t.ddl ? String(t.ddl) : null,
      columns: columns.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable,
        partition: c.is_partitioning_column,
        cluster_pos: c.clustering_ordinal_position,
      })),
      sample: sample.rows,
      sample_method: sample.method,
      date_span,
      notes: notes.join("; "),
    });
  }

  return {
    tables: out,
    access: metaParsed?.access ?? null,
    description: metaParsed?.description ?? null,
    type: metaParsed?.type ?? null,
  };
}

async function run() {
  const bq = buildBq();
  const out: Record<string, unknown> = {
    captured_at: new Date().toISOString(),
    notes: {
      receipts_users:
        "Analytics Hub linked-dataset subscription. Source listing: cooppocketworlds_x_metica_personalization_191fb8a38ad.receipts_191fb8c7981 in project 459308824437. The source publisher has unlinked the listing; subscription is stale. Not relevant to Lumen.",
    },
  };

  console.log("\n--- rivery_activity_anlytics ---");
  out.rivery_activity_anlytics = await probeDataset(bq, "rivery_activity_anlytics", { sampleSize: 8 });

  console.log("\n--- yh_singular ---");
  out.yh_singular = await probeDataset(bq, "yh_singular", { sampleSize: 5 });

  console.log("\n--- pw_yh_cohort_aggregated_stats_google ---");
  out.pw_yh_cohort_aggregated_stats_google = await probeDataset(
    bq,
    "pw_yh_cohort_aggregated_stats_google",
    { sampleSize: 5 },
  );

  console.log("\n--- seo_screamingfrog ---");
  out.seo_screamingfrog = await probeDataset(bq, "seo_screamingfrog", { sampleSize: 5 });

  console.log("\n--- yellowhead_temp ---");
  out.yellowhead_temp = await probeDataset(bq, "yellowhead_temp", { sampleSize: 5 });

  // receipts_users: bq show only, no INFORMATION_SCHEMA (the linked source is gone).
  console.log("\n--- receipts_users (bq show only) ---");
  const r = shell(`bq show --format=prettyjson ${PROJECT}:receipts_users`);
  try {
    out.receipts_users = r.ok ? JSON.parse(r.stdout) : { __error: r.stderr };
  } catch {
    out.receipts_users = { __raw: r.stdout, __stderr: r.stderr };
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(`\nWrote ${OUT_FILE}`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
