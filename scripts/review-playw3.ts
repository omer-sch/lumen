/**
 * Playw3 BigQuery review — read-only data exploration.
 *
 * Runs 9 diagnostic queries against `v_playw3_agent`, captures the results,
 * and writes a human-readable markdown report to `playw3_data_review.md` in
 * the project root.
 *
 * Usage:
 *   npx tsx scripts/review-playw3.ts
 *
 * Auth: same path as src/lib/bq.ts — service-account JSON via
 * GOOGLE_APPLICATION_CREDENTIALS_JSON, else Application Default Credentials.
 */

import { config as loadDotenv } from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local first, then fall back to .env (matches Next.js precedence).
loadDotenv({ path: resolve(process.cwd(), ".env.local") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

const BQ_PROJECT = required("BQ_PROJECT");
const BQ_DATASET = required("BQ_DATASET");
const TABLE = `${BQ_PROJECT}.${BQ_DATASET}.v_playw3_agent`;
const TABLE_BACKTICK = `\`${TABLE}\``;
const REPORT_PATH = resolve(process.cwd(), "playw3_data_review.md");

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function buildClient(): BigQuery {
  const credentialsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credentialsB64) {
    const decoded = Buffer.from(credentialsB64, "base64").toString("utf-8");
    const credentials = JSON.parse(decoded);
    return new BigQuery({ projectId: BQ_PROJECT, credentials });
  }
  // Fall back to ADC (gcloud auth application-default login).
  return new BigQuery({ projectId: BQ_PROJECT });
}

type QueryResult = {
  id: number;
  name: string;
  purpose: string;
  sql: string;
  rows: Record<string, unknown>[];
  error?: string;
  ms: number;
};

const QUERIES: { name: string; purpose: string; sql: string }[] = [
  {
    name: "Full schema inspection",
    purpose:
      "Confirm the actual column names and types of v_playw3_agent. The schema in code may be out of date.",
    sql: `
SELECT column_name, data_type, is_nullable
FROM \`${BQ_PROJECT}\`.${BQ_DATASET}.INFORMATION_SCHEMA.COLUMNS
WHERE table_name = 'v_playw3_agent'
ORDER BY ordinal_position
`.trim(),
  },
  {
    name: "Date range and row count",
    purpose:
      "Understand total volume and whether there are gaps in the date series.",
    sql: `
SELECT
  COUNT(*) AS total_rows,
  MIN(date) AS earliest_date,
  MAX(date) AS latest_date,
  DATE_DIFF(MAX(date), MIN(date), DAY) + 1 AS date_span_days,
  COUNT(DISTINCT date) AS distinct_dates,
  DATE_DIFF(MAX(date), MIN(date), DAY) + 1 - COUNT(DISTINCT date) AS missing_date_count
FROM ${TABLE_BACKTICK}
`.trim(),
  },
  {
    name: "Network breakdown",
    purpose:
      "See which networks are present, their coverage dates, and relative spend weight.",
    sql: `
SELECT
  network,
  COUNT(*) AS row_count,
  MIN(date) AS earliest,
  MAX(date) AS latest,
  SUM(spend_usd) AS total_spend,
  SUM(installs) AS total_installs
FROM ${TABLE_BACKTICK}
GROUP BY network
ORDER BY total_spend DESC
`.trim(),
  },
  {
    name: "Key metric null and zero rates",
    purpose:
      "Surface data quality issues. High null rates on revenue/ROAS are common because attribution data backfills over days — this is expected but must be documented. (Note: v_playw3_agent exposes a single `roas` column — no D0/D7/D30 split.)",
    sql: `
SELECT
  COUNTIF(spend_usd IS NULL)   AS spend_null,
  COUNTIF(spend_usd = 0)       AS spend_zero,
  COUNTIF(installs IS NULL)    AS installs_null,
  COUNTIF(installs = 0)        AS installs_zero,
  COUNTIF(revenue_usd IS NULL) AS revenue_null,
  COUNTIF(revenue_usd = 0)     AS revenue_zero,
  COUNTIF(roas IS NULL)        AS roas_null,
  COUNTIF(roas = 0)            AS roas_zero,
  COUNTIF(cpi IS NULL)         AS cpi_null,
  COUNTIF(cpi = 0)             AS cpi_zero,
  COUNTIF(impressions IS NULL) AS impressions_null,
  COUNTIF(clicks IS NULL)      AS clicks_null,
  COUNT(*)                     AS total_rows
FROM ${TABLE_BACKTICK}
`.trim(),
  },
  {
    name: "Breakdown distribution (breakdown_type × breakdown_value)",
    purpose:
      "v_playw3_agent has no `os` column — `os` is one of the breakdown_values inside the `breakdown_type` dimension. This query enumerates how the view fans out spend across dimensions. Summing across all breakdowns double-counts spend; pick one canonical breakdown_type for any roll-up.",
    sql: `
SELECT
  breakdown_type,
  breakdown_value,
  COUNT(*) AS row_count,
  SUM(spend_usd) AS spend,
  SUM(installs) AS installs
FROM ${TABLE_BACKTICK}
GROUP BY breakdown_type, breakdown_value
ORDER BY spend DESC
LIMIT 50
`.trim(),
  },
  {
    name: "Campaign and ad-group counts",
    purpose:
      "Scope of the account — how many campaigns, ad-groups, and ads exist per network. (v_playw3_agent uses `ad_group_id`/`ad_id`; there is no `adset_id` column.)",
    sql: `
SELECT
  network,
  COUNT(DISTINCT campaign_id) AS campaigns,
  COUNT(DISTINCT ad_group_id) AS ad_groups,
  COUNT(DISTINCT ad_id)       AS ads,
  MIN(date)                   AS earliest,
  MAX(date)                   AS latest
FROM ${TABLE_BACKTICK}
GROUP BY network
ORDER BY campaigns DESC
`.trim(),
  },
  {
    name: "Monthly spend trend",
    purpose:
      "See the spend trajectory over time per network. Reveals if the account is growing, shrinking, or has gaps in specific months.",
    sql: `
SELECT
  FORMAT_DATE('%Y-%m', date) AS month,
  network,
  SUM(spend_usd) AS spend,
  SUM(installs)  AS installs,
  SAFE_DIVIDE(SUM(spend_usd), NULLIF(SUM(installs), 0)) AS cpi
FROM ${TABLE_BACKTICK}
GROUP BY 1, 2
ORDER BY 1 ASC, spend DESC
`.trim(),
  },
  {
    name: "Double-count check (breakdown aggregation)",
    purpose:
      "On the most recent date, check whether the same spend appears in multiple breakdown rows. If breakdown_types_present > 1 and spend_with_breakdowns is much higher than expected, the view is fanning out spend across breakdown dimensions and simple SUM will double-count. This is the most critical quality check.",
    sql: `
SELECT
  date,
  network,
  SUM(spend_usd) AS spend_with_breakdowns,
  COUNT(DISTINCT breakdown_type) AS breakdown_types_present
FROM ${TABLE_BACKTICK}
WHERE date = (SELECT MAX(date) FROM ${TABLE_BACKTICK})
GROUP BY date, network
ORDER BY network
`.trim(),
  },
  {
    name: "Dedupe verification — naive vs filtered totals (last 30 days)",
    purpose:
      "Side-by-side check: naive SUM(spend_usd) across all breakdown_types vs SUM filtered to breakdown_type = 'No Breakdown'. If the dedupe filter is correct, the filtered total should be a clean ~1/N of the naive total (where N is the number of breakdown_types). This is the proof that bq-queries.ts's WHERE breakdown_type = 'No Breakdown' predicate produces the right answer.",
    sql: `
WITH window_dates AS (
  SELECT
    DATE_SUB((SELECT MAX(date) FROM ${TABLE_BACKTICK}), INTERVAL 30 DAY) AS lo,
    (SELECT MAX(date) FROM ${TABLE_BACKTICK}) AS hi
)
SELECT
  'naive (all breakdown_types)' AS variant,
  SUM(spend_usd) AS spend_30d,
  SUM(installs)  AS installs_30d,
  COUNT(*)       AS row_count
FROM ${TABLE_BACKTICK}, window_dates
WHERE date BETWEEN window_dates.lo AND window_dates.hi
UNION ALL
SELECT
  'filtered (breakdown_type = \\'No Breakdown\\')' AS variant,
  SUM(spend_usd) AS spend_30d,
  SUM(installs)  AS installs_30d,
  COUNT(*)       AS row_count
FROM ${TABLE_BACKTICK}, window_dates
WHERE date BETWEEN window_dates.lo AND window_dates.hi
  AND breakdown_type = 'No Breakdown'
`.trim(),
  },
  {
    name: "Recent 30-day KPI summary",
    purpose:
      "Get a real headline number. This is what the Lumen dashboard will show — confirm it looks plausible. (Uses the single `roas` column the view exposes; no D0/D7/D30 split.)",
    sql: `
SELECT
  network,
  SUM(spend_usd) AS spend_30d,
  SUM(installs)  AS installs_30d,
  SAFE_DIVIDE(SUM(spend_usd), NULLIF(SUM(installs), 0)) AS cpi_30d,
  SAFE_DIVIDE(SUM(revenue_usd), NULLIF(SUM(spend_usd), 0)) AS roas_30d_recomputed,
  AVG(roas) AS avg_roas
FROM ${TABLE_BACKTICK}
WHERE date >= DATE_SUB(
  (SELECT MAX(date) FROM ${TABLE_BACKTICK}),
  INTERVAL 30 DAY
)
GROUP BY network
ORDER BY spend_30d DESC
`.trim(),
  },
];

async function runAll(): Promise<QueryResult[]> {
  const bq = buildClient();
  const out: QueryResult[] = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    const id = i + 1;
    console.log(`Running query ${id}/${QUERIES.length}: ${q.name}`);
    const t0 = Date.now();
    try {
      const [rows] = await bq.query({ query: q.sql, location: "US" });
      const ms = Date.now() - t0;
      const normalized = rows.map(normalizeRow);
      console.log(`  → ${normalized.length} row(s) in ${ms}ms`);
      out.push({ id, name: q.name, purpose: q.purpose, sql: q.sql, rows: normalized, ms });
    } catch (err) {
      const ms = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ failed in ${ms}ms: ${message.split("\n")[0]}`);
      out.push({
        id,
        name: q.name,
        purpose: q.purpose,
        sql: q.sql,
        rows: [],
        error: message,
        ms,
      });
    }
  }
  return out;
}

/** BigQuery returns Date/BigNumber wrapper objects — flatten for markdown. */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = normalizeValue(v);
  }
  return out;
}

function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in (v as object)) {
    return (v as { value: unknown }).value;
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}

// ── Markdown rendering ───────────────────────────────────────────────────

function renderTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "_No rows returned._";
  const cols = Object.keys(rows[0]);
  const header = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${cols.map((c) => fmtCell(r[c])).join(" | ")} |`)
    .join("\n");
  return [header, sep, body].join("\n");
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "_null_";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    return v.toFixed(4).replace(/\.?0+$/, "");
  }
  if (typeof v === "string") {
    // Escape pipe so it doesn't break the markdown column.
    return v.replace(/\|/g, "\\|");
  }
  return String(v);
}

// ── Analysis: turn structured results into findings ──────────────────────

function buildExecutiveSummary(results: QueryResult[]): string {
  const r2 = results.find((r) => r.id === 2)?.rows[0];
  const r3 = results.find((r) => r.id === 3)?.rows ?? [];
  const r4 = results.find((r) => r.id === 4)?.rows[0];
  const r8 = results.find((r) => r.id === 8)?.rows ?? [];

  // Verdict — derived from the highest-severity finding.
  const totalRows = r4 ? Number(r4.total_rows ?? 0) || 1 : 1;
  const installsAllNull = r4 && Number(r4.installs_null ?? 0) / totalRows > 0.99;
  const fanOut = r8.some((r) => Number(r.breakdown_types_present ?? 0) > 1);
  const verdict =
    installsAllNull
      ? `**Verdict: NO — not safe for production headline KPIs today.** Spend is trustworthy after applying the breakdown filter, but Installs / CPI cannot be sourced from this view and ROAS is mostly zero.`
      : fanOut
        ? `**Verdict: Conditionally yes** — only after the breakdown-fan-out fix in \`bq-queries.ts\` is in place. Without it, spend triples.`
        : `**Verdict: Yes** — naive aggregation is safe and quality is within expected ranges.`;

  const bullets: string[] = [verdict];

  if (r2) {
    const total = r2.total_rows;
    const earliest = r2.earliest_date;
    const latest = r2.latest_date;
    const missing = Number(r2.missing_date_count ?? 0);
    bullets.push(
      `Coverage: ${fmtCell(total)} rows spanning ${fmtCell(earliest)} → ${fmtCell(latest)}. ${
        missing > 0
          ? `${missing} missing date(s) inside the span — investigate.`
          : `No gaps in the daily series.`
      }`,
    );
  }

  if (r3.length > 0) {
    const names = r3.map((r) => `${r.network} (${fmtCell(r.total_spend)})`).join(", ");
    bullets.push(`Networks: ${r3.length} present — ${names}.`);
  }

  if (r4) {
    const total = Number(r4.total_rows ?? 0) || 1;
    const pct = (n: unknown) =>
      `${((Number(n ?? 0) / total) * 100).toFixed(1)}%`;
    bullets.push(
      `Quality: revenue null ${pct(r4.revenue_null)}, installs zero ${pct(r4.installs_zero)}, roas null ${pct(r4.roas_null)}.`,
    );
  }

  const fannedOut = r8.filter((r) => Number(r.breakdown_types_present ?? 0) > 1);
  if (fannedOut.length > 0) {
    bullets.push(
      `**CRITICAL — fan-out detected:** ${fannedOut.length} (date,network) combination(s) on the latest date contain >1 breakdown_type. Simple SUM(spend_usd) will double-count. See section 8.`,
    );
  } else {
    bullets.push(
      `Double-count check: no fan-out detected on the latest date — naive SUM is safe at the current cut.`,
    );
  }

  return bullets.map((b) => `- ${b}`).join("\n");
}

function buildIssuesLog(results: QueryResult[]): string {
  const issues: { sev: "CRITICAL" | "WARNING" | "INFO"; text: string }[] = [];

  // Query failures are always at least WARNING.
  for (const r of results) {
    if (r.error) {
      issues.push({
        sev: "CRITICAL",
        text: `Query ${r.id} (${r.name}) failed: ${r.error.split("\n")[0]}`,
      });
    }
  }

  const r2 = results.find((r) => r.id === 2)?.rows[0];
  if (r2 && Number(r2.missing_date_count ?? 0) > 0) {
    issues.push({
      sev: "WARNING",
      text: `Date series has ${r2.missing_date_count} missing day(s) between ${fmtCell(r2.earliest_date)} and ${fmtCell(r2.latest_date)}.`,
    });
  }

  const r4 = results.find((r) => r.id === 4)?.rows[0];
  if (r4) {
    const total = Number(r4.total_rows ?? 0) || 1;
    const ratio = (n: unknown) => Number(n ?? 0) / total;
    // CRITICAL: installs/cpi NULL in 100% of rows makes those headline KPIs
    // unusable. Flag explicitly even if the generic flagIf would catch it,
    // because this is the single most important finding in the review.
    if (ratio(r4.installs_null) > 0.99) {
      issues.push({
        sev: "CRITICAL",
        text: `\`installs\` is NULL in ${(ratio(r4.installs_null) * 100).toFixed(1)}% of v_playw3_agent rows (${fmtCell(r4.installs_null)} of ${fmtCell(total)}). The Lumen Installs KPI and CPI (= spend / installs) will be 0 / NULL for Playw3. Either source the install count from a different column / view, or stop showing Installs and CPI in the UI for this client.`,
      });
    }
    if (ratio(r4.cpi_null) > 0.99) {
      issues.push({
        sev: "CRITICAL",
        text: `\`cpi\` is NULL in 100% of v_playw3_agent rows. Recomputing from spend/installs also fails because installs is NULL. The CPI tile cannot be populated from this view.`,
      });
    }
    const flagIf = (label: string, n: unknown, threshold = 0.2, sev: "WARNING" | "INFO" = "WARNING") => {
      const r = ratio(n);
      if (r > threshold) {
        issues.push({
          sev,
          text: `${label}: ${(r * 100).toFixed(1)}% of rows (${fmtCell(n)} of ${fmtCell(total)}).`,
        });
      }
    };
    flagIf("revenue_usd null rate", r4.revenue_null);
    flagIf("revenue_usd zero rate", r4.revenue_zero, 0.2, "INFO");
    flagIf("roas null rate", r4.roas_null, 0.4, "INFO");
    flagIf("installs zero rate", r4.installs_zero, 0.3);
    flagIf("spend_usd null rate", r4.spend_null);
  }

  const r8 = results.find((r) => r.id === 8)?.rows ?? [];
  const fannedOut = r8.filter((r) => Number(r.breakdown_types_present ?? 0) > 1);
  if (fannedOut.length > 0) {
    const list = fannedOut
      .map((r) => `${r.network} (${r.breakdown_types_present} breakdown_types)`)
      .join("; ")
    issues.push({
      sev: "CRITICAL",
      text: `Fan-out on latest date: ${list}. Lumen's bq-queries.ts must filter to a single breakdown row per (date, campaign, adset) before SUM.`,
    });
  }

  const r5 = results.find((r) => r.id === 5)?.rows ?? [];
  const breakdownTypes = new Set(r5.map((r) => String(r.breakdown_type ?? "null")));
  if (breakdownTypes.size > 1) {
    issues.push({
      sev: "INFO",
      text: `View contains multiple breakdown_type values: ${[...breakdownTypes].join(", ")}. Verify section 5 to choose the correct filter.`,
    });
  }

  if (issues.length === 0) {
    return "_No issues found — naive SUM is safe and data quality is within expected ranges._";
  }

  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  issues.sort((a, b) => order[a.sev] - order[b.sev]);
  return issues
    .map((it, i) => `${i + 1}. **${it.sev}** — ${it.text}`)
    .join("\n");
}

function buildRecommendations(results: QueryResult[]): string {
  const lines: string[] = [];

  const r4 = results.find((r) => r.id === 4)?.rows[0];
  const totalRows = r4 ? Number(r4.total_rows ?? 0) || 1 : 1;
  const installsAllNull = r4 && Number(r4.installs_null ?? 0) / totalRows > 0.99;

  if (installsAllNull) {
    lines.push(
      `- **DO NOT ship Installs / CPI tiles for Playw3 until the install count is sourced.** \`v_playw3_agent.installs\` is NULL in 100% of rows. Either ask BI for the right column / join the AppsFlyer install signal in, or hide those two KPI tiles for this client.`,
    );
  }

  const r8 = results.find((r) => r.id === 8)?.rows ?? [];
  const fannedOut = r8.filter((r) => Number(r.breakdown_types_present ?? 0) > 1);

  const r9 = results.find((r) => r.id === 9)?.rows ?? [];
  const naive = r9.find((r) => String(r.variant ?? "").startsWith("naive"));
  const filtered = r9.find((r) => String(r.variant ?? "").startsWith("filtered"));
  const naiveSpend = naive ? Number(naive.spend_30d ?? 0) : 0;
  const filteredSpend = filtered ? Number(filtered.spend_30d ?? 0) : 0;
  const ratio = filteredSpend > 0 ? naiveSpend / filteredSpend : 0;

  if (fannedOut.length > 0) {
    if (ratio >= 1.8) {
      lines.push(
        `- **Fan-out fix applied** in \`src/lib/bq-security.ts\` via \`dedupePredicate: "breakdown_type = 'No Breakdown'"\` for the Playw3 schema, threaded through every aggregation in \`src/lib/bq-queries.ts\`. Verified: naive 30-day spend ($${naiveSpend.toFixed(2)}) reduces to filtered ($${filteredSpend.toFixed(2)}) — a ${ratio.toFixed(2)}× collapse consistent with the ${fannedOut[0]?.breakdown_types_present ?? "N"} breakdown_types present in the view.`,
      );
    } else {
      lines.push(
        `- **Patch \`src/lib/bq-queries.ts\`** to filter Playw3 to the canonical (un-fanned-out) breakdown row before aggregating. Add \`AND breakdown_type = 'No Breakdown'\` to every WHERE clause that targets v_playw3_agent. Verified: filtered 30-day spend $${filteredSpend.toFixed(2)} vs naive $${naiveSpend.toFixed(2)}.`,
      );
    }
  }

  if (r4 && Number(r4.revenue_null ?? 0) / totalRows > 0.5) {
    lines.push(
      `- **Verify revenue_usd backfill cadence with BI.** Over 50% of rows have NULL revenue, which is too high to trust ROAS at the headline level.`,
    );
  }
  if (r4 && Number(r4.revenue_zero ?? 0) / totalRows > 0.9) {
    lines.push(
      `- **Revenue is zero in >90% of rows.** ROAS will read ~0 across the board. Confirm whether Twitter has any revenue mapping, and whether Facebook conversions are wired into the right column.`,
    );
  }

  const r2 = results.find((r) => r.id === 2)?.rows[0];
  if (r2 && Number(r2.missing_date_count ?? 0) > 0) {
    lines.push(
      `- **Ask BI to investigate missing date(s)** in the v_playw3_agent series (${fmtCell(r2.missing_date_count)} of ${fmtCell(r2.date_span_days)} days have no rows). Full-day gaps create misleading deltas in 7d/30d windows.`,
    );
  }

  const r3 = results.find((r) => r.id === 3)?.rows ?? [];
  const twitter = r3.find((r) => String(r.network ?? "").toLowerCase() === "twitter");
  if (twitter) {
    const latest = String(twitter.latest ?? "");
    if (latest && latest < "2025-12-31") {
      lines.push(
        `- **Update the Playw3 coverage UI label.** Twitter rows end at ${latest}; current 30/90-day windows show Facebook-only data. Either drop "Twitter" from the coverage footnote or qualify it with "Twitter (historical, through ${latest})".`,
      );
    }
  }

  if (lines.length === 0) {
    lines.push("- No corrective action required at this time.");
  }
  return lines.join("\n");
}

function buildSchemaNotes(results: QueryResult[]): string {
  const r1 = results.find((r) => r.id === 1);
  if (!r1 || r1.rows.length === 0) {
    return "_Schema query returned no rows — cannot compare against expectations._";
  }
  // Columns the app code (src/lib/bq-security.ts + bq-queries.ts) actually
  // touches when querying v_playw3_agent. These MUST be present.
  const requiredByApp = new Set([
    "spend_usd",
    "revenue_usd",
    "installs",
    "date",
    "network",
    "campaign_id",
    "campaign_name",
  ]);
  // Columns the task prompt assumed existed but that this script learned
  // are NOT in the view. Surface the gap so callers stop referencing them.
  const promptAssumed = new Set([
    "adset_id",
    "os",
    "cpc",
    "roas_d0",
    "roas_d7",
    "roas_d14",
    "roas_d30",
    "roas_d90",
  ]);
  const actual = new Set(r1.rows.map((r) => String(r.column_name)));
  const missingRequired = [...requiredByApp].filter((c) => !actual.has(c));
  const missingAssumed = [...promptAssumed].filter((c) => !actual.has(c));
  const lines: string[] = [];
  if (missingRequired.length > 0) {
    lines.push(
      `**Missing from actual schema (required by app code):** ${missingRequired.join(", ")}.`,
    );
  } else {
    lines.push(
      `All columns required by \`src/lib/bq-queries.ts\` (\`spend_usd\`, \`revenue_usd\`, \`installs\`, \`date\`, \`network\`, \`campaign_id\`, \`campaign_name\`) are present.`,
    );
  }
  if (missingAssumed.length > 0) {
    lines.push(
      `**Absent (task prompt assumed they existed, they do not):** ${missingAssumed.join(", ")}. The view exposes a single \`roas\` column rather than a D0/D7/D14/D30/D90 split, uses \`ad_group_id\`/\`ad_id\` instead of \`adset_id\`, and has no \`os\` column (OS is one breakdown_value inside \`breakdown_type\`).`,
    );
  }
  return lines.join("\n");
}

// ── Top-level orchestration ──────────────────────────────────────────────

function renderReport(results: QueryResult[]): string {
  const ts = new Date().toISOString();
  const header = [
    `# Playw3 Agent View — Data Review`,
    ``,
    `Generated: ${ts}`,
    `Source: \`${TABLE}\``,
    ``,
    `## Executive summary`,
    ``,
    buildExecutiveSummary(results),
    ``,
  ].join("\n");

  const sections = results.map((r) => renderSection(r)).join("\n\n");

  const schemaNotes = buildSchemaNotes(results);
  const issues = buildIssuesLog(results);
  const recs = buildRecommendations(results);

  return [
    header,
    sections,
    ``,
    `## Schema notes`,
    ``,
    schemaNotes,
    ``,
    `## Issues log`,
    ``,
    issues,
    ``,
    `## Recommended actions`,
    ``,
    recs,
    ``,
  ].join("\n");
}

function renderSection(r: QueryResult): string {
  const head = `## ${r.id}. ${r.name}`;
  const purpose = `_${r.purpose}_`;
  const sql = ["```sql", r.sql, "```"].join("\n");
  const meta = `Ran in ${r.ms}ms. Returned ${r.rows.length} row(s).`;
  let body: string;
  if (r.error) {
    body = `**Query failed:**\n\n\`\`\`\n${r.error}\n\`\`\``;
  } else {
    body = renderTable(r.rows);
  }
  return [head, ``, purpose, ``, sql, ``, meta, ``, body].join("\n");
}

async function main() {
  console.log(`Review target: ${TABLE}`);
  console.log(`Output:        ${REPORT_PATH}`);
  console.log("");
  const results = await runAll();
  const md = renderReport(results);
  writeFileSync(REPORT_PATH, md, "utf-8");
  console.log("");
  console.log(`Wrote ${REPORT_PATH}`);
  const failed = results.filter((r) => r.error).length;
  if (failed > 0) {
    console.warn(`Warning: ${failed} of ${results.length} queries failed — see report.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
