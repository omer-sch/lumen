/**
 * discover-bq.ts
 *
 * Pure read-only discovery for the BigQuery project
 * `yellowhead-visionbi-rivery`. Does NOT assume any specific dataset, table,
 * naming convention, or client list — starts from `INFORMATION_SCHEMA.SCHEMATA`
 * and walks down.
 *
 * Writes JSON dumps to `tmp/bq-discovery/` so the planning step can read them
 * back without re-querying.
 *
 *   tmp/bq-discovery/
 *     01-schemata.json
 *     02-tables-by-dataset.json
 *     03-liveness.json
 *     04-platform-map.json
 *     05-schemas.json
 *     06-date-spans.json
 *     07-client-strategy.json
 *
 * Run:  npx tsx scripts/discover-bq.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
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

function dump(name: string, data: unknown): void {
  fs.writeFileSync(
    path.join(OUT_DIR, name),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
  console.log(`  wrote ${name}`);
}

// BQ row values come back as { value: "2025-05-11" } for DATE/TIMESTAMP. Normalize.
function v(x: unknown): unknown {
  if (x && typeof x === "object" && "value" in (x as object)) {
    return (x as { value: unknown }).value;
  }
  return x;
}

type Row = Record<string, unknown>;

async function q(bq: BigQuery, sql: string, params?: Record<string, unknown>): Promise<Row[]> {
  const [rows] = await bq.query({ query: sql, params, location: "US" });
  return rows as Row[];
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 1 — datasets
// ───────────────────────────────────────────────────────────────────────────

async function discoverSchemata(bq: BigQuery): Promise<string[]> {
  console.log("Phase 1: enumerating datasets…");
  // INFORMATION_SCHEMA.SCHEMATA lives at the region level. Use the *-region
  // alias to cover all regions in one query.
  const rows = await q(
    bq,
    `
      SELECT
        schema_name,
        location,
        creation_time,
        last_modified_time
      FROM \`${PROJECT}\`.\`region-us\`.INFORMATION_SCHEMA.SCHEMATA
      ORDER BY schema_name
    `,
  );
  const datasets = rows.map((r) => ({
    name: String(r.schema_name),
    location: String(r.location),
    created: v(r.creation_time),
    modified: v(r.last_modified_time),
  }));
  dump("01-schemata.json", datasets);
  console.log(`  found ${datasets.length} datasets`);
  return datasets.map((d) => d.name);
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 2 — objects per dataset
// ───────────────────────────────────────────────────────────────────────────

type ObjectMeta = {
  dataset: string;
  table_name: string;
  table_type: string;
  row_count: number | null;
  size_bytes: number | null;
  created: string | null;
  modified: string | null;
  partition_column: string | null;
  cluster_columns: string[];
};

async function discoverTables(bq: BigQuery, datasets: string[]): Promise<ObjectMeta[]> {
  console.log("Phase 2: enumerating tables/views per dataset…");
  const all: ObjectMeta[] = [];

  for (const ds of datasets) {
    try {
      // TABLES has type + sizes. TABLE_OPTIONS / PARTITIONS expose extras.
      // We pull a richer COLUMN_STATS-free query: type, row count, size,
      // creation/modification, partitioning, clustering — via the dataset's
      // INFORMATION_SCHEMA.
      const rows = await q(
        bq,
        `
          SELECT
            t.table_name,
            t.table_type,
            t.creation_time,
            ts.last_modified_time,
            ts.row_count,
            ts.size_bytes,
            t.ddl
          FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.TABLES\` t
          LEFT JOIN \`${PROJECT}.${ds}.__TABLES__\` ts
            ON ts.table_id = t.table_name
          ORDER BY t.table_name
        `,
      );

      for (const r of rows) {
        const ddl = String(r.ddl ?? "");
        // Best-effort parse of PARTITION BY / CLUSTER BY out of DDL.
        const partMatch = ddl.match(/PARTITION BY\s+([^\n]+?)(?=\s+(?:CLUSTER|OPTIONS|AS\b|;|$))/i);
        const clusterMatch = ddl.match(/CLUSTER BY\s+([^\n]+?)(?=\s+(?:OPTIONS|AS\b|;|$))/i);
        const partition = partMatch ? partMatch[1].trim().replace(/[\s,]+$/, "") : null;
        const clusters = clusterMatch
          ? clusterMatch[1].split(",").map((s) => s.trim().replace(/[`]/g, ""))
          : [];

        all.push({
          dataset: ds,
          table_name: String(r.table_name),
          table_type: String(r.table_type),
          row_count: r.row_count != null ? Number(r.row_count) : null,
          size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
          created: r.creation_time ? String(v(r.creation_time)) : null,
          modified: r.last_modified_time != null ? new Date(Number(r.last_modified_time)).toISOString() : null,
          partition_column: partition,
          cluster_columns: clusters,
        });
      }
      console.log(`  ${ds}: ${rows.length} objects`);
    } catch (e) {
      console.error(`  ${ds}: error — ${(e as Error).message}`);
    }
  }

  dump("02-tables-by-dataset.json", all);
  return all;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 3 — liveness
// ───────────────────────────────────────────────────────────────────────────

type Liveness = {
  total_objects: number;
  by_dataset: Record<string, {
    total: number;
    live_30d: number;
    stale: number;
    empty: number;
    types: Record<string, number>;
    most_recent: string | null;
  }>;
};

function summarizeLiveness(objects: ObjectMeta[]): Liveness {
  console.log("Phase 3: summarizing liveness…");
  const now = Date.now();
  const THIRTY_D = 30 * 24 * 60 * 60 * 1000;
  const out: Liveness = { total_objects: objects.length, by_dataset: {} };

  for (const o of objects) {
    const ds = o.dataset;
    out.by_dataset[ds] ??= {
      total: 0,
      live_30d: 0,
      stale: 0,
      empty: 0,
      types: {},
      most_recent: null,
    };
    const b = out.by_dataset[ds];
    b.total += 1;
    b.types[o.table_type] = (b.types[o.table_type] ?? 0) + 1;
    const modTs = o.modified ? Date.parse(o.modified) : NaN;
    if (Number.isFinite(modTs)) {
      const age = now - modTs;
      if (age <= THIRTY_D) b.live_30d += 1;
      else b.stale += 1;
      if (!b.most_recent || Date.parse(b.most_recent) < modTs) {
        b.most_recent = o.modified;
      }
    }
    if (o.row_count === 0) b.empty += 1;
  }

  dump("03-liveness.json", out);
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 4 — platform map
// ───────────────────────────────────────────────────────────────────────────

const PLATFORM_TOKENS: Record<string, string> = {
  fb2: "Meta",
  fb: "Meta",
  facebook: "Meta",
  meta: "Meta",
  tiktok: "TikTok",
  tik_tok: "TikTok",
  ttads: "TikTok",
  adwords: "Google",
  google: "Google",
  google_ads: "Google",
  appsflyer: "AppsFlyer",
  adjust: "Adjust",
  apple: "Apple",
  asa: "Apple",
  twitter: "Twitter",
  x_ads: "Twitter",
  snapchat: "Snapchat",
  kochava: "Kochava",
  singular: "Singular",
  apptweak: "AppTweak",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  yahoo: "Yahoo",
  bing: "Bing",
  unity: "Unity",
  applovin: "AppLovin",
  ironsource: "ironSource",
  iron_source: "ironSource",
  vungle: "Vungle",
  mintegral: "Mintegral",
  search_console: "GoogleSearchConsole",
  gsc: "GoogleSearchConsole",
  apple_console: "AppleConsole",
};

function detectPlatformFromName(name: string): string | null {
  const lower = name.toLowerCase();
  // Try 2-word tokens first (greedy)
  for (const k of Object.keys(PLATFORM_TOKENS).filter((t) => t.includes("_"))) {
    if (lower.includes("_" + k + "_") || lower.endsWith("_" + k) || lower.startsWith(k + "_") || lower === k) {
      return PLATFORM_TOKENS[k];
    }
  }
  for (const k of Object.keys(PLATFORM_TOKENS).filter((t) => !t.includes("_"))) {
    if (lower.split(/[_.]/).includes(k)) {
      return PLATFORM_TOKENS[k];
    }
  }
  return null;
}

function platformMap(objects: ObjectMeta[]) {
  console.log("Phase 4: mapping platforms (name-based heuristic)…");
  const by: Record<string, string[]> = {};
  const unmatched: string[] = [];
  for (const o of objects) {
    const p = detectPlatformFromName(o.table_name);
    const key = p ?? "UNMATCHED";
    by[key] = by[key] ?? [];
    by[key].push(`${o.dataset}.${o.table_name}`);
    if (!p) unmatched.push(`${o.dataset}.${o.table_name}`);
  }
  const summary = Object.fromEntries(
    Object.entries(by).map(([k, v]) => [k, { count: v.length, sample: v.slice(0, 8) }]),
  );
  dump("04-platform-map.json", { summary, unmatched_count: unmatched.length, unmatched_sample: unmatched.slice(0, 30) });
  return by;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 5 — schemas of candidate fact tables
// ───────────────────────────────────────────────────────────────────────────

type ColRow = { column_name: string; data_type: string; is_nullable: string };

async function fetchColumns(bq: BigQuery, ds: string, table: string): Promise<ColRow[]> {
  const rows = await q(
    bq,
    `
      SELECT column_name, data_type, is_nullable
      FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @t
      ORDER BY ordinal_position
    `,
    { t: table },
  );
  return rows.map((r) => ({
    column_name: String(r.column_name),
    data_type: String(r.data_type),
    is_nullable: String(r.is_nullable),
  }));
}

async function inspectSchemas(
  bq: BigQuery,
  objects: ObjectMeta[],
): Promise<Record<string, ColRow[]>> {
  console.log("Phase 5: inspecting schemas of candidate fact tables…");

  // Candidates = anything that looks like a per-platform fact table, plus
  // any view whose name starts with v_ (likely an abstraction layer), plus
  // anything matching `clients`/`accounts` (likely a dimension table).
  const interesting = objects.filter((o) => {
    const n = o.table_name.toLowerCase();
    if (n.startsWith("v_")) return true;
    if (n.startsWith("dwh_")) return true;
    if (/(client|account|customer|brand)s?$/.test(n)) return true;
    if (/(campaign|adset|ad_group|creative)s?$/.test(n)) return true;
    return false;
  });

  // Within each (dataset, platform), pick the shortest-named table per
  // detected client slug — that's almost always the primary fact table,
  // not a derivative breakdown.
  const seen = new Set<string>();
  const picked: ObjectMeta[] = [];
  for (const o of interesting.sort((a, b) => a.table_name.length - b.table_name.length)) {
    const key = `${o.dataset}.${o.table_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(o);
    // Cap to avoid runaway cost. 80 schemas is plenty to characterize the warehouse.
    if (picked.length >= 80) break;
  }

  const schemas: Record<string, ColRow[]> = {};
  for (const o of picked) {
    try {
      const cols = await fetchColumns(bq, o.dataset, o.table_name);
      schemas[`${o.dataset}.${o.table_name}`] = cols;
    } catch (e) {
      console.error(`  schema failed ${o.dataset}.${o.table_name}: ${(e as Error).message}`);
    }
  }

  dump("05-schemas.json", schemas);
  console.log(`  inspected ${Object.keys(schemas).length} schemas`);
  return schemas;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 6 — date span / freshness per candidate fact table
// ───────────────────────────────────────────────────────────────────────────

function pickDateColumn(cols: ColRow[]): string | null {
  const PREF = ["date", "day", "event_date", "report_date", "data_date", "_PARTITIONDATE"];
  const map = new Map(cols.map((c) => [c.column_name.toLowerCase(), c.column_name]));
  for (const p of PREF) {
    const hit = map.get(p.toLowerCase());
    if (hit) return hit;
  }
  // fallback — any DATE/TIMESTAMP column
  const dateCol = cols.find((c) => /^(DATE|TIMESTAMP|DATETIME)$/i.test(c.data_type));
  return dateCol?.column_name ?? null;
}

async function dateSpans(
  bq: BigQuery,
  schemas: Record<string, ColRow[]>,
  objects: ObjectMeta[],
): Promise<Record<string, { earliest: string | null; latest: string | null; rows: number | null; date_col: string | null }>> {
  console.log("Phase 6: date span + recency for fact tables…");

  // Only run cheap MIN/MAX for objects we sized > 0 rows and have a date col.
  const byKey = new Map<string, ObjectMeta>(
    objects.map((o) => [`${o.dataset}.${o.table_name}`, o]),
  );
  const targets = Object.entries(schemas).filter(([k, cols]) => {
    const o = byKey.get(k);
    if (!o) return false;
    if (o.row_count === 0 || o.row_count === null) return false;
    return pickDateColumn(cols) !== null;
  });

  // Cap to top-N by row_count to keep cost bounded.
  targets.sort(([a], [b]) => (byKey.get(b)!.row_count ?? 0) - (byKey.get(a)!.row_count ?? 0));
  const capped = targets.slice(0, 50);

  const out: Record<string, { earliest: string | null; latest: string | null; rows: number | null; date_col: string | null }> = {};
  for (const [key, cols] of capped) {
    const dateCol = pickDateColumn(cols)!;
    const o = byKey.get(key)!;
    try {
      // MIN/MAX over a DATE/TIMESTAMP partition column is essentially free.
      // We use a small APPROX-friendly query and pass the date column name
      // via @c — but BQ doesn't param-substitute identifiers, so we validate
      // against the column list first (above) before interpolating.
      const safe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(dateCol);
      if (!safe) continue;
      const rows = await q(
        bq,
        `SELECT MIN(\`${dateCol}\`) AS earliest, MAX(\`${dateCol}\`) AS latest FROM \`${PROJECT}.${o.dataset}.${o.table_name}\``,
      );
      const r = rows[0] ?? {};
      out[key] = {
        earliest: r.earliest ? String(v(r.earliest)) : null,
        latest: r.latest ? String(v(r.latest)) : null,
        rows: o.row_count,
        date_col: dateCol,
      };
    } catch (e) {
      out[key] = { earliest: null, latest: null, rows: o.row_count, date_col: dateCol };
      console.error(`  date span failed ${key}: ${(e as Error).message}`);
    }
  }
  dump("06-date-spans.json", out);
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 7 — client model: look for an explicit clients dim table
// ───────────────────────────────────────────────────────────────────────────

async function clientStrategy(
  bq: BigQuery,
  objects: ObjectMeta[],
  schemas: Record<string, ColRow[]>,
) {
  console.log("Phase 7: investigating client model…");

  const candidates = objects.filter((o) => {
    const n = o.table_name.toLowerCase();
    return /(^|_)(client|account|customer|brand|advertiser)s?(_|$)/.test(n);
  });

  // For each candidate, peek a tiny sample (LIMIT 5) to see what's in there.
  const samples: Record<string, Row[]> = {};
  for (const o of candidates.slice(0, 20)) {
    const key = `${o.dataset}.${o.table_name}`;
    try {
      const rows = await q(
        bq,
        `SELECT * FROM \`${PROJECT}.${o.dataset}.${o.table_name}\` LIMIT 5`,
      );
      samples[key] = rows.map((r) => {
        const out: Row = {};
        for (const k of Object.keys(r)) out[k] = v(r[k]);
        return out;
      });
    } catch (e) {
      samples[key] = [];
      console.error(`  sample failed ${key}: ${(e as Error).message}`);
    }
  }

  dump("07-client-strategy.json", {
    candidate_dim_tables: candidates.map((c) => `${c.dataset}.${c.table_name}`),
    samples,
    schemas: Object.fromEntries(
      candidates.map((c) => [
        `${c.dataset}.${c.table_name}`,
        schemas[`${c.dataset}.${c.table_name}`] ?? null,
      ]),
    ),
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 8 — quick KPI shape probe on a single agent view (gold reference)
// ───────────────────────────────────────────────────────────────────────────

async function probeAgentView(bq: BigQuery, objects: ObjectMeta[]) {
  console.log("Phase 8: probing agent views (gold reference)…");
  const views = objects.filter(
    (o) =>
      o.table_type === "VIEW" &&
      /^v_(agent_|.*_agent$)/.test(o.table_name.toLowerCase()),
  );
  const out: Record<string, { rows: number; earliest: string | null; latest: string | null; networks: string[]; sample: Row[] }> = {};

  for (const o of views.slice(0, 6)) {
    const key = `${o.dataset}.${o.table_name}`;
    try {
      const cols = await fetchColumns(bq, o.dataset, o.table_name);
      const dateCol = pickDateColumn(cols);
      const networkCol = cols.find((c) => /^(network|channel|media_source|platform)$/i.test(c.column_name))?.column_name;

      // counts + span
      const safeDate = dateCol && /^[A-Za-z_][A-Za-z0-9_]*$/.test(dateCol);
      const rows = await q(
        bq,
        `
          SELECT
            COUNT(*) AS n,
            ${safeDate ? `MIN(\`${dateCol}\`) AS earliest, MAX(\`${dateCol}\`) AS latest` : "NULL AS earliest, NULL AS latest"}
          FROM \`${PROJECT}.${o.dataset}.${o.table_name}\`
        `,
      );
      const r = rows[0] ?? {};

      let networks: string[] = [];
      if (networkCol && /^[A-Za-z_][A-Za-z0-9_]*$/.test(networkCol)) {
        const nr = await q(
          bq,
          `SELECT DISTINCT \`${networkCol}\` AS n FROM \`${PROJECT}.${o.dataset}.${o.table_name}\` LIMIT 50`,
        );
        networks = nr.map((x) => String(v(x.n))).filter((s) => s && s !== "null");
      }

      const sample = await q(
        bq,
        `SELECT * FROM \`${PROJECT}.${o.dataset}.${o.table_name}\` LIMIT 3`,
      );

      out[key] = {
        rows: Number(r.n ?? 0),
        earliest: r.earliest ? String(v(r.earliest)) : null,
        latest: r.latest ? String(v(r.latest)) : null,
        networks,
        sample: sample.map((row) => {
          const o: Row = {};
          for (const k of Object.keys(row)) o[k] = v(row[k]);
          return o;
        }),
      };
    } catch (e) {
      console.error(`  probe failed ${key}: ${(e as Error).message}`);
    }
  }
  dump("08-agent-view-probe.json", out);
}

// ───────────────────────────────────────────────────────────────────────────
// main
// ───────────────────────────────────────────────────────────────────────────

async function run() {
  const bq = buildBq();
  const startedAt = new Date().toISOString();
  console.log(`Discovery started ${startedAt} — project=${PROJECT}\n`);

  const datasets = await discoverSchemata(bq);
  const objects = await discoverTables(bq, datasets);
  summarizeLiveness(objects);
  platformMap(objects);
  const schemas = await inspectSchemas(bq, objects);
  await dateSpans(bq, schemas, objects);
  await clientStrategy(bq, objects, schemas);
  await probeAgentView(bq, objects);

  fs.writeFileSync(
    path.join(OUT_DIR, "00-meta.json"),
    JSON.stringify({ project: PROJECT, started: startedAt, finished: new Date().toISOString() }, null, 2),
    "utf-8",
  );
  console.log(`\nDone. Output in ${OUT_DIR}`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
