/**
 * discover-bq-focus.ts
 *
 * Second-pass discovery. The first pass enumerated everything; this pass
 * pulls schemas + freshness + row shape for the specific candidates we want
 * to recommend to Lumen:
 *  - management_dashboard_* (looks like the Looker Studio source layer)
 *  - v_agent_globalcomix + v_playw3_agent (existing Lumen-shaped views/tables)
 *  - dwh_v_dim_* / dwh_v_fact_* (BI abstraction layer)
 *  - uni_fb2_* (apparent unified cross-client tables)
 *
 * Read-only. Output → tmp/bq-discovery/focus-*.json
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

async function q(bq: BigQuery, sql: string, params?: Record<string, unknown>): Promise<Row[]> {
  const [rows] = await bq.query({ query: sql, params, location: "US" });
  return rows as Row[];
}

async function getCols(bq: BigQuery, table: string) {
  return q(
    bq,
    `SELECT column_name, data_type FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`,
    { t: table },
  );
}

const TABLES_OF_INTEREST = [
  // The likely Looker Studio source layer — per-platform aggregates
  "management_dashboard_fb2",
  "management_dashboard_apple",
  "management_dashboard_google",
  "management_dashboard_tiktok",
  "management_dashboard_linkedin",
  "management_dashboard_fb_ios14",
  // A per-client variant so we can compare to the cross-client one
  "management_dashboard_fb2_globalcomix",
  "management_dashboard_fb2_2k",
  "management_dashboard_fb2_just_spices",
  "management_dashboard_apple_express_vpn",
  // The existing Lumen-shaped abstractions (used by current bq-security.ts)
  "v_agent_globalcomix",
  "v_playw3_agent",
  // BI abstraction layer
  "dwh_v_fact_a_app_installs",
  "dwh_v_fact_a_unified_app_installs_campaigns",
  "dwh_v_fact_facebook_app_ads_insight",
  "dwh_v_dim_facebook_campaigns",
  // Per-client per-platform raw fact tables
  "dwh_fb2_globalcomix",
  "dwh_fb2_playw3",
  "dwh_fb2_ios14_appsflyer_100play",
  "dwh_apple_globalcomix",
  "dwh_google_ads_globalcomix",
  "dwh_tik_tok_globalcomix",
  // Unified table sample
  "uni_fb2_ios14_general_web_all",
  // Reference dim
  "dwh_v_dim_dates",
];

async function fetchDdl(bq: BigQuery, table: string): Promise<string | null> {
  const rows = await q(
    bq,
    `SELECT ddl FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\` WHERE table_name = @t`,
    { t: table },
  );
  return rows[0]?.ddl ? String(rows[0].ddl) : null;
}

async function describe(bq: BigQuery, table: string) {
  const cols = await getCols(bq, table);
  if (cols.length === 0) return { table, exists: false, cols: [], sample: [], stats: null, ddl: null };

  const colNames = cols.map((c) => String(c.column_name));
  const ddl = await fetchDdl(bq, table);

  // Sample 3 rows
  let sample: Row[] = [];
  try {
    sample = await q(bq, `SELECT * FROM \`${PROJECT}.${DATASET}.${table}\` LIMIT 3`);
    sample = sample.map((row) => {
      const o: Row = {};
      for (const k of Object.keys(row)) {
        const val = v(row[k]);
        // Stringify objects so JSON output is readable
        o[k] = typeof val === "object" && val !== null ? JSON.stringify(val) : val;
      }
      return o;
    });
  } catch (e) {
    sample = [{ __error: (e as Error).message }];
  }

  // Stats — date span, row count, distinct campaigns/clients/networks if columns exist
  const stats: Row = {};
  const lower = new Map(cols.map((c) => [String(c.column_name).toLowerCase(), String(c.column_name)]));
  const pick = (...names: string[]) => {
    for (const n of names) {
      const hit = lower.get(n.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };
  const dateCol = pick("date", "day", "report_date", "event_date", "_data_date_");
  const clientCol = pick("master_account", "client", "customer", "account_name", "account", "advertiser", "app_name", "appname");
  const campaignCol = pick("campaign_id", "campaign_name", "campaign");
  const networkCol = pick("network", "channel", "media_source", "platform", "PLATFORM", "source");
  const spendCol = pick("spend_usd", "cost_usd", "spend", "cost");
  const installsCol = pick("installs", "install", "total_installs", "conversions");

  try {
    const sel: string[] = ["COUNT(*) AS row_count"];
    if (dateCol) sel.push(`MIN(\`${dateCol}\`) AS earliest, MAX(\`${dateCol}\`) AS latest`);
    if (clientCol) sel.push(`COUNT(DISTINCT \`${clientCol}\`) AS n_clients`);
    if (campaignCol) sel.push(`COUNT(DISTINCT \`${campaignCol}\`) AS n_campaigns`);
    if (networkCol) sel.push(`COUNT(DISTINCT \`${networkCol}\`) AS n_networks`);
    if (spendCol) sel.push(`SAFE_CAST(SUM(\`${spendCol}\`) AS FLOAT64) AS total_spend`);
    if (installsCol) sel.push(`SAFE_CAST(SUM(\`${installsCol}\`) AS FLOAT64) AS total_installs`);
    const r = await q(
      bq,
      `SELECT ${sel.join(", ")} FROM \`${PROJECT}.${DATASET}.${table}\``,
    );
    const row = r[0] ?? {};
    Object.assign(stats, {
      rows: Number(row.row_count ?? 0),
      earliest: row.earliest ? String(v(row.earliest)) : null,
      latest: row.latest ? String(v(row.latest)) : null,
      clients: row.n_clients != null ? Number(row.n_clients) : null,
      campaigns: row.n_campaigns != null ? Number(row.n_campaigns) : null,
      networks: row.n_networks != null ? Number(row.n_networks) : null,
      total_spend: row.total_spend != null ? Number(row.total_spend) : null,
      total_installs: row.total_installs != null ? Number(row.total_installs) : null,
      probe_cols: { dateCol, clientCol, campaignCol, networkCol, spendCol, installsCol },
    });

    // If clientCol exists, top-10 clients by spend (or by row count)
    if (clientCol) {
      const orderBy = spendCol ? `SUM(\`${spendCol}\`) DESC` : "COUNT(*) DESC";
      const top = await q(
        bq,
        `
          SELECT
            \`${clientCol}\` AS client_name,
            COUNT(*) AS n_rows,
            ${spendCol ? `SAFE_CAST(SUM(\`${spendCol}\`) AS FLOAT64) AS total_spend,` : ""}
            ${dateCol ? `MAX(\`${dateCol}\`) AS latest_date` : "NULL AS latest_date"}
          FROM \`${PROJECT}.${DATASET}.${table}\`
          GROUP BY client_name
          ORDER BY ${orderBy}
          LIMIT 15
        `,
      );
      stats.top_clients = top.map((r) => ({
        client: r.client_name,
        rows: Number(r.n_rows ?? 0),
        spend: r.total_spend != null ? Number(r.total_spend) : null,
        latest: r.latest_date ? String(v(r.latest_date)) : null,
      }));
    }
  } catch (e) {
    stats.error = (e as Error).message;
  }

  return {
    table,
    exists: true,
    col_count: cols.length,
    cols: cols.map((c) => ({ name: c.column_name, type: c.data_type })),
    sample,
    stats,
    ddl,
  };
}

async function run() {
  const bq = buildBq();
  console.log(`Focused probe of ${TABLES_OF_INTEREST.length} tables…`);
  const out: Record<string, unknown> = {};
  for (const t of TABLES_OF_INTEREST) {
    console.log(`  probing ${t}…`);
    out[t] = await describe(bq, t);
  }
  fs.writeFileSync(path.join(OUT_DIR, "focus-tables.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(`Wrote tmp/bq-discovery/focus-tables.json`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
