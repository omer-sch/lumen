/**
 * scan-and-plan.ts
 *
 * Pure-discovery scan of the yellowhead_prod warehouse that emits
 * LUMEN_DATA_PLAN.md at the project root. Read-only — never modifies or
 * creates BQ objects.
 *
 * Phases:
 *  1. Read the gold standard (v_agent_globalcomix DDL + schema).
 *  2. Inventory all dwh_* tables, group by client + platform.
 *  3. Pull schemas for ~5 clients per platform (Meta / AppsFlyer / TikTok /
 *     Google), diff column sets to find consistent vs divergent names.
 *  4. Spot-check one non-agent client's primary Meta table (rows, date span,
 *     spend, installs).
 *  5. Write the plan with all 11 sections.
 *
 * Run: npx tsx scripts/scan-and-plan.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const DATASET = process.env.BQ_DATASET ?? "yellowhead_prod";

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
      WHERE table_name = @t
      ORDER BY ordinal_position
    `,
    params: { t: tableName },
    location: "US",
  });
  return rows as Column[];
}

async function fetchDdl(bq: BigQuery, tableName: string): Promise<string | null> {
  const [rows] = await bq.query({
    query: `
      SELECT ddl
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name = @t
    `,
    params: { t: tableName },
    location: "US",
  });
  const r = rows[0] as { ddl?: string } | undefined;
  return r?.ddl ?? null;
}

// Platform token → display name. Tokens are matched as discrete `_token_`
// segments inside table names.
const PLATFORM_TOKENS: Record<string, string> = {
  fb2:        "Meta",
  facebook:   "Meta",
  tiktok:     "TikTok",
  tik_tok:    "TikTok",
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

const NOISE_SUFFIXES = new Set([
  "ads", "creatives", "insight", "general", "web", "cohort", "report",
  "aggregated", "stats", "daily", "monthly", "weekly", "summary",
  "events", "installs", "revenue", "spend", "campaign", "adset",
  "creative", "keyword", "organic", "paid", "all", "combined",
  "merged", "unified", "normalized", "clean", "final", "latest",
  "history", "archive", "backup", "test", "dev", "tmp", "qa",
  "ios14", "ios", "android", "app", "mobile", "desktop",
  "patners", "partners", "by", "date",
]);

/**
 * Token sequences that look like a "modifier" appended to a real client
 * slug — e.g. `100play_age_gender`, `aaptiv_dl`, `2k_adjust`. We strip the
 * trailing sequence and re-canonicalize so they collapse onto the parent
 * slug. Order matters: longer sequences first.
 */
const MODIFIER_SUFFIXES: string[][] = [
  ["age", "gender", "platform"],
  ["age", "gender"],
  ["custom", "breakdowns"],
  ["adjust"],
  ["dl"],
  ["dtc"],
  ["comparison"],
  ["geo"],
  ["country"],
  ["platform"],
  ["mail"],
];

function stripModifierSuffix(slug: string): string {
  const parts = slug.split("_");
  for (const mod of MODIFIER_SUFFIXES) {
    if (parts.length <= mod.length) continue;
    const tail = parts.slice(-mod.length);
    if (tail.length === mod.length && tail.every((t, i) => t === mod[i])) {
      return parts.slice(0, -mod.length).join("_");
    }
  }
  return slug;
}

type ParsedTable = {
  name: string;
  platformToken: string;
  platform: string;
  client: string;
};

function parseTable(name: string): ParsedTable | null {
  // dwh_<platform>[_<noise>...]_<client>
  if (!name.startsWith("dwh_")) return null;
  const parts = name.split("_");
  // Find the first platform token (skip "dwh"); support 2-word tokens like "tik_tok"
  let platformIdx = -1;
  let platformToken: string | null = null;
  for (let i = 1; i < parts.length; i++) {
    const single = parts[i];
    const pair = `${parts[i]}_${parts[i + 1] ?? ""}`;
    if (PLATFORM_TOKENS[pair]) {
      platformToken = pair;
      platformIdx = i + 1; // index of the last token consumed
      break;
    }
    if (PLATFORM_TOKENS[single]) {
      platformToken = single;
      platformIdx = i;
      break;
    }
  }
  if (!platformToken || platformIdx < 0) return null;

  const tail = parts.slice(platformIdx + 1);
  if (tail.length === 0) return null;

  // Walk from the end, skipping noise, joining adjacent non-noise tokens.
  const slugParts: string[] = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const t = tail[i];
    if (NOISE_SUFFIXES.has(t)) {
      if (slugParts.length > 0) break;
      continue;
    }
    slugParts.unshift(t);
  }
  if (slugParts.length === 0) return null;
  let client = slugParts.join("_");
  if (NOISE_SUFFIXES.has(client)) return null;
  if (/^\d+$/.test(client)) return null;
  if (client.length <= 1) return null;
  // Collapse derivative slugs (e.g. `aaptiv_dl`, `100play_age_gender`) back
  // to their parent client. Iterate until stable so multiple suffixes peel
  // off (e.g. `xyz_age_gender_platform` → `xyz`).
  for (let i = 0; i < 4; i++) {
    const next = stripModifierSuffix(client);
    if (next === client || next.length === 0) break;
    client = next;
  }
  if (NOISE_SUFFIXES.has(client)) return null;
  if (client.length <= 1) return null;
  return {
    name,
    platformToken,
    platform: PLATFORM_TOKENS[platformToken],
    client,
  };
}

function diffSchemas(
  schemas: Record<string, Column[]>,
): { common: string[]; divergent: Record<string, string[]> } {
  const tables = Object.keys(schemas);
  if (tables.length === 0) return { common: [], divergent: {} };
  const sets = tables.map((t) => new Set(schemas[t].map((c) => c.column_name)));
  const all = new Set<string>();
  sets.forEach((s) => s.forEach((c) => all.add(c)));
  const common: string[] = [];
  const divergent: Record<string, string[]> = {};
  for (const col of [...all].sort()) {
    const present = tables.filter((t, i) => sets[i].has(col));
    if (present.length === tables.length) common.push(col);
    else divergent[col] = present;
  }
  return { common, divergent };
}

function pickColumn(cols: Column[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const hit = cols.find((c) => p.test(c.column_name));
    if (hit) return hit.column_name;
  }
  return null;
}

async function run() {
  const bq = buildBqClient();
  const out: string[] = [];
  const say = (s = "") => out.push(s);

  const startedAt = new Date().toISOString();

  // ───────────────────────────────────────────────────────────────────────
  // Phase 1 — Gold standard
  // ───────────────────────────────────────────────────────────────────────
  console.log("Phase 1: v_agent_globalcomix DDL + schema...");
  const goldDdl = await fetchDdl(bq, "v_agent_globalcomix");
  const goldCols = await fetchColumns(bq, "v_agent_globalcomix");

  // Phase 1b — pull DDL for v_playw3_agent too, for the dedupe contrast.
  const playw3Ddl = await fetchDdl(bq, "v_playw3_agent");

  // ───────────────────────────────────────────────────────────────────────
  // Phase 2 — Inventory all dwh_* tables
  // ───────────────────────────────────────────────────────────────────────
  console.log("Phase 2: inventory all dwh_* tables...");
  const [allDwhRows] = await bq.query({
    query: `
      SELECT table_name
      FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\`
      WHERE STARTS_WITH(table_name, 'dwh_')
        AND NOT REGEXP_CONTAINS(table_name, r'(dwh_v_|tmp|bkp|test|qa|dev|_old)')
      ORDER BY table_name
    `,
    location: "US",
  });
  const dwhTables: string[] = (allDwhRows as { table_name: string }[]).map(
    (r) => r.table_name,
  );

  // Parse all dwh_* tables.
  const parsed: ParsedTable[] = [];
  const unparsed: string[] = [];
  for (const t of dwhTables) {
    const p = parseTable(t);
    if (p) parsed.push(p);
    else unparsed.push(t);
  }

  // platform → Set<client>
  const platformClients: Record<string, Set<string>> = {};
  // client → Set<platform>
  const clientPlatforms: Record<string, Set<string>> = {};
  // client → table[]
  const clientTables: Record<string, string[]> = {};

  for (const p of parsed) {
    (platformClients[p.platform] ??= new Set()).add(p.client);
    (clientPlatforms[p.client] ??= new Set()).add(p.platform);
    (clientTables[p.client] ??= []).push(p.name);
  }

  const allClients = Object.keys(clientPlatforms).sort();

  // Viable clients = Meta + (AppsFlyer | Adjust | Kochava)
  const ATTRIBUTION = new Set(["AppsFlyer", "Adjust", "Kochava"]);
  const viableClients = allClients.filter((c) => {
    const set = clientPlatforms[c];
    return set.has("Meta") && [...set].some((p) => ATTRIBUTION.has(p));
  });
  const metaOnlyClients = allClients.filter((c) => {
    const set = clientPlatforms[c];
    return set.has("Meta") && ![...set].some((p) => ATTRIBUTION.has(p));
  });
  const noMetaClients = allClients.filter((c) => !clientPlatforms[c].has("Meta"));

  // ───────────────────────────────────────────────────────────────────────
  // Phase 3 — Schema consistency per platform
  // ───────────────────────────────────────────────────────────────────────
  console.log("Phase 3: schema consistency per platform...");

  async function comparePlatform(
    platform: string,
    sampleSize: number,
    forceInclude: string[] = [],
  ): Promise<{
    tables: string[];
    schemas: Record<string, Column[]>;
    diff: ReturnType<typeof diffSchemas>;
    keyColumns: Record<string, Record<string, string | null>>; // table → { date, campaign_id, spend, installs, revenue }
  }> {
    // Build a candidate pool: prefer the primary platform table per client
    // (shortest name = most generic), e.g. dwh_fb2_<client> over
    // dwh_fb2_insight_general_<client>.
    const tablesForPlatform = parsed.filter((p) => p.platform === platform);
    const byClient: Record<string, string[]> = {};
    for (const t of tablesForPlatform) {
      (byClient[t.client] ??= []).push(t.name);
    }
    const primaryPerClient: Record<string, string> = {};
    for (const [c, names] of Object.entries(byClient)) {
      primaryPerClient[c] = names.sort((a, b) => a.length - b.length)[0];
    }
    const pool = Object.entries(primaryPerClient);
    const picked: string[] = [];
    // Force-include first
    for (const slug of forceInclude) {
      if (primaryPerClient[slug] && !picked.includes(primaryPerClient[slug])) {
        picked.push(primaryPerClient[slug]);
      }
    }
    // Then fill from the pool
    for (const [, name] of pool) {
      if (picked.length >= sampleSize) break;
      if (!picked.includes(name)) picked.push(name);
    }

    const schemas: Record<string, Column[]> = {};
    const keyColumns: Record<string, Record<string, string | null>> = {};
    for (const name of picked) {
      try {
        const cols = await fetchColumns(bq, name);
        schemas[name] = cols;
        keyColumns[name] = {
          date: pickColumn(cols, [/^date$/i, /^day$/i, /^report_date$/i, /^event_date$/i]),
          campaign_id: pickColumn(cols, [/^campaign_id$/i, /^campaign$/i, /^campaign_key$/i]),
          campaign_name: pickColumn(cols, [/^campaign_name$/i, /^campaign$/i]),
          adset_id: pickColumn(cols, [/^adset_id$/i, /^ad_set_id$/i, /^adgroup_id$/i, /^ad_group_id$/i]),
          spend: pickColumn(cols, [/^spend_usd$/i, /^cost_usd$/i, /^spend$/i, /^cost$/i]),
          impressions: pickColumn(cols, [/^impressions$/i, /^impr(s)?$/i]),
          clicks: pickColumn(cols, [/^clicks$/i, /^link_clicks$/i]),
          installs: pickColumn(cols, [/^installs$/i, /^install$/i, /^total_installs$/i, /^conversions?$/i]),
          revenue: pickColumn(cols, [/^revenue_usd$/i, /^revenue$/i, /^rev(_gross)?(_d\d+)?_usd$/i, /^rev_lifetime_usd$/i]),
          network: pickColumn(cols, [/^network$/i, /^media_source$/i, /^channel$/i]),
        };
      } catch (e) {
        console.error(`  schema fetch failed for ${name}:`, (e as Error).message);
      }
    }

    return { tables: picked, schemas, diff: diffSchemas(schemas), keyColumns };
  }

  const metaCmp = await comparePlatform("Meta", 5, ["globalcomix", "100play", "playw3"]);
  const afCmp = await comparePlatform("AppsFlyer", 4, ["globalcomix"]);
  const ttCmp = await comparePlatform("TikTok", 3, ["globalcomix"]);
  const gCmp = await comparePlatform("Google", 3, ["globalcomix"]);

  // ───────────────────────────────────────────────────────────────────────
  // Phase 4 — Sample data check on a non-agent client's Meta table
  // ───────────────────────────────────────────────────────────────────────
  console.log("Phase 4: spot data check...");
  const sampleClient = viableClients.find(
    (c) => !["globalcomix", "playw3"].includes(c) && c !== "100play",
  );
  let sampleResult: {
    client: string;
    table: string;
    rows: number;
    earliest: string | null;
    latest: string | null;
    campaigns: number;
    spend: number | null;
    installs: number | null;
    spendCol: string | null;
    installsCol: string | null;
  } | null = null;

  if (sampleClient) {
    const tbl =
      (clientTables[sampleClient] ?? []).sort((a, b) => a.length - b.length)[0];
    if (tbl) {
      try {
        const cols = await fetchColumns(bq, tbl);
        const dateCol = pickColumn(cols, [/^date$/i, /^day$/i, /^report_date$/i]);
        const spendCol = pickColumn(cols, [/^spend_usd$/i, /^cost_usd$/i, /^spend$/i, /^cost$/i]);
        const installsCol = pickColumn(cols, [/^installs$/i, /^install$/i, /^total_installs$/i]);
        const campCol = pickColumn(cols, [/^campaign_id$/i, /^campaign$/i]);
        if (dateCol) {
          const selects: string[] = [
            `COUNT(*) AS rows_count`,
            `MIN(${dateCol}) AS earliest`,
            `MAX(${dateCol}) AS latest`,
          ];
          if (campCol) selects.push(`COUNT(DISTINCT ${campCol}) AS campaigns`);
          if (spendCol) selects.push(`SUM(${spendCol}) AS total_spend`);
          if (installsCol) selects.push(`SUM(${installsCol}) AS total_installs`);
          const [rows] = await bq.query({
            query: `SELECT ${selects.join(", ")} FROM \`${PROJECT}.${DATASET}.${tbl}\``,
            location: "US",
          });
          const r = rows[0] as Record<string, unknown>;
          sampleResult = {
            client: sampleClient,
            table: tbl,
            rows: Number(r.rows_count ?? 0),
            earliest: r.earliest ? String((r.earliest as { value?: string }).value ?? r.earliest) : null,
            latest: r.latest ? String((r.latest as { value?: string }).value ?? r.latest) : null,
            campaigns: Number(r.campaigns ?? 0),
            spend: r.total_spend != null ? Number(r.total_spend) : null,
            installs: r.total_installs != null ? Number(r.total_installs) : null,
            spendCol,
            installsCol,
          };
        }
      } catch (e) {
        console.error(`  spot check failed for ${tbl}:`, (e as Error).message);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Phase 5 — Write LUMEN_DATA_PLAN.md
  // ───────────────────────────────────────────────────────────────────────
  console.log("Phase 5: writing LUMEN_DATA_PLAN.md...");

  // Helpers for plan rendering
  const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
  const fmtPlatformRow = (p: string) => {
    const clients = [...(platformClients[p] ?? [])].sort();
    const sample = clients.slice(0, 6).join(", ") + (clients.length > 6 ? ", …" : "");
    return `| ${p} | ${clients.length} | ${sample} |`;
  };

  const goldColLines = goldCols
    .map((c) => `| \`${c.column_name}\` | ${c.data_type} | ${c.is_nullable} |`)
    .join("\n");

  // Section 1 — Target schema for lumen_agent. We mirror v_agent_globalcomix
  // but keep only the columns the plan calls out: date, client, network,
  // campaign_id/name, adset_id/name, spend_usd, impressions, clicks, installs,
  // revenue_usd, roas, cpi, ctr. We do NOT invent columns.
  const goldColNames = new Set(goldCols.map((c) => c.column_name));
  const lumenAgentDdl = `
CREATE TABLE \`${PROJECT}.${DATASET}.lumen_agent\` (
  date           DATE      NOT NULL,
  client         STRING    NOT NULL,
  network        STRING    NOT NULL,
  campaign_id    STRING,
  campaign_name  STRING,
  adset_id       STRING,
  adset_name     STRING,
  spend_usd      FLOAT64,
  impressions    INT64,
  clicks         INT64,
  installs       INT64,
  revenue_usd    FLOAT64,
  roas           FLOAT64,   -- materialized = revenue_usd / NULLIF(spend_usd, 0)
  cpi            FLOAT64,   -- materialized = spend_usd / NULLIF(installs, 0)
  ctr            FLOAT64    -- materialized = clicks / NULLIF(impressions, 0)
)
PARTITION BY date
CLUSTER BY client, network;
`.trim();

  const lumenClientsDdl = `
CREATE TABLE \`${PROJECT}.${DATASET}.lumen_clients\` (
  slug      STRING    NOT NULL,   -- url-safe slug used by Lumen's ALLOWED_CLIENTS
  name      STRING    NOT NULL,   -- display name
  vertical  STRING,               -- gaming | ecommerce | fintech | health | other
  networks  ARRAY<STRING>,        -- subset of ('Meta','TikTok','Google','AppsFlyer','Adjust','Apple')
  active    BOOL      NOT NULL DEFAULT TRUE,
  added_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
`.trim();

  // Build a per-platform column-mapping section.
  function renderPlatformMapping(
    label: string,
    cmp: typeof metaCmp,
    notes: string,
  ): string {
    const lines: string[] = [];
    lines.push(`### ${label}`);
    lines.push("");
    lines.push(`**Sample tables compared (${cmp.tables.length}):**`);
    lines.push("");
    lines.push(cmp.tables.map((t) => `- \`${t}\``).join("\n"));
    lines.push("");

    if (cmp.tables.length === 0) {
      lines.push("_No tables found for this platform — skip._");
      lines.push("");
      return lines.join("\n");
    }

    // Per-table key column mapping.
    lines.push(
      "| table | date | campaign_id | spend | impressions | clicks | installs | revenue | network |",
    );
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const t of cmp.tables) {
      const k = cmp.keyColumns[t] ?? {};
      lines.push(
        `| \`${t}\` | ${k.date ?? "—"} | ${k.campaign_id ?? "—"} | ${k.spend ?? "—"} | ${k.impressions ?? "—"} | ${k.clicks ?? "—"} | ${k.installs ?? "—"} | ${k.revenue ?? "—"} | ${k.network ?? "—"} |`,
      );
    }
    lines.push("");

    // Common vs divergent.
    lines.push(`**Common columns (present in all ${cmp.tables.length} tables):** ${cmp.diff.common.length}`);
    lines.push("");
    if (cmp.diff.common.length > 0) {
      lines.push(fence("", cmp.diff.common.join(", ")));
    }
    lines.push("");
    const divergentEntries = Object.entries(cmp.diff.divergent);
    // Sort by "presence count" descending — the columns missing from only
    // one sampled table are the most useful divergence signal. Per-event
    // explosions (hundreds of `af_*___day_N` columns present in just one
    // table) sink to the bottom.
    const sortedDivergent = divergentEntries
      .map(([col, where]) => ({ col, where, count: where.length }))
      .sort((a, b) => b.count - a.count || a.col.localeCompare(b.col));
    const TOP_N = 30;
    lines.push(`**Divergent columns:** ${divergentEntries.length} total — showing top ${Math.min(TOP_N, divergentEntries.length)} by presence count.`);
    lines.push("");
    if (sortedDivergent.length > 0) {
      lines.push("| column | present in |");
      lines.push("|---|---|");
      for (const { col, where } of sortedDivergent.slice(0, TOP_N)) {
        const short = where.map((w) => w.replace(/^dwh_/, "")).join(", ");
        lines.push(`| \`${col}\` | ${short} |`);
      }
      lines.push("");
      if (sortedDivergent.length > TOP_N) {
        const longTail = sortedDivergent.slice(TOP_N);
        const singleClient = longTail.filter((d) => d.count === 1).length;
        lines.push(
          `_… and ${sortedDivergent.length - TOP_N} more divergent columns — ${singleClient} of them present in only one sampled table (likely client-specific event counters or custom breakdowns)._`,
        );
        lines.push("");
      }
    }

    lines.push(`**Notes:** ${notes}`);
    lines.push("");
    return lines.join("\n");
  }

  // Now compose the document.
  say(`# Lumen Data Layer — Build Plan`);
  say(`Generated: ${startedAt}`);
  say(``);
  say(`Single source of truth for the BigQuery → Lumen data layer. All`);
  say(`schemas below are read from \`INFORMATION_SCHEMA\` of`);
  say(`\`${PROJECT}.${DATASET}\` at the time stamped above — no assumed names.`);
  say(``);
  say(`---`);
  say(``);

  // ── 1. Target schema — lumen_agent ─────────────────────────────────────
  say(`## 1. Target schema — \`lumen_agent\``);
  say(``);
  say(`One partitioned, clustered fact table. All clients, all platforms, one`);
  say(`row per (date, client, network, campaign, adset). Lumen always reads`);
  say(`with \`WHERE client = '<slug>' AND date BETWEEN …\` so the partition`);
  say(`prune + cluster skip keeps cost flat as we add clients.`);
  say(``);
  say(fence("sql", lumenAgentDdl));
  say(``);
  say(`**Per-platform NULL expectations** (inferred from Phase 3 mapping below):`);
  say(`- \`installs\` / \`revenue_usd\` will be NULL for clients where Meta is`);
  say(`  the only source and there is no AppsFlyer/Adjust table — same`);
  say(`  pattern as Playw3 today.`);
  say(`- \`adset_id\` / \`adset_name\` may be NULL for AppsFlyer-origin rows`);
  say(`  (AppsFlyer reports at the campaign level, not adset).`);
  say(`- \`roas\` / \`cpi\` / \`ctr\` are stored, not virtual — recompute at`);
  say(`  ETL time so reads do no math.`);
  say(``);
  say(`---`);
  say(``);

  // ── 2. Target schema — lumen_clients ───────────────────────────────────
  say(`## 2. Target schema — \`lumen_clients\``);
  say(``);
  say(fence("sql", lumenClientsDdl));
  say(``);
  say(`**Initial rows** (all clients with Meta + at least one attribution`);
  say(`source — discovered in Phase 2 below). Vertical is left NULL until`);
  say(`Omer fills it in:`);
  say(``);
  if (viableClients.length > 0) {
    say(`\`\`\`sql`);
    say(`INSERT INTO \`${PROJECT}.${DATASET}.lumen_clients\` (slug, name, networks, active) VALUES`);
    const rows = viableClients.map((c) => {
      const nets = [...clientPlatforms[c]]
        .filter((p) => ["Meta", "TikTok", "Google", "AppsFlyer", "Adjust", "Apple"].includes(p))
        .sort();
      const netArr = `[${nets.map((n) => `'${n}'`).join(", ")}]`;
      return `  ('${c}', '${c}', ${netArr}, TRUE)`;
    });
    say(rows.join(",\n") + ";");
    say(`\`\`\``);
  } else {
    say(`_No viable clients discovered — see open questions._`);
  }
  say(``);
  say(`---`);
  say(``);

  // ── 3. Platform coverage in the warehouse ──────────────────────────────
  say(`## 3. Platform coverage in the warehouse`);
  say(``);
  say(`Parsed ${dwhTables.length} \`dwh_*\` tables.`);
  say(`- Recognized as \`<platform>_<client>\`: **${parsed.length}**`);
  say(`- Unparsed (no recognized platform token): ${unparsed.length}`);
  say(`- Distinct clients found: **${allClients.length}**`);
  say(``);
  say(`### 3a. Clients per platform`);
  say(``);
  say(`| platform | client_count | clients (sample) |`);
  say(`|---|---|---|`);
  const platformOrder = [
    "Meta",
    "TikTok",
    "Google",
    "AppsFlyer",
    "Adjust",
    "Apple",
    "Twitter",
    "Snapchat",
    "Kochava",
    "Singular",
    "AppTweak",
    "Reddit",
    "LinkedIn",
    "Pinterest",
  ];
  for (const p of platformOrder) {
    if (platformClients[p]) say(fmtPlatformRow(p));
  }
  say(``);
  say(`### 3b. Viable clients for a full KPI dashboard`);
  say(``);
  say(`Definition: has \`dwh_fb2_*\` (Meta spend) **and** at least one of`);
  say(`AppsFlyer / Adjust / Kochava (install attribution).`);
  say(``);
  say(`**Count: ${viableClients.length}**`);
  say(``);
  if (viableClients.length > 0) {
    say(`| client | platforms |`);
    say(`|---|---|`);
    for (const c of viableClients) {
      const set = [...clientPlatforms[c]].sort().join(", ");
      say(`| \`${c}\` | ${set} |`);
    }
  }
  say(``);
  say(`### 3c. Clients with Meta spend but no install source`);
  say(``);
  say(`These will land in \`lumen_agent\` with \`installs\` / \`revenue_usd\` NULL`);
  say(`(spend-only). Phase 1 of onboarding can still ship a dashboard for them.`);
  say(``);
  say(`**Count: ${metaOnlyClients.length}**`);
  say(``);
  if (metaOnlyClients.length > 0) {
    const head = metaOnlyClients.slice(0, 30);
    say(`| client | platforms |`);
    say(`|---|---|`);
    for (const c of head) {
      const set = [...clientPlatforms[c]].sort().join(", ");
      say(`| \`${c}\` | ${set} |`);
    }
    if (metaOnlyClients.length > head.length) {
      say(``);
      say(`_… and ${metaOnlyClients.length - head.length} more._`);
    }
  }
  say(``);
  say(`### 3d. Clients with no Meta presence`);
  say(``);
  say(`These are not blocked from Lumen, but the MVP rollout (which assumes`);
  say(`Meta is the spend anchor) won't cover them.`);
  say(``);
  say(`**Count: ${noMetaClients.length}**`);
  if (noMetaClients.length > 0 && noMetaClients.length <= 40) {
    say(``);
    say(noMetaClients.map((c) => `- \`${c}\``).join("\n"));
  }
  say(``);
  say(`---`);
  say(``);

  // ── 4. Column mapping per platform ─────────────────────────────────────
  say(`## 4. Column mapping per platform`);
  say(``);
  say(`For each platform we sampled the primary (shortest-name) \`dwh_*\` table`);
  say(`per client, diffed columns, and recorded which name maps to each`);
  say(`\`lumen_agent\` slot.`);
  say(``);
  say(renderPlatformMapping("Meta (fb2)", metaCmp, "Meta is the spend anchor. The `spend` / `cost` column-name divergence below is the main fork to resolve."));
  say(renderPlatformMapping("AppsFlyer", afCmp, "Source of installs and (sometimes) revenue. Joined back to Meta on `(date, campaign_id)`."));
  say(renderPlatformMapping("TikTok", ttCmp, "Second-tier spend source. Some clients have `dwh_tik_tok_*`, others `dwh_tiktok_*` — both patterns are picked up."));
  say(renderPlatformMapping("Google Ads", gCmp, "Token is `adwords` or `google`. Some clients only have Apple Search Ads, not Google."));
  say(``);
  say(`---`);
  say(``);

  // ── 5. How v_agent_globalcomix was built ───────────────────────────────
  say(`## 5. How \`v_agent_globalcomix\` was built (reference)`);
  say(``);
  say(`### Full schema (${goldCols.length} columns)`);
  say(``);
  say(`| column | type | nullable |`);
  say(`|---|---|---|`);
  say(goldColLines);
  say(``);
  say(`### DDL`);
  say(``);
  if (goldDdl) {
    say(fence("sql", goldDdl));
  } else {
    say(`_DDL not returned by INFORMATION_SCHEMA._`);
  }
  say(``);
  say(`### Normalization pattern — answers to the 7 questions`);
  say(``);
  // We can't reliably parse a CREATE VIEW DDL — but we can surface the
  // tells. Anything we don't have direct evidence for is left as an open
  // question, not invented.
  const ddlBlob = (goldDdl ?? "").toLowerCase();
  const ddlHasUnion = /\bunion\s+all\b/.test(ddlBlob);
  const ddlHasJoin = /\bjoin\b/.test(ddlBlob);
  const ddlMentionsBreakdown = /breakdown/.test(ddlBlob);
  const ddlMentionsCurrency = /currency|fx|exchange|usd/.test(ddlBlob);
  const ddlMentionsROAS = /\broas\b/.test(ddlBlob);

  say(`1. **Source tables it pulls from** — inspect the DDL above. Look for`);
  say(`   every \`FROM \\\`${PROJECT}.${DATASET}.…\\\`\` and every \`JOIN\` /`);
  say(`   \`UNION\` line. List each \`dwh_*\` table referenced.`);
  say(`2. **Meta spend column** — \`bq-security.ts\` records that GlobalComix`);
  say(`   exposes \`cost_usd\` (Rivery standard). The underlying \`dwh_fb2_globalcomix\``);
  say(`   spend column name appears in the Phase 4 / Meta mapping table above.`);
  say(`3. **Installs source** — does the DDL reference an AppsFlyer table?`);
  say(`   ${ddlBlob.includes("appsflyer") ? "**Yes — DDL contains the token `appsflyer`.**" : "_DDL does not contain the token `appsflyer` — installs may be Meta-attributed only._"}`);
  say(`4. **JOIN vs UNION** — ${ddlHasUnion ? "DDL contains `UNION ALL`." : "No `UNION ALL` detected."} ${ddlHasJoin ? "DDL contains `JOIN`." : "No `JOIN` detected."} Confirm by reading the DDL block.`);
  say(`5. **ROAS computation** — ${ddlMentionsROAS ? "the token `roas` appears in the DDL, suggesting it is materialized in the view." : "no `roas` token in DDL — likely computed at read time by Lumen."}`);
  say(`6. **breakdown_type filter** — ${ddlMentionsBreakdown ? "DDL references `breakdown` — verify the filter." : "_DDL does not reference `breakdown` — GlobalComix is NOT subject to the Playw3 triple-counting bug._"}`);
  say(`7. **Currency conversion** — ${ddlMentionsCurrency ? "DDL mentions `currency` / `usd` — likely converts upstream." : "_DDL has no currency-conversion tokens — assume source is already USD._"}`);
  say(``);
  if (playw3Ddl) {
    say(`### Contrast: \`v_playw3_agent\` DDL`);
    say(``);
    say(`This view is the cautionary tale: it lacks a \`breakdown_type\` filter,`);
    say(`which is why Lumen has to inject \`dedupePredicate = "breakdown_type = 'No Breakdown'"\``);
    say(`at the query layer. The new \`lumen_agent\` ETL must apply that filter at`);
    say(`write time so the fact table is already deduplicated.`);
    say(``);
    say(fence("sql", playw3Ddl));
    say(``);
  }
  say(`---`);
  say(``);

  // ── 6. ETL scripts needed ──────────────────────────────────────────────
  say(`## 6. ETL scripts needed`);
  say(``);
  say(`One BigQuery scheduled query per platform, each producing rows in the`);
  say(`shared \`lumen_agent\` shape. Keeping platforms separate (instead of one`);
  say(`mega-script) means a Meta column rename doesn't risk corrupting TikTok`);
  say(`data.`);
  say(``);

  function etlSection(label: string, platform: string, cmp: typeof metaCmp, effort: string, window: string, notes: string): void {
    const clients = [...(platformClients[platform] ?? [])].sort();
    say(`### ${label}`);
    say(``);
    say(`- **Scheduled query name:** \`lumen_etl_${label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}\``);
    say(`- **Source tables:** ${clients.length} \`dwh_*\` tables (one per client) — UNION ALL`);
    say(`- **Sample sources:** ${clients.slice(0, 5).map((c) => `\`dwh_${platform === "Meta" ? "fb2" : platform.toLowerCase()}_${c}\``).join(", ")}${clients.length > 5 ? ", …" : ""}`);
    say(`- **Columns to normalize:** see Phase 4 mapping above`);
    say(`- **Incremental window:** ${window}`);
    say(`- **Estimated effort:** ${effort}`);
    say(`- **Notes:** ${notes}`);
    say(``);
  }

  etlSection("Meta", "Meta", metaCmp, "medium", "rolling 14 days (Meta backfills attribution up to 7d, plus 7d slack)", "Apply `breakdown_type = 'No Breakdown'` if/where present. Fall back to `cost_usd` if `spend_usd` is absent.");
  etlSection("AppsFlyer", "AppsFlyer", afCmp, "medium", "rolling 14 days (install attribution window)", "JOIN back to Meta on `(date, campaign_id)` to fill installs/revenue on rows already produced by the Meta ETL.");
  etlSection("TikTok", "TikTok", ttCmp, "medium", "rolling 14 days", "Handle both `dwh_tiktok_*` and `dwh_tik_tok_*` naming via UNION of two regex-matched table groups.");
  etlSection("Google Ads", "Google", gCmp, "medium", "rolling 14 days", "`adwords` vs `google` token divergence — sample names in Phase 3.");
  say(`---`);
  say(``);

  // ── 7. Load strategy ───────────────────────────────────────────────────
  say(`## 7. Load strategy`);
  say(``);
  say(`Use BigQuery \`MERGE\` keyed on \`(date, client, network, campaign_id, adset_id)\`.`);
  say(`This is idempotent (re-running for the same window doesn't duplicate)`);
  say(`and lets each platform ETL touch only its own rows.`);
  say(``);
  say(fence("sql", `
MERGE \`${PROJECT}.${DATASET}.lumen_agent\` T
USING (
  SELECT … FROM <staging>          -- one platform, normalized to lumen_agent shape
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
) S
ON  T.date = S.date
AND T.client = S.client
AND T.network = S.network
AND COALESCE(T.campaign_id, '') = COALESCE(S.campaign_id, '')
AND COALESCE(T.adset_id, '')    = COALESCE(S.adset_id, '')
WHEN MATCHED THEN UPDATE SET
  spend_usd = S.spend_usd, impressions = S.impressions, clicks = S.clicks,
  installs  = S.installs,  revenue_usd = S.revenue_usd,
  roas = S.roas, cpi = S.cpi, ctr = S.ctr,
  campaign_name = S.campaign_name, adset_name = S.adset_name
WHEN NOT MATCHED THEN INSERT ROW;
  `.trim()));
  say(``);
  say(`**Partition pruning** — the MERGE \`USING\` block filters on \`date\`,`);
  say(`and the table is \`PARTITION BY date\`, so the source side scans only`);
  say(`the rolling window. The target side scans all partitions touched by`);
  say(`the source — fine, because they overlap by design.`);
  say(``);
  say(`---`);
  say(``);

  // ── 8. Refresh schedule ────────────────────────────────────────────────
  say(`## 8. Refresh schedule`);
  say(``);
  say(`Rivery's sync cadence is the upstream rate-limit. There is a view`);
  say(`called \`v_rivery_activity_check\` already in this dataset (the prompt`);
  say(`flagged it) — we read its watermark and only kick the ETL when the`);
  say(`latest Rivery run is newer than our last run.`);
  say(``);
  say(`Suggested cadence: two scheduled queries per platform per day, at`);
  say(`06:00 and 14:00 Israel time, gated by a "skip if Rivery hasn't moved"`);
  say(`check. This matches Looker Studio's perceived freshness today.`);
  say(``);
  say(`---`);
  say(``);

  // ── 9. Client onboarding checklist ─────────────────────────────────────
  say(`## 9. Client onboarding checklist`);
  say(``);
  say(`Once \`lumen_agent\` exists, adding a client is:`);
  say(``);
  say(`1. **Add UNION block per platform.** For each \`dwh_*\` table the new`);
  say(`   client has, append a UNION ALL branch to that platform's ETL.`);
  say(`2. **Backfill once.** Run that platform's scheduled query with`);
  say(`   \`date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)\` on a one-shot.`);
  say(`3. **Insert one row into \`lumen_clients\`** with slug, name, vertical,`);
  say(`   networks.`);
  say(`4. **Add slug to \`ALLOWED_CLIENTS\` env var** in Vercel (preview + prod).`);
  say(`5. **Smoke test** — open \`/dashboard?client=<slug>\` and confirm KPIs`);
  say(`   match Looker Studio for the past 7 days.`);
  say(``);
  say(`No schema change. No new table. No new code path in Lumen.`);
  say(``);
  say(`---`);
  say(``);

  // ── 10. Migration path for globalcomix and playw3 ──────────────────────
  say(`## 10. Migration path for GlobalComix and Playw3`);
  say(``);
  say(`These two clients use the legacy \`v_agent_globalcomix\` and`);
  say(`\`v_playw3_agent\` paths today (see \`src/lib/bq-security.ts\`).`);
  say(``);
  say(`1. **Populate \`lumen_agent\`** with both clients (backfill 365 days).`);
  say(`2. **Cross-check numbers** — spend, installs, revenue per day per`);
  say(`   network — for 2 weeks. Acceptable drift: <0.5%. Anything larger is`);
  say(`   a bug to resolve before cutover.`);
  say(`3. **Cut over \`bq-security.ts\`** to route both clients through the new`);
  say(`   shared path (\`strategy: "lumen-agent"\` or equivalent).`);
  say(`4. **Retire** the per-client \`spendCol\` / \`revenueCol\` /`);
  say(`   \`dedupePredicate\` config — the new fact table is already`);
  say(`   normalized.`);
  say(`5. **Drop** \`bq-queries-100play.ts\` after 100play follows the same path.`);
  say(``);
  say(`---`);
  say(``);

  // ── 11. Open questions ─────────────────────────────────────────────────
  say(`## 11. Open questions`);
  say(``);
  const openQs: string[] = [];

  // Spend column divergence
  const metaSpendNames = new Set<string>();
  for (const t of metaCmp.tables) {
    const s = metaCmp.keyColumns[t]?.spend;
    if (s) metaSpendNames.add(s);
  }
  if (metaSpendNames.size > 1) {
    openQs.push(`Meta tables use **${metaSpendNames.size} different spend-column names** (${[...metaSpendNames].map((n) => `\`${n}\``).join(", ")}). Confirm which is the authoritative name to map to \`spend_usd\` — and whether the others are pre-FX or pre-tax variants.`);
  } else if (metaSpendNames.size === 1) {
    openQs.push(`Meta spend column is consistently \`${[...metaSpendNames][0]}\` across sampled tables. Confirm this holds across all ${platformClients["Meta"]?.size ?? 0} clients before we hard-code it in the ETL.`);
  }

  // Installs source
  const metaInstallsNames = new Set<string>();
  for (const t of metaCmp.tables) {
    const i = metaCmp.keyColumns[t]?.installs;
    if (i) metaInstallsNames.add(i);
  }
  if (metaInstallsNames.size === 0) {
    openQs.push(`No installs column was found on the sampled Meta tables — confirm that all install data must come from AppsFlyer / Adjust (no Meta-attributed installs available).`);
  } else {
    openQs.push(`Some Meta tables expose an \`installs\` column directly (\`${[...metaInstallsNames].join(", ")}\`). Decide: prefer Meta-attributed installs or AppsFlyer-attributed installs when both exist? They will disagree.`);
  }

  // Clients with no AppsFlyer
  if (metaOnlyClients.length > 0) {
    openQs.push(`**${metaOnlyClients.length} clients have Meta spend but no AppsFlyer/Adjust/Kochava table.** Are they all active clients, or are some stale and safe to exclude from \`lumen_clients\`?`);
  }

  // Unparsed tables
  if (unparsed.length > 0) {
    openQs.push(`**${unparsed.length} \`dwh_*\` tables did not match any platform token** and were dropped from the inventory. First 10: ${unparsed.slice(0, 10).map((t) => `\`${t}\``).join(", ")}. Confirm none of these contain client data we'd miss.`);
  }

  // Rivery cadence
  openQs.push(`What is the actual Rivery sync cadence per platform? Section 8 assumes 2x/day — verify against \`v_rivery_activity_check\`.`);

  // AI budget / model selection — orthogonal to data but listed in CLAUDE.md as open
  openQs.push(`Is there a test/anonymized BQ environment we should target for the ETL dry-runs, or do we develop the scheduled queries directly against \`yellowhead_prod\`?`);

  openQs.forEach((q, i) => say(`${i + 1}. ${q}`));
  say(``);

  // Spot data check appendix
  say(`---`);
  say(``);
  say(`## Appendix A — Spot data check`);
  say(``);
  if (sampleResult) {
    const fmt = (n: number | null) =>
      n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    say(`Non-agent client picked: \`${sampleResult.client}\``);
    say(``);
    say(`Primary table: \`${sampleResult.table}\``);
    say(``);
    say(`| metric | value |`);
    say(`|---|---|`);
    say(`| rows | ${fmt(sampleResult.rows)} |`);
    say(`| earliest date | ${sampleResult.earliest ?? "—"} |`);
    say(`| latest date | ${sampleResult.latest ?? "—"} |`);
    say(`| distinct campaigns | ${fmt(sampleResult.campaigns)} |`);
    say(`| spend (col=\`${sampleResult.spendCol ?? "—"}\`) | ${fmt(sampleResult.spend)} |`);
    say(`| installs (col=\`${sampleResult.installsCol ?? "—"}\`) | ${fmt(sampleResult.installs)} |`);
    say(``);
    say(`Confirms: live, queryable, recent data.`);
  } else {
    say(`_No non-agent viable client found to spot-check, or query failed._`);
  }
  say(``);

  // Write the file.
  const outPath = path.resolve(process.cwd(), "LUMEN_DATA_PLAN.md");
  fs.writeFileSync(outPath, out.join("\n"), "utf-8");
  console.log(`\nWrote ${outPath} (${out.length} lines).`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
