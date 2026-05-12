/**
 * inspect-ml-superbloom.ts
 *
 * Follow-up probe for the ml_superbloom_* cluster: schemas, samples, and
 * the two view DDLs. Read-only. Output to console + dump.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = "yellowhead_prod";
const OUT = path.resolve(process.cwd(), "tmp", "bq-discovery", "22-ml-superbloom.json");

function buildBq() {
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
function flat(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(r)) {
    const val = v(r[k]);
    o[k] = typeof val === "object" && val !== null ? JSON.stringify(val) : val;
  }
  return o;
}

const TABLES = [
  "ml_superbloom_fact_daily_series_3lvl",
  "ml_superbloom_features_overall",
  "ml_superbloom_financial_incidents_overall",
  "ml_superbloom_breakdown_bucket_map",
  "ml_superbloom_v_incident_drilldown",
  "ml_superbloom_v_ua_raw",
];

async function run() {
  const bq = buildBq();
  const out: Record<string, unknown> = {};

  for (const t of TABLES) {
    console.log(`\n--- ${t} ---`);
    const [cols] = await bq.query({
      query: `SELECT column_name, data_type, is_nullable FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = '${t}' ORDER BY ordinal_position`,
      location: "US",
    });
    const [meta] = await bq.query({
      query: `SELECT table_type, ddl, view_definition FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\` t LEFT JOIN \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.VIEWS\` v USING (table_catalog, table_schema, table_name) WHERE t.table_name = '${t}'`,
      location: "US",
    });
    let sample: Record<string, unknown>[] = [];
    try {
      const [rows] = await bq.query({
        query: `SELECT * FROM \`${PROJECT}.${DATASET}.${t}\` LIMIT 5`,
        location: "US",
      });
      sample = (rows as Record<string, unknown>[]).map(flat);
    } catch (e) {
      sample = [{ __error: (e as Error).message.split("\n")[0] }];
    }
    out[t] = {
      table_type: meta[0]?.table_type,
      ddl: meta[0]?.ddl,
      view_definition: meta[0]?.view_definition,
      columns: cols,
      sample,
    };
    console.log(`  type=${meta[0]?.table_type}  cols=${cols.length}  sample_rows=${sample.length}`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(`\nWrote ${OUT}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
