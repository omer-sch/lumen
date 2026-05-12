/**
 * discover-easy-client.ts
 * Correctly identifies the easiest non-agent client to onboard into Lumen.
 *
 * Strategy: pull ALL table names from yellowhead_prod, then use GlobalComix
 * as the reference — find its exact table suffixes, then look for other
 * clients that share the same suffix patterns with the most platform coverage.
 *
 * Run: npx tsx scripts/discover-easy-client.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function buildBqClient(): BigQuery {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (b64) {
    const credentials = JSON.parse(
      Buffer.from(b64, "base64").toString("utf-8"),
    );
    return new BigQuery({
      projectId: process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery",
      credentials,
    });
  }
  return new BigQuery({
    projectId: process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery",
  });
}

// Known platform tokens that appear inside table names
const PLATFORM_TOKENS: Record<string, string> = {
  fb2:        "Meta",
  facebook:   "Meta",
  tiktok:     "TikTok",
  adwords:    "Google",
  google:     "Google",
  appsflyer:  "AppsFlyer",
  adjust:     "Adjust",
  apple:      "Apple",
  twitter:    "Twitter",
  snapchat:   "Snapchat",
  kochava:    "Kochava",
  singular:   "Singular",
  apptweak:   "AppTweak",
  reddit:     "Reddit",
  linkedin:   "LinkedIn",
  pinterest:  "Pinterest",
};

// Layers we care about (production layers only)
const PRODUCTION_LAYERS = new Set(["ods", "dwh", "uni", "pre", "v", "bs"]);

// Noise suffixes — these are table categories, not client names
const NOISE_SUFFIXES = new Set([
  "ads", "creatives", "insight", "general", "web", "cohort", "report",
  "aggregated", "stats", "daily", "monthly", "weekly", "summary",
  "events", "installs", "revenue", "spend", "campaign", "adset",
  "creative", "keyword", "organic", "paid", "all", "combined",
  "merged", "unified", "normalized", "clean", "final", "latest",
  "history", "archive", "backup", "test", "dev", "tmp", "qa",
  "ios14", "ios", "android", "web", "app", "mobile", "desktop",
]);

async function run() {
  const bq = buildBqClient();
  const project = "yellowhead-visionbi-rivery";
  const dataset = "yellowhead_prod";
  const lines: string[] = [];

  const say = (s: string) => { console.log(s); lines.push(s); };

  say(`# Lumen — Easy Client Discovery (v2)`);
  say(`Generated: ${new Date().toISOString()}\n`);

  // ── Step 1: Pull all table names ─────────────────────────────────────────
  say(`## Step 1 — Load all table names from yellowhead_prod\n`);

  const [allRows] = await bq.query({
    query: `
      SELECT table_name
      FROM \`${project}.${dataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE NOT REGEXP_CONTAINS(
        table_name,
        r'(^tmp|^qa|^bkp|^test|^dev|_bkp$|_test$|_old$|_backup$|_tmp$)'
      )
      ORDER BY table_name
    `,
    location: "US",
  });

  const allNames: string[] = (allRows as any[]).map((r) => r.table_name as string);
  say(`Total tables/views: ${allNames.length}`);

  // ── Step 2: Find GlobalComix tables as our reference ────────────────────
  say(`\n## Step 2 — GlobalComix reference tables (our gold standard)\n`);

  const gcTables = allNames.filter((n) => n.endsWith("_globalcomix") || n.includes("_globalcomix_") || n.includes("globalcomix"));
  say(`Found ${gcTables.length} GlobalComix tables:\n`);
  say(`| table_name |`);
  say(`|---|`);
  for (const t of gcTables) say(`| ${t} |`);

  // Extract the platform tokens that GlobalComix has
  const gcPlatforms = new Set<string>();
  for (const t of gcTables) {
    for (const token of Object.keys(PLATFORM_TOKENS)) {
      if (t.includes(`_${token}_`) || t.includes(`_${token}$`) || new RegExp(`_${token}(_|$)`).test(t)) {
        gcPlatforms.add(token);
      }
    }
  }
  say(`\nGlobalComix platform tokens found: ${[...gcPlatforms].join(", ")}`);

  // ── Step 3: Find all client slugs by looking at table name SUFFIXES ──────
  say(`\n## Step 3 — Extract all client slugs from table name suffixes\n`);

  // Strategy: for each table that contains a known platform token,
  // the client slug is the part AFTER the platform token.
  // e.g. dwh_fb2_globalcomix → platform=fb2, client=globalcomix
  //      ods_appsflyer_installs_metalstorm → platform=appsflyer, client=metalstorm (last token)
  //      pre_fb2_insight_general_wwe → platform=fb2, client=wwe (last token after noise)

  const clientPlatformMap: Record<string, Set<string>> = {};
  const clientTableMap: Record<string, string[]> = {};

  for (const name of allNames) {
    // Skip noise
    if (/^(tmp|qa|bkp|test|dev|yh_bq|yellowhead_bkp|yellowhead_train)/.test(name)) continue;

    const parts = name.split("_");
    const layer = parts[0];
    if (!PRODUCTION_LAYERS.has(layer)) continue;

    // Find which platform token appears in this table name
    let platformToken: string | null = null;
    let platformIdx = -1;
    for (let i = 1; i < parts.length; i++) {
      if (PLATFORM_TOKENS[parts[i]]) {
        platformToken = parts[i];
        platformIdx = i;
        break;
      }
    }
    if (!platformToken || platformIdx < 0) continue;

    // The client slug is the LAST token(s) after the platform.
    // We try last 1 token first, then last 2 tokens joined.
    // We skip slugs that are in the noise list.
    const afterPlatform = parts.slice(platformIdx + 1);
    if (afterPlatform.length === 0) continue;

    // Take the last token as the primary candidate slug
    const lastToken = afterPlatform[afterPlatform.length - 1];
    const lastTwoTokens = afterPlatform.slice(-2).join("_");

    // Pick the slug: prefer last-two if last-one is noise
    let slug = lastToken;
    if (NOISE_SUFFIXES.has(lastToken) && afterPlatform.length >= 2) {
      slug = lastTwoTokens;
    }

    // Skip slugs that are clearly not client names
    if (NOISE_SUFFIXES.has(slug)) continue;
    if (slug.length <= 1) continue;
    if (/^\d+$/.test(slug)) continue; // pure numbers

    if (!clientPlatformMap[slug]) {
      clientPlatformMap[slug] = new Set();
      clientTableMap[slug] = [];
    }
    clientPlatformMap[slug].add(platformToken);
    clientTableMap[slug].push(name);
  }

  // ── Step 4: Find clients with Meta + AppsFlyer (minimum viable UA) ───────
  say(`## Step 4 — Candidates: have Meta (fb2) AND AppsFlyer\n`);

  const viable = Object.entries(clientPlatformMap)
    .filter(([slug, platforms]) => {
      const hasMeta = platforms.has("fb2") || platforms.has("facebook");
      const hasAF   = platforms.has("appsflyer");
      const notAgent = !["globalcomix", "playw3"].includes(slug);
      return hasMeta && hasAF && notAgent;
    })
    .sort((a, b) => a[1].size - b[1].size); // fewest platforms first = easiest

  if (viable.length === 0) {
    say(`No viable candidates found. See Step 5 for partial-coverage candidates.`);
  } else {
    say(`| client_slug | platform_count | platforms | sample_tables |`);
    say(`|---|---|---|---|`);
    for (const [slug, platforms] of viable) {
      const sample = (clientTableMap[slug] ?? []).slice(0, 3).join(", ");
      say(`| ${slug} | ${platforms.size} | ${[...platforms].join(", ")} | ${sample} |`);
    }
  }

  // ── Step 5: Partial — Meta only (fallback if no viable found) ────────────
  say(`\n## Step 5 — Partial candidates: Meta only (no AppsFlyer, installs will be null)\n`);

  const metaOnly = Object.entries(clientPlatformMap)
    .filter(([slug, platforms]) => {
      const hasMeta = platforms.has("fb2") || platforms.has("facebook");
      const hasAF   = platforms.has("appsflyer");
      const notAgent = !["globalcomix", "playw3"].includes(slug);
      return hasMeta && !hasAF && notAgent;
    })
    .sort((a, b) => a[1].size - b[1].size);

  say(`| client_slug | platform_count | platforms |`);
  say(`|---|---|---|`);
  for (const [slug, platforms] of metaOnly.slice(0, 20)) {
    say(`| ${slug} | ${platforms.size} | ${[...platforms].join(", ")} |`);
  }

  // ── Step 6: Agent layer inventory ────────────────────────────────────────
  say(`\n## Step 6 — Existing agent layer objects\n`);

  const [agentRows] = await bq.query({
    query: `
      SELECT table_name, table_type
      FROM \`${project}.${dataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE REGEXP_CONTAINS(table_name, r'_agent$|^v_agent_')
      ORDER BY table_name
    `,
    location: "US",
  });

  say(`| table_name | type |`);
  say(`|---|---|`);
  for (const row of agentRows as any[]) {
    say(`| ${(row as any).table_name} | ${(row as any).table_type} |`);
  }

  // ── Step 7: Recommendation ───────────────────────────────────────────────
  say(`\n## Step 7 — Recommendation\n`);

  const topViable = viable[0];
  const topMetaOnly = metaOnly[0];

  if (topViable) {
    const [slug, platforms] = topViable;
    say(`**Best pick: \`${slug}\`**`);
    say(`- Platforms: ${[...platforms].join(", ")} (${platforms.size} total)`);
    say(`- Has Meta + AppsFlyer: installs and CPI will be real`);
    say(`- Tables: ${(clientTableMap[slug] ?? []).slice(0, 5).join(", ")}`);
    say(`- Implementation path: UNION dwh_fb2_${slug} + appsflyer data, normalize to DashboardData shape`);
  } else if (topMetaOnly) {
    const [slug, platforms] = topMetaOnly;
    say(`**Best available (Meta only): \`${slug}\`**`);
    say(`- Platforms: ${[...platforms].join(", ")}`);
    say(`- WARNING: no AppsFlyer — installs will be NULL, same issue as Playw3`);
    say(`- Tables: ${(clientTableMap[slug] ?? []).slice(0, 5).join(", ")}`);
  } else {
    say(`No candidates found. The slug extraction heuristic may need tuning — inspect the raw table list manually.`);
  }

  // ── Step 8: Show top-10 table names for the recommended client ───────────
  const picked = topViable?.[0] ?? topMetaOnly?.[0];
  if (picked) {
    say(`\n## Step 8 — All tables for recommended client \`${picked}\`\n`);
    say(`| table_name |`);
    say(`|---|`);
    for (const t of (clientTableMap[picked] ?? []).sort()) {
      say(`| ${t} |`);
    }
  }

  // Write report
  const outPath = path.resolve(process.cwd(), "easy_client_discovery.md");
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`\nReport written to ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
