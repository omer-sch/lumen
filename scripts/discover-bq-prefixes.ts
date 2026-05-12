/**
 * discover-bq-prefixes.ts
 *
 * Bucket 3 (parts a-g): inside yellowhead_prod, the prefix layers we did
 * not characterize in Phase 1. Writes one JSON per prefix:
 *
 *   11-ods.json           ods_* raw landing (one freshest sample per platform)
 *   12-dwh.json           dwh_* fact tables (expanded beyond globalcomix)
 *   13-uni.json           uni_* unified cross-platform tables
 *   14-pre.json           pre_* and pre_v_* views/staging
 *   15-dim-map-bs.json    dim_* / map_* / bs_* small support tables + column-name client-master hunt
 *   16-external.json      EXTERNAL tables (via bq show for external_data_configuration)
 *   17-legacy-views.json  dwh_v_* legacy SQL views (DDL dump for institutional knowledge)
 *
 * Read-only. Heavy use of INFORMATION_SCHEMA aggregations.
 */

import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = "yellowhead_prod";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "bq-discovery");

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

function dump(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2), "utf-8");
  console.log(`  wrote ${name}`);
}

function shell(cmd: string): { stdout: string; stderr: string; ok: boolean } {
  try {
    return { stdout: cp.execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "", ok: true };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      stdout: typeof err.stdout === "string" ? err.stdout : err.stdout?.toString("utf-8") ?? "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf-8") ?? "",
      ok: false,
    };
  }
}

// Platform tokens (taken from Phase 1's classifier). Used for ods_* / dwh_*.
const PLATFORM_TOKENS: Record<string, string> = {
  fb2: "Meta", fb: "Meta", facebook: "Meta", meta: "Meta",
  tiktok: "TikTok", tik_tok: "TikTok",
  adwords: "Google", google_ads: "Google",
  appsflyer: "AppsFlyer", adjust: "Adjust", apple: "Apple", asa: "Apple",
  twitter: "Twitter", snapchat: "Snapchat", snap: "Snapchat",
  kochava: "Kochava", singular: "Singular", apptweak: "AppTweak",
  reddit: "Reddit", linkedin: "LinkedIn", pinterest: "Pinterest",
  yahoo: "Yahoo", bing: "Bing", unity: "Unity",
  applovin: "AppLovin", ironsource: "ironSource", mintegral: "Mintegral",
  search_console: "GoogleSearchConsole", apple_console: "AppleConsole",
  itunes: "Apple", mntn: "MNTN",
};

function detectPlatform(name: string): string | null {
  const n = name.toLowerCase();
  // 2-word tokens first
  for (const k of Object.keys(PLATFORM_TOKENS).filter((t) => t.includes("_"))) {
    if (n.includes("_" + k + "_") || n.endsWith("_" + k) || n.startsWith(k + "_")) return PLATFORM_TOKENS[k];
  }
  for (const k of Object.keys(PLATFORM_TOKENS).filter((t) => !t.includes("_"))) {
    if (n.split("_").includes(k)) return PLATFORM_TOKENS[k];
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Shared: pull all live (mod ≤30d) tables in yellowhead_prod, grouped
// ───────────────────────────────────────────────────────────────────────
type TableMeta = {
  table_name: string;
  table_type: string;
  row_count: number | null;
  size_bytes: number | null;
  last_modified: string | null;
  ddl: string | null;
};

async function liveTables(bq: BigQuery): Promise<TableMeta[]> {
  const rows = await q(
    bq,
    `
      SELECT
        t.table_name, t.table_type, t.ddl,
        ts.row_count, ts.size_bytes, ts.last_modified_time
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\` t
      LEFT JOIN \`${PROJECT}.${DATASET}.__TABLES__\` ts ON ts.table_id = t.table_name
      WHERE
        TIMESTAMP_MILLIS(ts.last_modified_time) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        OR t.table_type IN ('VIEW', 'EXTERNAL')
    `,
  );
  return rows.map((r) => ({
    table_name: String(r.table_name),
    table_type: String(r.table_type),
    row_count: r.row_count != null ? Number(r.row_count) : null,
    size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    last_modified: r.last_modified_time != null ? new Date(Number(r.last_modified_time)).toISOString() : null,
    ddl: r.ddl ? String(r.ddl) : null,
  }));
}

// Bulk schema fetch across many tables in one query.
async function bulkColumns(
  bq: BigQuery,
  tableNames: string[],
): Promise<Record<string, Array<{ name: string; type: string }>>> {
  if (tableNames.length === 0) return {};
  const list = tableNames.map((t) => `'${t.replace(/'/g, "")}'`).join(",");
  const rows = await q(
    bq,
    `
      SELECT table_name, column_name, data_type, ordinal_position
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name IN (${list})
      ORDER BY table_name, ordinal_position
    `,
  );
  const out: Record<string, Array<{ name: string; type: string }>> = {};
  for (const r of rows) {
    const t = String(r.table_name);
    out[t] ??= [];
    out[t].push({ name: String(r.column_name), type: String(r.data_type) });
  }
  return out;
}

async function sampleN(bq: BigQuery, table: string, n = 3, rowHint = 0): Promise<{ rows: Row[]; method: string }> {
  try {
    if (rowHint > 100_000_000) {
      const r = await q(bq, `SELECT * FROM \`${PROJECT}.${DATASET}.${table}\` TABLESAMPLE SYSTEM (1 PERCENT) LIMIT ${n}`);
      return { rows: r.map(flat), method: "tablesample-1pct" };
    }
    const r = await q(bq, `SELECT * FROM \`${PROJECT}.${DATASET}.${table}\` LIMIT ${n}`);
    return { rows: r.map(flat), method: "limit" };
  } catch (e) {
    return { rows: [{ __error: (e as Error).message.split("\n")[0] }], method: "error" };
  }
}

// ───────────────────────────────────────────────────────────────────────
// 11-ods.json  — pick the freshest ods_* per platform
// ───────────────────────────────────────────────────────────────────────
async function doOds(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 11-ods (raw landing per platform) ===");
  const ods = all.filter((t) => t.table_name.startsWith("ods_") && t.table_type === "BASE TABLE");
  console.log(`  ods_* tables (live): ${ods.length}`);

  // Bucket by detected platform, keep freshest per platform.
  const byPlatform: Record<string, TableMeta[]> = {};
  for (const t of ods) {
    const p = detectPlatform(t.table_name) ?? "UNCLASSIFIED";
    (byPlatform[p] ??= []).push(t);
  }

  // For each platform, freshest table (by last_modified).
  const picks: TableMeta[] = [];
  for (const p of Object.keys(byPlatform)) {
    const sorted = byPlatform[p].sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""));
    if (sorted[0]) picks.push(sorted[0]);
  }

  // Bulk schema
  const cols = await bulkColumns(bq, picks.map((t) => t.table_name));

  // Samples
  const samples: Record<string, { rows: Row[]; method: string }> = {};
  for (const t of picks) {
    samples[t.table_name] = await sampleN(bq, t.table_name, 3, t.row_count ?? 0);
  }

  const out = {
    captured_at: new Date().toISOString(),
    summary: {
      total_live: ods.length,
      by_platform: Object.fromEntries(
        Object.entries(byPlatform).map(([p, ts]) => [p, { count: ts.length, sample_names: ts.slice(0, 5).map((t) => t.table_name) }]),
      ),
    },
    freshest_per_platform: picks.map((t) => ({
      platform: detectPlatform(t.table_name) ?? "UNCLASSIFIED",
      table: t.table_name,
      row_count: t.row_count,
      size_bytes: t.size_bytes,
      last_modified: t.last_modified,
      columns: cols[t.table_name] ?? [],
      sample: samples[t.table_name]?.rows ?? [],
      sample_method: samples[t.table_name]?.method ?? null,
    })),
  };
  dump("11-ods.json", out);
}

// ───────────────────────────────────────────────────────────────────────
// 12-dwh.json — expanded coverage beyond globalcomix
// ───────────────────────────────────────────────────────────────────────
async function doDwh(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 12-dwh ===");
  const dwh = all.filter((t) => t.table_name.startsWith("dwh_") && t.table_type === "BASE TABLE");
  console.log(`  dwh_* tables (live): ${dwh.length}`);

  const byPlatform: Record<string, TableMeta[]> = {};
  for (const t of dwh) {
    const p = detectPlatform(t.table_name) ?? "UNCLASSIFIED";
    (byPlatform[p] ??= []).push(t);
  }

  // Active clients from Phase 1's clients-rollup. Hard-code top spenders.
  const activeClientSlugs = ["stardust_casino", "keno", "video_poker", "ultimate_x_poker", "smart_sleep_coach", "globalcomix", "playw3", "100play"];
  function pickForPlatform(ts: TableMeta[]): TableMeta[] {
    // Prefer tables whose name contains an active client slug, then largest.
    const matches = ts.filter((t) => activeClientSlugs.some((c) => t.table_name.includes(c)));
    const others = ts.filter((t) => !matches.includes(t));
    return [
      ...matches.sort((a, b) => (b.row_count ?? 0) - (a.row_count ?? 0)).slice(0, 2),
      ...others.sort((a, b) => (b.row_count ?? 0) - (a.row_count ?? 0)).slice(0, 2),
    ];
  }

  const picks: TableMeta[] = [];
  for (const p of Object.keys(byPlatform)) {
    picks.push(...pickForPlatform(byPlatform[p]));
  }
  // Also pick the cross-client mega-tables flagged in 06-date-spans.json
  for (const mega of ["dwh_fb2", "dwh_fb2_all", "dwh_tik_tok", "dwh_apple", "dwh_google", "dwh_appsflyer"]) {
    const hit = all.find((t) => t.table_name === mega && t.table_type === "BASE TABLE");
    if (hit && !picks.includes(hit)) picks.push(hit);
  }
  const cols = await bulkColumns(bq, picks.map((t) => t.table_name));
  const samples: Record<string, { rows: Row[]; method: string }> = {};
  const dateSpans: Record<string, { earliest: string | null; latest: string | null }> = {};
  for (const t of picks) {
    samples[t.table_name] = await sampleN(bq, t.table_name, 3, t.row_count ?? 0);
    // Date span
    const dateCol = cols[t.table_name]?.find((c) => c.name.toLowerCase() === "date")?.name
      ?? cols[t.table_name]?.find((c) => /^(DATE|TIMESTAMP|DATETIME)$/.test(c.type))?.name;
    if (dateCol && /^[A-Za-z_][A-Za-z0-9_]*$/.test(dateCol)) {
      try {
        const r = await q(
          bq,
          `SELECT MIN(\`${dateCol}\`) AS earliest, MAX(\`${dateCol}\`) AS latest FROM \`${PROJECT}.${DATASET}.${t.table_name}\``,
        );
        dateSpans[t.table_name] = {
          earliest: r[0]?.earliest ? String(v(r[0].earliest)) : null,
          latest: r[0]?.latest ? String(v(r[0].latest)) : null,
        };
      } catch {
        dateSpans[t.table_name] = { earliest: null, latest: null };
      }
    }
  }

  const out = {
    captured_at: new Date().toISOString(),
    summary: {
      total_live: dwh.length,
      by_platform: Object.fromEntries(
        Object.entries(byPlatform).map(([p, ts]) => [p, { count: ts.length, largest: ts.slice(0).sort((a,b)=>(b.row_count??0)-(a.row_count??0)).slice(0,5).map((t) => ({ name: t.table_name, rows: t.row_count })) }]),
      ),
    },
    picks: picks.map((t) => ({
      platform: detectPlatform(t.table_name) ?? "UNCLASSIFIED",
      table: t.table_name,
      row_count: t.row_count,
      size_bytes: t.size_bytes,
      last_modified: t.last_modified,
      date_span: dateSpans[t.table_name] ?? null,
      col_count: (cols[t.table_name] ?? []).length,
      columns_sample: (cols[t.table_name] ?? []).slice(0, 25),
      has_master_account: (cols[t.table_name] ?? []).some((c) => c.name.toLowerCase() === "master_account"),
      has_client: (cols[t.table_name] ?? []).some((c) => c.name.toLowerCase() === "client"),
      has_campaign_id: (cols[t.table_name] ?? []).some((c) => c.name.toLowerCase() === "campaign_id"),
      sample: samples[t.table_name]?.rows ?? [],
    })),
  };
  dump("12-dwh.json", out);
}

// ───────────────────────────────────────────────────────────────────────
// 13-uni.json — verify "no client column" claim
// ───────────────────────────────────────────────────────────────────────
async function doUni(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 13-uni ===");
  const uni = all.filter((t) => t.table_name.startsWith("uni_"));
  console.log(`  uni_* tables (live): ${uni.length}`);

  // Bulk-check for client columns across ALL uni_* tables.
  const rows = await q(
    bq,
    `
      SELECT table_name,
        COUNTIF(LOWER(column_name) IN ('master_account','master_account_id','client','client_id','customer','customer_id','account_id','advertiser_id')) AS has_client_col,
        STRING_AGG(IF(LOWER(column_name) IN ('master_account','master_account_id','client','client_id','customer','customer_id','account_id','advertiser_id'), column_name, NULL)) AS client_cols
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE STARTS_WITH(table_name, 'uni_')
      GROUP BY table_name
    `,
  );
  const clientColsByTable: Record<string, { has: number; cols: string | null }> = {};
  for (const r of rows) {
    clientColsByTable[String(r.table_name)] = { has: Number(r.has_client_col ?? 0), cols: r.client_cols ? String(r.client_cols) : null };
  }

  // Sample the 5 largest uni tables for schema.
  const top = uni.sort((a, b) => (b.row_count ?? 0) - (a.row_count ?? 0)).slice(0, 5);
  const cols = await bulkColumns(bq, top.map((t) => t.table_name));

  const out = {
    captured_at: new Date().toISOString(),
    summary: {
      total_live: uni.length,
      with_any_client_column: Object.values(clientColsByTable).filter((c) => c.has > 0).length,
      without_any_client_column: Object.values(clientColsByTable).filter((c) => c.has === 0).length,
    },
    client_col_coverage: clientColsByTable,
    largest_five: top.map((t) => ({
      table: t.table_name,
      row_count: t.row_count,
      size_bytes: t.size_bytes,
      last_modified: t.last_modified,
      col_count: (cols[t.table_name] ?? []).length,
      columns: (cols[t.table_name] ?? []).slice(0, 50),
    })),
  };
  dump("13-uni.json", out);
}

// ───────────────────────────────────────────────────────────────────────
// 14-pre.json — pre_* and pre_v_* (mix of tables and views)
// ───────────────────────────────────────────────────────────────────────
async function doPre(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 14-pre ===");
  const pre = all.filter((t) => t.table_name.startsWith("pre_"));
  console.log(`  pre_* objects (live or VIEW): ${pre.length}`);

  // Categorize by view vs table.
  const views = pre.filter((t) => t.table_type === "VIEW");
  const tables = pre.filter((t) => t.table_type !== "VIEW");

  // Dump view DDLs (the DDL we already pulled in liveTables).
  const viewDdls = views.map((t) => ({
    name: t.table_name,
    type: t.table_type,
    last_modified: t.last_modified,
    ddl: t.ddl,
  }));

  // For tables, summary of column shape.
  const cols = await bulkColumns(bq, tables.slice(0, 20).map((t) => t.table_name));

  const out = {
    captured_at: new Date().toISOString(),
    summary: {
      total: pre.length,
      views: views.length,
      tables: tables.length,
    },
    view_ddls: viewDdls,
    sample_tables: tables.slice(0, 20).map((t) => ({
      table: t.table_name,
      row_count: t.row_count,
      size_bytes: t.size_bytes,
      last_modified: t.last_modified,
      col_count: (cols[t.table_name] ?? []).length,
      columns_sample: (cols[t.table_name] ?? []).slice(0, 20),
    })),
  };
  dump("14-pre.json", out);
}

// ───────────────────────────────────────────────────────────────────────
// 15-dim-map-bs.json — small support tables + global client-master hunt
// ───────────────────────────────────────────────────────────────────────
async function doDimMapBs(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 15-dim/map/bs ===");
  const candidates = all.filter((t) => /^(dim_|map_|bs_)/.test(t.table_name));
  console.log(`  dim_/map_/bs_ objects (live): ${candidates.length}`);

  const cols = await bulkColumns(bq, candidates.map((t) => t.table_name));
  const samples: Record<string, { rows: Row[]; method: string }> = {};
  for (const t of candidates.slice(0, 30)) {
    samples[t.table_name] = await sampleN(bq, t.table_name, 5, t.row_count ?? 0);
  }

  // Global client-master hunt across ALL columns in yellowhead_prod.
  console.log("  hunting for any client-master table by column name…");
  const hunt = await q(
    bq,
    `
      SELECT
        table_name, column_name, data_type
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE LOWER(column_name) IN (
        'master_account_id', 'master_account_name',
        'client_id', 'client_name',
        'advertiser_id', 'advertiser_name',
        'customer_id', 'customer_name'
      )
      ORDER BY table_name, column_name
    `,
  );
  // Group by table_name for compactness.
  const huntByTable: Record<string, Array<{ column: string; type: string }>> = {};
  for (const r of hunt) {
    const t = String(r.table_name);
    huntByTable[t] ??= [];
    huntByTable[t].push({ column: String(r.column_name), type: String(r.data_type) });
  }
  // Filter: tables that *only* contain client/master columns and are small (<=20 rows or so) — these are likely dim tables.
  const liveByName = new Map(all.map((t) => [t.table_name, t]));
  const enrichedHunt: Array<{ table: string; cols: Array<{ column: string; type: string }>; row_count: number | null; live: boolean }> = [];
  for (const [name, cs] of Object.entries(huntByTable)) {
    const meta = liveByName.get(name);
    enrichedHunt.push({ table: name, cols: cs, row_count: meta?.row_count ?? null, live: !!meta });
  }
  enrichedHunt.sort((a, b) => (a.row_count ?? Infinity) - (b.row_count ?? Infinity));

  const out = {
    captured_at: new Date().toISOString(),
    summary: { dim_map_bs_count: candidates.length, client_master_candidate_count: enrichedHunt.length },
    dim_map_bs: candidates.map((t) => ({
      table: t.table_name,
      table_type: t.table_type,
      row_count: t.row_count,
      size_bytes: t.size_bytes,
      last_modified: t.last_modified,
      columns: cols[t.table_name] ?? [],
      sample: samples[t.table_name]?.rows ?? [],
    })),
    client_master_hunt: enrichedHunt,
  };
  dump("15-dim-map-bs.json", out);
}

// ───────────────────────────────────────────────────────────────────────
// 16-external.json — EXTERNAL tables via bq show
// ───────────────────────────────────────────────────────────────────────
async function doExternal(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 16-external ===");
  const ext = all.filter((t) => t.table_type === "EXTERNAL");
  console.log(`  EXTERNAL tables: ${ext.length}`);

  const externalDetails: Record<string, unknown> = {};
  for (const t of ext) {
    const r = shell(`bq show --format=prettyjson ${PROJECT}:${DATASET}.${t.table_name}`);
    if (!r.ok) {
      externalDetails[t.table_name] = { __error: r.stderr.split("\n")[0] };
      continue;
    }
    try {
      const parsed = JSON.parse(r.stdout);
      externalDetails[t.table_name] = {
        externalDataConfiguration: parsed.externalDataConfiguration ?? null,
        creationTime: parsed.creationTime ?? null,
        lastModifiedTime: parsed.lastModifiedTime ?? null,
        location: parsed.location ?? null,
        schema_field_count: parsed.schema?.fields?.length ?? null,
        description: parsed.description ?? null,
      };
    } catch (e) {
      externalDetails[t.table_name] = { __parse_error: (e as Error).message };
    }
  }

  const out = {
    captured_at: new Date().toISOString(),
    count: ext.length,
    tables: ext.map((t) => t.table_name),
    details: externalDetails,
  };
  dump("16-external.json", out);
}

// ───────────────────────────────────────────────────────────────────────
// 17-legacy-views.json — dwh_v_* legacy SQL views, dump DDL
// ───────────────────────────────────────────────────────────────────────
async function doLegacyViews(bq: BigQuery, all: TableMeta[]) {
  console.log("\n=== 17-legacy-views ===");
  // Legacy views are likely VIEW type with `view_definition`. The Phase 1
  // unusable ones included dwh_v_*, fact_v_*, facebook_v_*. Pull all views
  // whose DDL we already have, classify by prefix.
  const allViews = all.filter((t) => t.table_type === "VIEW");
  // Pull view_definitions too (more reliable than DDL string).
  const rows = await q(
    bq,
    `
      SELECT table_name, view_definition
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.VIEWS\`
    `,
  );
  const defs = new Map(rows.map((r) => [String(r.table_name), r.view_definition ? String(r.view_definition) : null]));
  console.log(`  total views with definitions: ${defs.size}`);

  const isLegacy = (name: string) =>
    /^(dwh_v_|fact_v_|.+_v_)/.test(name) || /_(v|view)_(a|adwords|fb|fb2|f|facebook|appsflyer|adjust|tt|tiktok)_/.test(name);

  const legacy = allViews.filter((v) => isLegacy(v.table_name));
  const nonLegacyViews = allViews.filter((v) => !isLegacy(v.table_name));
  console.log(`  legacy-looking views: ${legacy.length} (of ${allViews.length})`);

  const out = {
    captured_at: new Date().toISOString(),
    summary: { total_views: allViews.length, classified_legacy: legacy.length, classified_modern: nonLegacyViews.length },
    legacy_views: legacy.map((vw) => ({
      name: vw.table_name,
      last_modified: vw.last_modified,
      ddl_length: vw.ddl?.length ?? 0,
      view_definition: defs.get(vw.table_name) ?? null,
    })),
    other_views: nonLegacyViews.map((vw) => ({
      name: vw.table_name,
      last_modified: vw.last_modified,
      view_definition: defs.get(vw.table_name) ?? null,
    })),
  };
  dump("17-legacy-views.json", out);
}

// ───────────────────────────────────────────────────────────────────────
async function run() {
  const bq = buildBq();
  console.log(`Bucket 3 prefix discovery in ${PROJECT}.${DATASET}…`);
  const all = await liveTables(bq);
  console.log(`  live + view + external pool: ${all.length} objects`);

  await doOds(bq, all);
  await doDwh(bq, all);
  await doUni(bq, all);
  await doPre(bq, all);
  await doDimMapBs(bq, all);
  await doExternal(bq, all);
  await doLegacyViews(bq, all);

  console.log("\nAll done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
