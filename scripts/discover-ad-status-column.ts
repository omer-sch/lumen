/**
 * discover-ad-status-column.ts
 *
 * One-shot read-only probe: does the per-network GlobalComix spend table
 * carry an `ad_status` (or similarly named *_status) column on the
 * `breakdown_type='Creatives'` slice? Drives the Creative Breakdown
 * UI decision on whether to show an "Ad Status" filter chip and project
 * the column out of `buildSpendCreativesSubquery`.
 *
 * Also samples per-(date, ad_id) row counts so the WS2 fan-out predicate
 * choice has evidence behind it. If the Creatives slice has multiple
 * rows per (date, ad_id), the dedupe needs an extra column (placement,
 * geo, ...) — surfaced as `fanout_sample`.
 *
 * Writes:
 *   tmp/bq-discovery/2026-05-18-ad-status-probe.json
 *
 * Run: npx tsx scripts/discover-ad-status-column.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = process.env.BQ_DATASET ?? "yellowhead_prod";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "bq-discovery");
const OUT_PATH = path.join(OUT_DIR, "2026-05-18-ad-status-probe.json");

// All five GlobalComix per-network spend tables. The first three are
// the only ones expected to carry per-ad spend on the Creatives slice
// (Meta, TikTok, AppLovin); the last two are probed for completeness
// in case the data team backfills.
const TABLES = [
  "dwh_fb2_globalcomix_adjust",
  "dwh_tik_tok_globalcomix_adjust",
  "dwh_applovin_globalcomix_adjust",
  "dwh_google_ads_globalcomix_adjust",
  "dwh_apple_globalcomix_adjust",
];

function buildBq(): BigQuery {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (b64) {
    const credentials = JSON.parse(
      Buffer.from(b64, "base64").toString("utf-8"),
    );
    return new BigQuery({ projectId: PROJECT, credentials });
  }
  return new BigQuery({ projectId: PROJECT });
}

type StatusColumn = { column_name: string; data_type: string };

async function probeStatusColumns(
  bq: BigQuery,
  table: string,
): Promise<StatusColumn[]> {
  const [rows] = await bq.query({
    query: `
      SELECT column_name, data_type
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE LOWER(table_name) = LOWER(@table)
        AND LOWER(column_name) LIKE '%status%'
      ORDER BY ordinal_position
    `,
    params: { table },
    location: "US",
  });
  return (rows as StatusColumn[]).map((r) => ({
    column_name: String(r.column_name),
    data_type: String(r.data_type),
  }));
}

async function probeAdIdColumn(
  bq: BigQuery,
  table: string,
): Promise<{ column_name: string; data_type: string } | null> {
  const [rows] = await bq.query({
    query: `
      SELECT column_name, data_type
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE LOWER(table_name) = LOWER(@table)
        AND LOWER(column_name) IN ('ad_id', 'creative_id')
      ORDER BY ordinal_position
      LIMIT 1
    `,
    params: { table },
    location: "US",
  });
  const r = (rows as Array<{ column_name: string; data_type: string }>)[0];
  return r ? { column_name: String(r.column_name), data_type: String(r.data_type) } : null;
}

type FanoutSample = {
  date: string;
  ad_id: string;
  row_count: number;
};

async function probeFanout(
  bq: BigQuery,
  table: string,
): Promise<{ sample: FanoutSample[]; max_count: number } | null> {
  try {
    const [rows] = await bq.query({
      query: `
        SELECT
          CAST(date AS STRING) AS date,
          CAST(ad_id AS STRING) AS ad_id,
          COUNT(*) AS row_count
        FROM \`${PROJECT}.${DATASET}.${table}\`
        WHERE breakdown_type = 'Creatives'
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
          AND ad_id IS NOT NULL
        GROUP BY date, ad_id
        HAVING COUNT(*) > 1
        ORDER BY row_count DESC
        LIMIT 5
      `,
      location: "US",
    });
    const sample: FanoutSample[] = (rows as FanoutSample[]).map((r) => ({
      date: String(r.date),
      ad_id: String(r.ad_id),
      row_count: Number(r.row_count),
    }));
    const max_count = sample.reduce(
      (acc, r) => (r.row_count > acc ? r.row_count : acc),
      0,
    );
    return { sample, max_count };
  } catch (err) {
    return { sample: [], max_count: 0, /* @ts-expect-error error stash */ error: err instanceof Error ? err.message : String(err) };
  }
}

type Result = {
  table: string;
  status_columns: StatusColumn[];
  ad_id_column: { column_name: string; data_type: string } | null;
  fanout: { sample: FanoutSample[]; max_count: number } | null;
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bq = buildBq();

  const out: Result[] = [];
  for (const table of TABLES) {
    process.stdout.write(`[${table}] probing... `);
    const status_columns = await probeStatusColumns(bq, table);
    const ad_id_column = await probeAdIdColumn(bq, table);
    const fanout = await probeFanout(bq, table);
    process.stdout.write(
      `status_cols=${status_columns.length} ad_id=${ad_id_column?.column_name ?? "—"} fanout_max=${fanout?.max_count ?? "—"}\n`,
    );
    out.push({ table, status_columns, ad_id_column, fanout });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ probed_at: new Date().toISOString(), results: out }, null, 2), "utf-8");
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
