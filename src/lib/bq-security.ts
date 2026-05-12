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
 * carry their primary table on the `ClientSchema` instead, since they don't
 * round-trip through the generic `getTableForClient` query path.
 */
const CLIENT_TO_TABLE: Record<string, string> = {
  globalcomix: "v_agent_globalcomix",
  playw3: "v_playw3_agent",
};

/**
 * Networks that exist in each client's underlying data. Surfaced in the UI
 * (e.g. coverage warning on Playw3) — NOT used as an enforcement filter.
 */
export const CLIENT_NETWORK_COVERAGE: Record<string, string[]> = {
  globalcomix: ["Meta", "TikTok", "Google", "AppsFlyer"],
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
 *  - `agent`        — single normalized agent view (GlobalComix, Playw3).
 *                     Routed through the generic `bq-queries.ts` path; uses
 *                     `CLIENT_TO_TABLE` + `spendCol`/`revenueCol`.
 *  - `lumen-union`  — no agent view; Lumen queries the raw warehouse table
 *                     directly via a per-client query module (e.g.
 *                     `bq-queries-100play.ts`). The hook routes the dashboard
 *                     fetches to `/api/bq/<slug>/*` instead of `/api/bq/*`.
 */
export type QueryStrategy = "agent" | "lumen-union";

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
};

const CLIENT_SCHEMA: Record<string, ClientSchema> = {
  globalcomix: {
    strategy: "agent",
    spendCol: "cost_usd",
    revenueCol: "rev_gross_d7_usd",
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
 * or `UnknownClientTableError` if the slug has no mapping.
 */
export function getTableForClient(client: string): string {
  const normalized = client.toLowerCase().trim();
  assertClientAllowed(normalized);
  const table = CLIENT_TO_TABLE[normalized];
  if (!table) throw new UnknownClientTableError(client);
  return `\`${serverEnv.BQ_PROJECT}.${serverEnv.BQ_DATASET}.${table}\``;
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
