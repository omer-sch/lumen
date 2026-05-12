/**
 * discover-bq-clients.ts
 *
 * Third pass: cross-platform client roll-up. Union the
 * management_dashboard_* family and emit one row per master_account with
 * platforms-active, last-activity, recent spend. Plus check the Rivery
 * watermark view.
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
  const [job] = await bq.createQueryJob({ query: sql, location: "US", dryRun: false });
  const [rows] = await job.getQueryResults();
  const meta = job.metadata?.statistics?.query;
  console.log(`    bytes processed: ${meta?.totalBytesProcessed ?? "?"}`);
  return rows as Row[];
}

async function run() {
  const bq = buildBq();

  // 1. Cross-platform client roll-up via UNION ALL of the six management_dashboard_<platform> tables.
  // Filter columns to the 15-col common subset (we already confirmed PLATFORM and master_account live on all).
  console.log("Phase A: cross-platform client roll-up…");
  const TODAY = "2026-05-11";
  const sql = `
    WITH unioned AS (
      SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
        FROM \`${PROJECT}.${DATASET}.management_dashboard_fb2\`
      UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
        FROM \`${PROJECT}.${DATASET}.management_dashboard_apple\`
      UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
        FROM \`${PROJECT}.${DATASET}.management_dashboard_google\`
      UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
        FROM \`${PROJECT}.${DATASET}.management_dashboard_tiktok\`
      UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
        FROM \`${PROJECT}.${DATASET}.management_dashboard_linkedin\`
      UNION ALL SELECT date, master_account_id, master_account, PLATFORM, cost_usd, installs, revenue, campaign_id, campaign_status
        FROM \`${PROJECT}.${DATASET}.management_dashboard_fb_ios14\`
    )
    SELECT
      master_account_id,
      master_account,
      ARRAY_AGG(DISTINCT PLATFORM ORDER BY PLATFORM) AS platforms_lifetime,
      ARRAY_AGG(DISTINCT IF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 30 DAY), PLATFORM, NULL) IGNORE NULLS) AS platforms_active_30d,
      MAX(date) AS last_activity,
      COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY)) AS rows_last_7d,
      COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 30 DAY)) AS rows_last_30d,
      SUM(IF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY), cost_usd, 0)) AS spend_last_7d,
      SUM(IF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 30 DAY), cost_usd, 0)) AS spend_last_30d,
      SUM(IF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 30 DAY), installs, 0)) AS installs_last_30d,
      SUM(cost_usd) AS spend_lifetime,
      COUNT(DISTINCT campaign_id) AS campaigns_lifetime
    FROM unioned
    WHERE master_account IS NOT NULL
    GROUP BY master_account_id, master_account
    ORDER BY spend_last_30d DESC NULLS LAST, spend_lifetime DESC NULLS LAST
  `;
  const clients = await q(bq, sql);
  const cleaned = clients.map((r) => ({
    master_account_id: r.master_account_id,
    master_account: r.master_account,
    platforms_lifetime: r.platforms_lifetime,
    platforms_active_30d: r.platforms_active_30d,
    last_activity: r.last_activity ? String(v(r.last_activity)) : null,
    rows_last_7d: Number(r.rows_last_7d ?? 0),
    rows_last_30d: Number(r.rows_last_30d ?? 0),
    spend_last_7d: r.spend_last_7d != null ? Number(r.spend_last_7d) : null,
    spend_last_30d: r.spend_last_30d != null ? Number(r.spend_last_30d) : null,
    installs_last_30d: r.installs_last_30d != null ? Number(r.installs_last_30d) : null,
    spend_lifetime: r.spend_lifetime != null ? Number(r.spend_lifetime) : null,
    campaigns_lifetime: Number(r.campaigns_lifetime ?? 0),
  }));
  console.log(`  → ${cleaned.length} distinct clients`);

  // 2. Rivery activity check view — what does it expose?
  console.log("\nPhase B: rivery activity check…");
  let rivery: Row[] = [];
  try {
    rivery = await q(
      bq,
      `SELECT * FROM \`${PROJECT}.rivery_activity_anlytics.v_rivery_activity_check\` LIMIT 20`,
    );
  } catch (e) {
    rivery = [{ __error: (e as Error).message }];
  }

  // 3. Per-platform freshness — what's the last data date in each management_dashboard table?
  console.log("\nPhase C: per-platform freshness…");
  const freshness = await q(
    bq,
    `
    SELECT 'fb2' AS platform, MAX(date) AS latest, COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY)) AS rows_last_7d
      FROM \`${PROJECT}.${DATASET}.management_dashboard_fb2\`
    UNION ALL SELECT 'apple', MAX(date), COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY))
      FROM \`${PROJECT}.${DATASET}.management_dashboard_apple\`
    UNION ALL SELECT 'google', MAX(date), COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY))
      FROM \`${PROJECT}.${DATASET}.management_dashboard_google\`
    UNION ALL SELECT 'tiktok', MAX(date), COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY))
      FROM \`${PROJECT}.${DATASET}.management_dashboard_tiktok\`
    UNION ALL SELECT 'linkedin', MAX(date), COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY))
      FROM \`${PROJECT}.${DATASET}.management_dashboard_linkedin\`
    UNION ALL SELECT 'fb_ios14', MAX(date), COUNTIF(date >= DATE_SUB(DATE '${TODAY}', INTERVAL 7 DAY))
      FROM \`${PROJECT}.${DATASET}.management_dashboard_fb_ios14\`
    `,
  );

  // 4. Are there per-client management_dashboard_<platform>_<client> tables that diverge from the cross-client tables?
  // We saw extra `os` and `currency` columns in management_dashboard_fb2_2k.
  // Count how many per-client variants exist.
  console.log("\nPhase D: per-client management_dashboard_* variants…");
  const variants = await q(
    bq,
    `
      SELECT table_name
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\`
      WHERE STARTS_WITH(table_name, 'management_dashboard_')
      ORDER BY table_name
    `,
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "clients-rollup.json"),
    JSON.stringify(
      {
        as_of: TODAY,
        client_count: cleaned.length,
        clients: cleaned,
        freshness: freshness.map((r) => ({
          platform: r.platform,
          latest: r.latest ? String(v(r.latest)) : null,
          rows_last_7d: Number(r.rows_last_7d ?? 0),
        })),
        rivery_sample: rivery.map((r) => {
          const o: Row = {};
          for (const k of Object.keys(r)) o[k] = v(r[k]);
          return o;
        }),
        management_dashboard_variants: variants.map((r) => r.table_name),
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(`\nWrote tmp/bq-discovery/clients-rollup.json`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
