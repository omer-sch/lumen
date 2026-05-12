/**
 * inspect-100play.ts
 * Phase 1 schema inspection for onboarding 100play to Lumen. Pulls column
 * lists from the three candidate tables, then runs row/date/null totals
 * against the actual column names discovered (never against guesses).
 *
 * Output: 100play_schema.md at the project root.
 * Run: npx tsx scripts/inspect-100play.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = process.env.BQ_DATASET ?? "yellowhead_prod";

const PRIMARY = "dwh_fb2_ios14_appsflyer_100play";
const SECONDARY = "dwh_fb2_100play";
const AF_ODS = "ods_appsflyer_patners_by_date_report_100play";

function buildBqClient(): BigQuery {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (b64) {
    const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return new BigQuery({ projectId: PROJECT, credentials });
  }
  return new BigQuery({ projectId: PROJECT });
}

type Column = { column_name: string; data_type: string; is_nullable: string };

async function fetchColumns(bq: BigQuery, tableName: string): Promise<Column[]> {
  const [rows] = await bq.query({
    query: `
      SELECT column_name, data_type, is_nullable
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = '${tableName}'
      ORDER BY ordinal_position
    `,
    location: "US",
  });
  return rows as Column[];
}

const NUMERIC_TYPES = new Set([
  "INT64", "NUMERIC", "BIGNUMERIC", "FLOAT64",
]);

function isNumeric(c: Column): boolean {
  return NUMERIC_TYPES.has(c.data_type);
}

function pickColumn(
  cols: Column[],
  patterns: RegExp[],
  predicate?: (c: Column) => boolean,
): string | null {
  for (const pat of patterns) {
    for (const c of cols) {
      if (pat.test(c.column_name) && (!predicate || predicate(c))) {
        return c.column_name;
      }
    }
  }
  return null;
}

function fmtTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "_(empty)_";
  const headers = Object.keys(rows[0]);
  const head = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (r) =>
        `| ${headers
          .map((h) => {
            const v = r[h];
            if (v == null) return "";
            if (typeof v === "object" && "value" in v) {
              return String((v as { value: unknown }).value);
            }
            return String(v);
          })
          .join(" | ")} |`,
    )
    .join("\n");
  return `${head}\n${body}`;
}

async function run() {
  const bq = buildBqClient();
  const lines: string[] = [];
  const say = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  say(`# 100play — Schema Inspection (Phase 1)`);
  say(`Generated: ${new Date().toISOString()}`);
  say(`Project: ${PROJECT}`);
  say(`Dataset: ${DATASET}\n`);

  // ── 1a/1b/1c: schemas ───────────────────────────────────────────────────
  const [primaryCols, secondaryCols, afCols] = await Promise.all([
    fetchColumns(bq, PRIMARY),
    fetchColumns(bq, SECONDARY),
    fetchColumns(bq, AF_ODS),
  ]);

  for (const [name, cols] of [
    ["1a. Schema — `" + PRIMARY + "`", primaryCols],
    ["1b. Schema — `" + SECONDARY + "`", secondaryCols],
    ["1c. Schema — `" + AF_ODS + "`", afCols],
  ] as const) {
    say(`## ${name}\n`);
    say(`Total columns: ${cols.length}\n`);
    if (cols.length === 0) {
      say("_(table not found or has no columns)_\n");
      continue;
    }
    say(fmtTable(cols as unknown as Record<string, unknown>[]));
    say("");
  }

  // ── Column discovery on the primary table ───────────────────────────────
  // Prefer names that match Rivery's standard (cost / spend / installs / date)
  // but fall back to anything sensible. Always require numeric type for the
  // metric columns so we don't accidentally pick a label/id column.
  const dateCol = pickColumn(primaryCols, [
    /^date$/i,
    /^event_date$/i,
    /^day$/i,
    /^report_date$/i,
    /date$/i,
  ]);
  const spendCol = pickColumn(
    primaryCols,
    [/^cost_usd$/i, /^spend_usd$/i, /^cost$/i, /^spend$/i, /(spend|cost)/i],
    isNumeric,
  );
  const installsCol = pickColumn(
    primaryCols,
    [/^installs$/i, /^install$/i, /installs?/i],
    isNumeric,
  );
  const revenueCol = pickColumn(
    primaryCols,
    [
      /^rev_gross_d7_usd$/i,
      /^revenue_usd$/i,
      /^revenue$/i,
      /^rev_/i,
      /(revenue|rev_gross)/i,
    ],
    isNumeric,
  );
  const networkCol = pickColumn(primaryCols, [/^network$/i, /^channel$/i, /^source$/i, /^media_source$/i]);
  const campaignIdCol = pickColumn(primaryCols, [/^campaign_id$/i, /campaign.*id$/i]);
  const campaignNameCol = pickColumn(primaryCols, [/^campaign_name$/i, /campaign.*name$/i]);

  say(`## Column discovery on primary table\n`);
  say(`| role | detected column |`);
  say(`|---|---|`);
  say(`| date          | ${dateCol ?? "_(not found)_"} |`);
  say(`| spend         | ${spendCol ?? "_(not found)_"} |`);
  say(`| installs      | ${installsCol ?? "_(not found)_"} |`);
  say(`| revenue       | ${revenueCol ?? "_(not found)_"} |`);
  say(`| network       | ${networkCol ?? "_(not found)_"} |`);
  say(`| campaign_id   | ${campaignIdCol ?? "_(not found)_"} |`);
  say(`| campaign_name | ${campaignNameCol ?? "_(not found)_"} |`);
  say("");

  // Same discovery on the secondary table — it might not be appsflyer-joined
  // so installs may legitimately be absent.
  const secDate = pickColumn(secondaryCols, [/^date$/i, /date$/i]);
  const secSpend = pickColumn(
    secondaryCols,
    [/^cost_usd$/i, /^spend_usd$/i, /^cost$/i, /^spend$/i, /(spend|cost)/i],
    isNumeric,
  );
  const secInstalls = pickColumn(
    secondaryCols,
    [/^installs$/i, /^install$/i, /installs?/i],
    isNumeric,
  );

  say(`## Column discovery on secondary table (\`${SECONDARY}\`)\n`);
  say(`| role | detected column |`);
  say(`|---|---|`);
  say(`| date     | ${secDate ?? "_(not found)_"} |`);
  say(`| spend    | ${secSpend ?? "_(not found)_"} |`);
  say(`| installs | ${secInstalls ?? "_(not found)_"} |`);
  say("");

  // ── 1d: row count, date range, totals on the primary table ──────────────
  say(`## 1d. Row count, date range, totals — \`${PRIMARY}\`\n`);
  if (!dateCol || !spendCol) {
    say(`Skipped — could not find date or spend column.\n`);
  } else {
    const installsExpr = installsCol ? `SUM(${installsCol})` : `NULL`;
    const revenueExpr = revenueCol ? `SUM(${revenueCol})` : `NULL`;
    const [rows] = await bq.query({
      query: `
        SELECT
          COUNT(*)            AS total_rows,
          MIN(${dateCol})     AS earliest_date,
          MAX(${dateCol})     AS latest_date,
          SUM(${spendCol})    AS total_spend,
          ${installsExpr}     AS total_installs,
          ${revenueExpr}      AS total_revenue
        FROM \`${PROJECT}.${DATASET}.${PRIMARY}\`
      `,
      location: "US",
    });
    say(fmtTable(rows as Record<string, unknown>[]));
    say("");
  }

  // ── 1e: overlap check — do the two dwh tables cover different ranges? ───
  say(`## 1e. Overlap check between the two dwh tables\n`);
  if (!dateCol || !secDate) {
    say(`Skipped — missing date column on one of the tables.\n`);
  } else {
    const [rows] = await bq.query({
      query: `
        SELECT '${PRIMARY}' AS source,
               MIN(${dateCol}) AS earliest,
               MAX(${dateCol}) AS latest,
               COUNT(*) AS row_count
        FROM \`${PROJECT}.${DATASET}.${PRIMARY}\`
        UNION ALL
        SELECT '${SECONDARY}',
               MIN(${secDate}),
               MAX(${secDate}),
               COUNT(*)
        FROM \`${PROJECT}.${DATASET}.${SECONDARY}\`
      `,
      location: "US",
    });
    say(fmtTable(rows as Record<string, unknown>[]));
    say("");

    // Sample a recent date to see if both tables have rows for the same day
    // — this is the deciding test for "non-overlapping" vs "overlapping".
    const [sample] = await bq.query({
      query: `
        WITH p AS (
          SELECT ${dateCol} AS d, SUM(${spendCol}) AS spend
          FROM \`${PROJECT}.${DATASET}.${PRIMARY}\`
          GROUP BY ${dateCol}
        ),
        s AS (
          SELECT ${secDate} AS d, SUM(${secSpend ?? spendCol}) AS spend
          FROM \`${PROJECT}.${DATASET}.${SECONDARY}\`
          GROUP BY ${secDate}
        )
        SELECT
          COUNT(*) AS overlapping_days,
          SUM(p.spend) AS sum_spend_primary_overlap,
          SUM(s.spend) AS sum_spend_secondary_overlap
        FROM p INNER JOIN s USING (d)
      `,
      location: "US",
    });
    say(`### Days that appear in BOTH tables (with summed spend on those days)\n`);
    say(fmtTable(sample as Record<string, unknown>[]));
    say("");
  }

  // ── 1f: null checks on the primary table ─────────────────────────────────
  say(`## 1f. Null / zero checks on primary table\n`);
  if (!spendCol) {
    say(`Skipped — no spend column.\n`);
  } else {
    const installsNullExpr = installsCol ? `COUNTIF(${installsCol} IS NULL)` : `NULL`;
    const installsZeroExpr = installsCol ? `COUNTIF(${installsCol} = 0)` : `NULL`;
    const revenueNullExpr = revenueCol ? `COUNTIF(${revenueCol} IS NULL)` : `NULL`;
    const revenueZeroExpr = revenueCol ? `COUNTIF(${revenueCol} = 0)` : `NULL`;
    const [rows] = await bq.query({
      query: `
        SELECT
          ${installsNullExpr}            AS installs_null,
          ${installsZeroExpr}            AS installs_zero,
          COUNTIF(${spendCol} IS NULL)   AS spend_null,
          COUNTIF(${spendCol} = 0)       AS spend_zero,
          ${revenueNullExpr}             AS revenue_null,
          ${revenueZeroExpr}             AS revenue_zero,
          COUNT(*)                       AS total_rows
        FROM \`${PROJECT}.${DATASET}.${PRIMARY}\`
      `,
      location: "US",
    });
    say(fmtTable(rows as Record<string, unknown>[]));
    say("");
  }

  // ── Networks present on the primary table ───────────────────────────────
  if (networkCol) {
    say(`## Distinct networks on primary table (\`${networkCol}\`)\n`);
    const [rows] = await bq.query({
      query: `
        SELECT ${networkCol} AS network, COUNT(*) AS rows
        FROM \`${PROJECT}.${DATASET}.${PRIMARY}\`
        GROUP BY ${networkCol}
        ORDER BY rows DESC
      `,
      location: "US",
    });
    say(fmtTable(rows as Record<string, unknown>[]));
    say("");
  } else {
    say(`## Distinct networks on primary table\n`);
    say(`No network/channel column detected — channel mix will need a synthesized constant (e.g. "Meta").\n`);
  }

  // Persist the discovered column names so Phase 2 can reference them.
  say(`---\n`);
  say(`## Phase 2 inputs (to be referenced by bq-queries-100play.ts)\n`);
  say("```json");
  say(
    JSON.stringify(
      {
        primaryTable: PRIMARY,
        secondaryTable: SECONDARY,
        appsflyerOdsTable: AF_ODS,
        primary: {
          dateCol,
          spendCol,
          installsCol,
          revenueCol,
          networkCol,
          campaignIdCol,
          campaignNameCol,
        },
        secondary: {
          dateCol: secDate,
          spendCol: secSpend,
          installsCol: secInstalls,
        },
      },
      null,
      2,
    ),
  );
  say("```");

  const out = path.resolve(process.cwd(), "100play_schema.md");
  fs.writeFileSync(out, lines.join("\n"), "utf-8");
  console.log(`\nReport written to ${out}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
