/**
 * discover-globalcomix-campaign-names.ts
 *
 * One-shot read-only pull of DISTINCT campaign_name across the four
 * GlobalComix per-network spend tables. Used to validate the
 * campaign-classifier regex against the live name set and to refresh
 * the test fixture when patterns shift.
 *
 * Writes:
 *   tmp/globalcomix-campaign-names.json     full raw list per network
 *   tmp/globalcomix-classifier-coverage.md  human-readable summary of
 *                                            which names matched the
 *                                            classifier vs fell back
 *                                            to "Other"
 *
 * Run: npx tsx scripts/discover-globalcomix-campaign-names.ts
 *
 * The query is scoped to a small recent window (last 90 days) so we
 * sample names that actually run; ancient archived campaigns aren't
 * relevant for the classifier today. Bounded by BQ cost: a
 * SELECT DISTINCT campaign_name FROM <table> WHERE date >= ... scans
 * only two columns and is single-digit-cents per table.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

import { classifyCampaignName } from "../src/lib/analyst/campaign-classifier";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = process.env.BQ_DATASET ?? "yellowhead_prod";
const OUT_DIR = path.resolve(process.cwd(), "tmp");
const WINDOW_DAYS = 90;

// Same set as `bq-security.ts` multi-source config for GlobalComix.
// Apple is the only one with a usable campaign_name on the
// `No Breakdown` slice; the others store campaign_name on slices
// that aren't aggregable. The discovery still asks for the column
// on every table so we can see the coverage gap explicitly.
const TABLES: { table: string; network: string }[] = [
  { table: "dwh_fb2_globalcomix_adjust", network: "Meta" },
  { table: "dwh_google_ads_globalcomix_adjust", network: "Google" },
  { table: "dwh_tik_tok_globalcomix_adjust", network: "TikTok" },
  { table: "dwh_apple_globalcomix_adjust", network: "Apple Search Ads" },
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

async function fetchNames(
  bq: BigQuery,
  table: string,
): Promise<string[]> {
  const fq = `\`${PROJECT}.${DATASET}.${table}\``;
  const query = `
    SELECT DISTINCT campaign_name
    FROM ${fq}
    WHERE breakdown_type = 'No Breakdown'
      AND campaign_name IS NOT NULL
      AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
    ORDER BY campaign_name
  `;
  try {
    const [rows] = await bq.query({
      query,
      params: { days: WINDOW_DAYS },
      location: "US",
    });
    return rows
      .map((r) => (r as { campaign_name?: unknown }).campaign_name)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch (err) {
    // Some tables have campaign_name as NULL on the No Breakdown slice
    // (per the queries header in globalcomix-queries.ts). The DISTINCT
    // returns nothing rather than throwing for those, but a hard error
    // (auth, table missing) should propagate as an empty list with a
    // note in the markdown.
    console.warn(
      `[${table}] query failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bq = buildBq();

  const perNetwork: Record<string, string[]> = {};
  for (const { table, network } of TABLES) {
    process.stdout.write(`[${network}] querying ${table}... `);
    const names = await fetchNames(bq, table);
    process.stdout.write(`${names.length} names\n`);
    perNetwork[network] = names;
  }

  const allNames = Array.from(
    new Set(Object.values(perNetwork).flat()),
  ).sort();

  fs.writeFileSync(
    path.join(OUT_DIR, "globalcomix-campaign-names.json"),
    JSON.stringify({ perNetwork, allNames }, null, 2),
    "utf-8",
  );

  // Classifier-coverage report.
  const lines: string[] = [];
  lines.push(`# GlobalComix campaign-name coverage`);
  lines.push("");
  lines.push(
    `Pulled DISTINCT campaign_name across four per-network spend tables`,
  );
  lines.push(`for the last ${WINDOW_DAYS} days. Run as part of Phase 0.`);
  lines.push("");
  lines.push(`Total distinct names: **${allNames.length}**`);
  lines.push("");

  for (const network of Object.keys(perNetwork)) {
    const names = perNetwork[network];
    lines.push(`## ${network} (${names.length} distinct)`);
    lines.push("");
    if (names.length === 0) {
      lines.push(
        `_No campaign_name surfaced. Likely a table where the column is null on the No Breakdown slice (see globalcomix-queries.ts header for the rationale)._`,
      );
      lines.push("");
      continue;
    }
    lines.push("| Campaign name | family | geo | campaignType | platform | matched? |");
    lines.push("|---|---|---|---|---|---|");
    let matched = 0;
    for (const name of names) {
      const r = classifyCampaignName(name);
      const ok = r.family !== "Other";
      if (ok) matched += 1;
      lines.push(
        `| \`${name}\` | ${r.family} | ${r.geo} | ${r.campaignType} | ${r.platform} | ${ok ? "yes" : "**no**"} |`,
      );
    }
    lines.push("");
    lines.push(
      `**Match rate:** ${matched} / ${names.length} (${
        names.length ? Math.round((matched / names.length) * 100) : 0
      }%)`,
    );
    lines.push("");
  }

  // Aggregate the "no-match" names so a follow-up can decide whether
  // to extend the classifier or accept "Other" for these.
  const unmatched = allNames.filter(
    (n) => classifyCampaignName(n).family === "Other",
  );
  lines.push(`## Names that fell back to "Other" (${unmatched.length})`);
  lines.push("");
  if (unmatched.length === 0) {
    lines.push("_None — the classifier covers every live name._");
  } else {
    for (const n of unmatched) lines.push(`- \`${n}\``);
  }
  lines.push("");

  fs.writeFileSync(
    path.join(OUT_DIR, "globalcomix-classifier-coverage.md"),
    lines.join("\n"),
    "utf-8",
  );

  console.log(
    `\nDone. Wrote tmp/globalcomix-campaign-names.json and tmp/globalcomix-classifier-coverage.md`,
  );
  console.log(
    `Match rate: ${allNames.length - unmatched.length} / ${allNames.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
