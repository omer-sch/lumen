import "server-only";

import { serverEnv } from "@/lib/env.server";

/**
 * Allowlist of client slugs that the BQ layer will resolve to a table.
 * Driven by the `ALLOWED_CLIENTS` env var so the deployed allowlist is
 * controlled out-of-band from the codebase.
 */
function getAllowedClients(): string[] {
  return serverEnv.ALLOWED_CLIENTS
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Static map from client slug to the BQ table or view that holds its agent
 * rows. The dashboard sends a slug; the table name is resolved here, never
 * by the client.
 *
 * Only agent-strategy clients live here. Lumen-union clients (e.g. 100play)
 * and multi-source clients (e.g. globalcomix) carry their table set on the
 * `ClientSchema` instead, since they don't round-trip through the generic
 * `getTableForClient` query path.
 *
 * GlobalComix used to point at `v_agent_globalcomix` here but that
 * materialization is dead (last refreshed ~5 weeks ago); the client now
 * reads the per-network `dwh_*_globalcomix_adjust` tables directly via the
 * `multi-source` strategy below.
 */
const CLIENT_TO_TABLE: Record<string, string> = {
  playw3: "v_playw3_agent",
};

/**
 * Networks that exist in each client's underlying data. Surfaced in the UI
 * (e.g. coverage warning on Playw3) — NOT used as an enforcement filter.
 */
export const CLIENT_NETWORK_COVERAGE: Record<string, string[]> = {
  globalcomix: ["Meta", "TikTok", "Google", "Apple Search Ads"],
  playw3: ["Meta", "Twitter"],
  "100play": ["Meta"],
};

/**
 * Per-client column schema. The two agent views were built independently
 * (different teams, different upstream sources) and don't share names.
 *  - GlobalComix uses `cost_usd`, `rev_gross_d7_usd` (Rivery's standard
 *    naming + D-window revenue cohort).
 *  - Playw3 uses `spend_usd`, `revenue_usd` (single revenue column — no
 *    D0/D7/D14 cohort split available).
 * All identifiers here come from the static map below — they are never
 * client-controlled, so it's safe to interpolate into SQL.
 */
/**
 * How Lumen reaches a client's data.
 *
 *  - `agent`         — single normalized agent view (Playw3). Routed through
 *                      the generic `bq-queries.ts` path; uses
 *                      `CLIENT_TO_TABLE` + `spendCol`/`revenueCol`.
 *  - `multi-source`  — no agent view; the per-network warehouse tables are
 *                      UNION'd at query time and revenue/ROAS is joined in
 *                      from a cohort table. Lives in
 *                      `globalcomix-queries.ts` but still served from the
 *                      shared `/api/bq/*` routes (the dispatch happens
 *                      inside `bq-queries.ts`).
 *  - `lumen-union`   — no agent view; Lumen queries the raw warehouse table
 *                      directly via a per-client query module (e.g.
 *                      `bq-queries-100play.ts`). The hook routes the dashboard
 *                      fetches to `/api/bq/<slug>/*` instead of `/api/bq/*`.
 */
export type QueryStrategy = "agent" | "multi-source" | "lumen-union";

/**
 * One per-network warehouse source for the `multi-source` strategy. The
 * SQL builder UNIONs across this list; `network` is the canonical display
 * label, `hasOs` flips whether the source can be sliced by OS for the
 * Google iOS attribution-gap exclusion.
 */
export type MultiSourceTable = {
  table: string;
  network: string;
  /** True when the table carries a usable `os` column. Apple has no OS
   *  column (Apple Search Ads is iOS-only by definition); Google has the
   *  column but it is unpopulated for the `No Breakdown` slice the
   *  aggregates use, so we treat it as `false` and rely on the cohort-side
   *  OS filter for the iOS exclusion. */
  hasOs: boolean;
};

export type MultiSourceConfig = {
  /** Per-network warehouse tables that contribute to the spend/installs
   *  UNION. All four are required for the aggregate to be correct. */
  spendSources: MultiSourceTable[];
  /** Adjust cohort table used to source D7 ROAS revenue. Joined on
   *  (install_date, normalized_network). */
  cohortTable: string;
  /** Predicate appended to the WHERE on every spend table to collapse the
   *  fan-out caused by Rivery duplicating each row across breakdown_type
   *  values. */
  spendDedupePredicate: string;
};

export type ClientSchema = {
  strategy: QueryStrategy;
  spendCol: string;
  /** Revenue column used as the ROAS numerator. */
  revenueCol: string;
  /**
   * Optional SQL predicate appended to every aggregation WHERE clause for
   * this client. Used to collapse fan-out views back to a single canonical
   * row per (date, campaign, ad_group, ad).
   *
   * For Playw3: `v_playw3_agent` ships each underlying row multiple times,
   * once per `breakdown_type` (`No Breakdown`, `Placement`, `Country`, …).
   * Naive SUM(spend_usd) ~triples real spend. Filtering to the `No
   * Breakdown` rows recovers the canonical aggregate.
   *
   * Hardcoded server-side; never interpolates user input.
   */
  dedupePredicate?: string;
  /** Strategy=`lumen-union` only: primary warehouse table. Identifier
   *  comes from this file (never client-controlled) so the per-client
   *  query module can interpolate it. */
  primaryTable?: string;
  /** Strategy=`multi-source` only: per-network spend tables + cohort
   *  revenue table. Identifiers are hardcoded server-side. */
  multiSource?: MultiSourceConfig;
};

const CLIENT_SCHEMA: Record<string, ClientSchema> = {
  globalcomix: {
    strategy: "multi-source",
    // `spendCol` / `revenueCol` are still the canonical column names used
    // inside each warehouse source — the multi-source SQL builder reaches
    // for them directly. They are intentionally kept here so other shared
    // helpers (e.g. data bounds) don't have to special-case the strategy.
    spendCol: "cost_usd",
    revenueCol: "rev_gross_d7_usd",
    multiSource: {
      // `network` is the canonical display label that the UI shows directly,
      // not the raw provider id. Brand convention: Facebook + Instagram both
      // roll up to "Meta"; Apple Search Ads spelled out so analysts don't
      // confuse it with Apple-the-platform installs.
      spendSources: [
        { table: "dwh_fb2_globalcomix_adjust", network: "Meta", hasOs: true },
        { table: "dwh_google_ads_globalcomix_adjust", network: "Google", hasOs: false },
        { table: "dwh_tik_tok_globalcomix_adjust", network: "TikTok", hasOs: true },
        { table: "dwh_apple_globalcomix_adjust", network: "Apple Search Ads", hasOs: false },
      ],
      cohortTable: "uni_adjust_cohort_report_globalcomix",
      // Every dwh_*_adjust table fans rows out across `breakdown_type` —
      // a naive SUM(cost_usd) would multiply spend ~3x. The `No Breakdown`
      // slice is the canonical aggregate. Same convention as Playw3.
      spendDedupePredicate: "breakdown_type = 'No Breakdown'",
    },
  },
  playw3: {
    strategy: "agent",
    spendCol: "spend_usd",
    revenueCol: "revenue_usd",
    dedupePredicate: "breakdown_type = 'No Breakdown'",
  },
  // 100play has no agent view. Phase 1 confirmed the primary table has
  // `cost_usd` only — no installs / campaign / network columns — so the
  // queries in `bq-queries-100play.ts` synthesize what they can and leave
  // the rest empty. See that file's header for Q1/Q2/Q3 reasoning.
  "100play": {
    strategy: "lumen-union",
    spendCol: "cost_usd",
    revenueCol: "rev_lifetime_usd",
    primaryTable: "dwh_fb2_ios14_appsflyer_100play",
  },
};

export function getSchemaForClient(client: string): ClientSchema {
  const normalized = client.toLowerCase().trim();
  assertClientAllowed(normalized);
  const s = CLIENT_SCHEMA[normalized];
  if (!s) throw new UnknownClientTableError(client);
  return s;
}

export function assertClientAllowed(client: string): void {
  const normalized = client.toLowerCase().trim();
  if (!getAllowedClients().includes(normalized)) {
    throw new ClientNotPermittedError(client);
  }
}

/**
 * Stricter check used by the lumen-union 100play routes / query module.
 * The routes always read 100play's hardcoded table regardless of the slug
 * the request asked for, so any slug other than 100play would silently
 * return 100play data under a different cache key. Reject those at the
 * boundary so the access shape stays coherent.
 */
export function assertIs100playClient(client: string): void {
  const normalized = client.toLowerCase().trim();
  if (normalized !== "100play") {
    throw new ClientNotPermittedError(client);
  }
}

/**
 * Returns the fully-qualified backticked BQ table identifier for a client.
 * Throws `ClientNotPermittedError` if the slug isn't in the env allowlist
 * or `UnknownClientTableError` if the slug has no agent-strategy mapping
 * (multi-source / lumen-union clients don't have a single table — callers
 * should branch on `strategy` and reach for the multi-source builder
 * instead).
 */
export function getTableForClient(client: string): string {
  const normalized = client.toLowerCase().trim();
  assertClientAllowed(normalized);
  const table = CLIENT_TO_TABLE[normalized];
  if (!table) throw new UnknownClientTableError(client);
  return `\`${serverEnv.BQ_PROJECT}.${serverEnv.BQ_DATASET}.${table}\``;
}

/**
 * Returns the fully-qualified backticked identifier for a single dataset
 * table. Used by the multi-source SQL builder so it doesn't have to
 * sprinkle backticks and dataset prefixes through every UNION leg.
 * Identifier comes from a server-side string — never client-controlled.
 */
export function qualifyTable(table: string): string {
  return `\`${serverEnv.BQ_PROJECT}.${serverEnv.BQ_DATASET}.${table}\``;
}

/**
 * Returns the multi-source config for a client. Throws if the client
 * isn't multi-source — the dispatch in `bq-queries.ts` is the only legal
 * caller and it has already branched on strategy.
 */
export function getMultiSourceConfig(client: string): MultiSourceConfig {
  const schema = getSchemaForClient(client);
  if (schema.strategy !== "multi-source" || !schema.multiSource) {
    throw new UnknownClientTableError(
      `Client ${client} is not a multi-source client`,
    );
  }
  return schema.multiSource;
}

export class ClientNotPermittedError extends Error {
  constructor(client: string) {
    super(`Client not permitted: ${client}`);
    this.name = "ClientNotPermittedError";
  }
}

export class UnknownClientTableError extends Error {
  constructor(client: string) {
    super(`No table mapped for client: ${client}`);
    this.name = "UnknownClientTableError";
  }
}
