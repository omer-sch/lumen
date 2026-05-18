import { z } from "zod";

import type {
  BQTrendPointByNetwork,
  CampaignRow as BQCampaignRow,
  NetworkRow as BQNetworkRow,
} from "@/types/dashboard";

import type { CampaignClassification } from "./campaign-classifier";

// Shared analyst module types.
//
// Three layers:
//   1. Intent: lifted out of src/lib/agents/hermes/state.ts so non-Hermes
//      consumers (manual reports, future notifications) can depend on
//      it without pulling the LangGraph runtime. state.ts re-exports
//      both the schema and the type for backwards compatibility.
//   2. ReadyData: the public contract every consumer of analytics data
//      reads. Pre-computed, maturity-gated, provenance-stamped.
//   3. AnalystFinding: a single deterministic finding (anomaly today,
//      ranking / comparison later). Carries provenance so a downstream
//      LLM citing a number can be traced to its algorithm and query.
//      Separate name from the Hermes-internal Finding (LLM rank-and-
//      frame output in state.ts) to avoid the shape collision.

// ── Intent (moved from hermes/state.ts) ────────────────────────────────

export const IntentSchema = z.object({
  client: z.string().min(1),
  platforms: z.array(z.enum(["android", "ios", "web"])).min(1),
  channels: z
    .array(z.enum(["meta", "google", "tiktok", "apple_search_ads", "applovin"]))
    .min(1),
  period: z.object({
    label: z.string(),
    iso_start: z.string().nullable(),
    iso_end: z.string().nullable(),
  }),
  // focus + doubts are tolerant of Haiku omitting them. The two Zod
  // qualifiers match what the LLM tool schema declares as optional.
  focus: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  doubts: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof IntentSchema>;
export type IntentChannel = Intent["channels"][number];
export type IntentPlatform = Intent["platforms"][number];

// ── Provenance ─────────────────────────────────────────────────────────

// Stamped on every AnalystFinding so a CSM pushing back on a number an
// LLM cited can be traced: algorithm -> inputs -> BQ query -> row.
export type FindingProvenance = {
  /** e.g. "anomstack/z-score@1.0", "anomstack/percent-delta@1.0". */
  algorithm: string;
  /** Exact scalar values fed to the algorithm (the metric value, the
   *  baseline, sample size, z-score, etc). Used by debug surfaces to
   *  reproduce the computation. */
  inputs: Record<string, unknown>;
  /** BQ query identifiers underlying the inputs (e.g. "network-breakdown",
   *  "campaigns"). Matches the {query} segment of the cache key in
   *  src/lib/cache/keys.ts so we can chain a finding back to a cached
   *  BQ response. */
  queryIds: string[];
  /** ISO timestamp the algorithm ran (not when the BQ row was fetched). */
  computedAt: string;
};

// Stamped on every ReadyData so any consumer can answer "where did this
// snapshot come from, when was it built, how fresh is it".
export type ReadyDataProvenance = {
  /** Every BQ query that fed this ReadyData; superset of the per-finding
   *  queryIds. Matches the {query} segment of the cache key. */
  queryIds: string[];
  /** The analyst-layer cache key for this ReadyData. Lets us correlate
   *  log lines and verify cache hits at runtime. */
  cacheKey: string;
  /** ISO timestamp ReadyData was assembled. */
  fetchedAt: string;
  /** Approximate age of the BQ data underneath, derived from the latest
   *  date present in the warehouse (queryGlobalComixDataAsOf) minus
   *  now. "Cache age" in the spec; named honestly because what we can
   *  actually measure is data-freshness, not Redis-key age. */
  bqCacheAgeSeconds: number;
};

// ── AnalystFinding ─────────────────────────────────────────────────────

// Discriminator for the analyst-layer Finding. Distinct from the
// Hermes-internal Finding in state.ts (which is the LLM rank-and-frame
// output) so both can coexist. Future kinds: "ranking" when a top-N
// rank moved across periods, "comparison" when a PoP delta crossed a
// threshold. Phase 1 only emits "anomaly".
export type AnalystFindingKind = "anomaly" | "ranking" | "comparison";

export type AnalystFindingSeverity = "low" | "medium" | "high";

export type AnalystFinding = {
  /** Stable hash of (kind, target, period). Same input data on the same
   *  period produces the same id, so consumers can dedupe across runs
   *  and store decisions ("acknowledged", "dismissed") against it. */
  id: string;
  kind: AnalystFindingKind;
  severity: AnalystFindingSeverity;
  /** Short human-readable summary. The deterministic source for any
   *  LLM-framed prose downstream. */
  summary: string;
  /** Typed-per-kind in code (see AnomalyDetails, etc); kept generic at
   *  the type layer so a future kind doesn't force a discriminated
   *  union explosion. */
  details: Record<string, unknown>;
  provenance: FindingProvenance;
};

// Optional helper shape for the "anomaly" kind. Not a type narrowing
// (details is intentionally untyped at the public layer); just a
// reference for callers and tests.
export type AnomalyDetails = {
  detector: "z_score" | "percent_delta";
  metric:
    | "spend"
    | "cpi"
    | "cpa_d7"
    | "installs"
    | "sub_start"
    | "sub_d7";
  network: string;
  campaign_id?: string;
  campaign_name?: string;
  value: number;
  score: number;
  direction: "up" | "down";
  baseline?: number;
  sampleSize?: number;
};

// ── Rankings ────────────────────────────────────────────────────────────

// Top-N projection. When fewer rows exist than requested we return what
// we have and flag `partial: true` so consumers can render "(top 3 of 5
// available; only 3 ran spend this period)" instead of inventing
// phantom rows.
export type Rankings = {
  topCampaignsBySpend: {
    rows: BQCampaignRow[];
    requestedN: number;
    actualN: number;
    partial: boolean;
  };
};

// ── Comparisons ────────────────────────────────────────────────────────

// Period-over-period delta. `kind` documents the comparison axis so
// downstream readers do not confuse a trailing-30d baseline with a true
// equal-length PoP. Phase 1 only ships "vs_trailing_30d" because that
// is the only baseline our BQ queries surface today; a real PoP earns
// its own kind once the prior-period query lands.
export type PeriodOverPeriodKind = "vs_trailing_30d" | "vs_prior_period";

export type PeriodOverPeriod = {
  kind: PeriodOverPeriodKind;
  metric: "cpa_d7";
  target: string;
  current: number;
  baseline: number;
  /** (current - baseline) / baseline. */
  deltaPct: number;
  /** "good" / "bad" interpretation: a cost metric drop is good, a rise
   *  is bad; volume metrics flip. Computed once here so consumers don't
   *  re-derive. */
  tone: "good" | "bad" | "neutral";
  /** True when both sides cleared the maturity gates (sub_d7 above
   *  threshold both periods). When false the comparison is suppressed
   *  with a documented reason rather than fabricated. */
  mature: boolean;
  /** Documents why mature=false. Empty when mature=true. */
  maturityReason?: string;
  /** Sample size on the current side (e.g. sub_d7). Used by the gate. */
  currentSampleSize?: number;
  /** Sample size on the baseline side. */
  baselineSampleSize?: number;
};

// ── Weekly history (multi-week trailing context) ───────────────────────

// One row per (network, trailing-week) pair. The Weekly Breakdown slide
// stacks these on top of the current period so a reader sees three or
// four trailing weeks of context without reading prose.
//
// Period-agnostic: the week label and number are derived from the row's
// own iso dates, never from a hardcoded reference. weekIsoStart /
// weekIsoEnd / weekNumber together fully describe the window; weekLabel
// is the prebuilt human form so consumers don't all re-derive it.
export type WeeklyHistoryRow = {
  /** Network the row is about ("Meta" / "Google" / "TikTok" / "Apple"). */
  network: string;
  /** ISO start (inclusive) of this trailing week. */
  weekIsoStart: string;
  /** ISO end (inclusive) of this trailing week. */
  weekIsoEnd: string;
  /** ISO-8601 week number, derived from the row's own end date. */
  weekNumber: number;
  /** Pre-built deck label, e.g. "Apr 27 to May 3 (Week 18)". Consumers
   *  may override this when their renderer wants a different format,
   *  but the default is the deck-style label. */
  weekLabel: string;
  /** Full BQ NetworkRow for this trailing week. Same metric vocabulary
   *  as ReadyData.networks so a downstream consumer can read both with
   *  one type. */
  metrics: BQNetworkRow;
};

// ── Enriched campaign row (BQ + classifier output) ─────────────────────

// CampaignRow widened with the family / geo / campaignType / platform
// derived from the GlobalComix naming convention. The classifier never
// touches BQ; it's a pure regex over campaign_name. Falls back to
// `family: "Other"` for names that don't match the pattern, so a
// misshaped name reads as a real ("Other") group rather than being
// silently dropped.
export type EnrichedCampaignRow = BQCampaignRow & CampaignClassification;

// ── Knowledge ──────────────────────────────────────────────────────────

// Anonymous chunk shape used by the analyst layer. Distinct from
// ContextChunk in state.ts because that one carries an LLM-facing
// similarity field; this one stays minimal and any LLM consumer can
// wrap it.
export type KnowledgeChunk = {
  chunk_id: string;
  source_path: string;
  content: string;
  /** Similarity score from the underlying ANN search. 0 when the
   *  module is in stub mode (USE_ANALYST_KNOWLEDGE != "on"). */
  similarity: number;
};

// ── ReadyData ──────────────────────────────────────────────────────────

// The single contract every analytics consumer reads. Hermes calls
// getReadyData in "live" mode; the manual reports builder calls it
// from day one; future notifications and the smart Reports component
// will both consume the same shape.
//
// Field-by-field:
//   - intent: echoes the input. Lets a consumer that only holds the
//     ReadyData know what was asked for.
//   - clientLabel: pretty name for the cover. Derived from
//     src/lib/mock/clients once at assembly so consumers don't redo it.
//   - period: ISO start/end + human-readable label.
//   - networks/campaigns/trend: raw BQ rows, pass-through. No
//     transformation; consumers can derive their own projections.
//   - anomalies: pre-computed AnalystFindings (kind="anomaly" for
//     phase 1). Already maturity-gated; consumers can ship the list
//     straight to a downstream LLM ranker.
//   - rankings.topCampaignsBySpend: pre-computed top-N with partial
//     flag.
//   - comparisons.cpaD7PoP: pre-computed PoP-style deltas for D7 CPA.
//   - knowledgeChunks: vector-lookup hits (empty by default until the
//     USE_ANALYST_KNOWLEDGE workstream resolves).
//   - provenance: cache key, query ids, freshness.
export type ReadyData = {
  intent: Intent;
  clientLabel: string;
  period: {
    label: string;
    isoStart: string;
    isoEnd: string;
  };

  networks: BQNetworkRow[];
  /** Campaign rows widened with family / geo / campaignType derived from
   *  the GlobalComix naming convention. The underlying BQ shape (id /
   *  name / network / spend / installs / cpi / roas / spendDelta) is
   *  preserved so consumers that don't care about the classification can
   *  still type as `CampaignRow`. */
  campaigns: EnrichedCampaignRow[];
  trend: BQTrendPointByNetwork[];

  /** Trailing-week context, anchored to `period.isoStart`. Flat rows
   *  (one per network per week); consumers filter by `network` when they
   *  need a single channel's history. Empty array when the anchor is
   *  unparseable or every trailing fetch returned no rows; never null. */
  history: {
    networks: WeeklyHistoryRow[];
  };

  anomalies: AnalystFinding[];
  rankings: Rankings;
  comparisons: {
    cpaD7PoP: PeriodOverPeriod[];
  };

  knowledgeChunks: KnowledgeChunk[];

  provenance: ReadyDataProvenance;
};

// ── Query-id catalogue (provenance bookkeeping) ────────────────────────

// Named constants for every BQ query that may end up in a finding's
// provenance.queryIds. The strings exactly match the {query} segment
// in the cache key (src/lib/cache/keys.ts) so a runtime correlation
// between a finding and its cached row is one string-compare. Adding
// a new query is intentionally a code change here too: the catalogue
// is the contract for downstream debug surfaces.
export const ANALYST_QUERY_IDS = {
  NETWORK_BREAKDOWN: "network-breakdown",
  CAMPAIGNS: "campaigns",
  TREND: "trend",
  DATA_AS_OF: "data-as-of",
  KPIS: "kpis",
  // WS4 — Subscriber lifecycle (dwh_total_subs_globalcomix)
  TOTAL_SUBS_DAILY: "total-subs-daily",
  TOTAL_SUBS_OS_MIX: "total-subs-os-mix",
  NET_SUB_TREND: "net-sub-trend",
  // WS5 — New analytical views
  WEEKENDS: "weekends",
  GEO: "geo",
  CREATIVES: "creatives",
  ATTRIBUTION_VALIDATION: "attribution-validation",
  // Campaign profile (drill-down for /campaigns/[id])
  CAMPAIGN_PROFILE: "campaign-profile",
} as const;

export type AnalystQueryId =
  (typeof ANALYST_QUERY_IDS)[keyof typeof ANALYST_QUERY_IDS];
