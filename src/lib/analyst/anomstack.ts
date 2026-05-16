import "server-only";

import type { CampaignRow, NetworkRow } from "@/types/dashboard";

import {
  COHORT_D7_MATURITY_THRESHOLD,
  MIN_POPULATION,
  MIN_SAMPLE_SIZE,
  PCT_DELTA_THRESHOLD,
  Z_THRESHOLD,
} from "./maturity-gates";
import { findingId, stampFindingProvenance } from "./provenance";
import {
  ANALYST_QUERY_IDS,
  type AnalystFinding,
  type AnomalyDetails,
} from "./types";

// Deterministic anomaly detector. Moved from
// src/lib/agents/hermes/anomstack.ts. Algorithm preserved verbatim for
// the non-cohort metrics (spend, cpi, installs) so the shadow-mode
// comparison shows zero divergence on those paths; the cohort-derived
// metrics (cpa_d7, sub_d7) now run through the COHORT_D7_MATURITY gate
// which previously only lived in snapshot.ts and was missing here. That
// gate suppresses anomalies where the denominator is too small to
// support a confident finding; pre-move, anomstack would emit a "Meta
// CPA D7 collapsed by 60 percent" anomaly off a single matured
// subscriber. Shadow-mode logs surface every such suppression so we
// can audit before flipping to "live".
//
// Two output shapes:
//   - RawAnomaly[]: the existing flat-list shape Hermes' rank-and-frame
//     step expects. Kept exactly so analyze.ts in "shadow" / "off" mode
//     does not change behavior.
//   - AnalystFinding[]: the new provenance-stamped, stable-id'd shape
//     downstream consumers (ReadyData) read. Same anomalies, richer
//     contract.

export { Z_THRESHOLD, PCT_DELTA_THRESHOLD };

export type AnomalyMetric = AnomalyDetails["metric"];
export type AnomalyDirection = AnomalyDetails["direction"];

export type RawAnomaly = {
  detector: "z_score" | "percent_delta";
  metric: AnomalyMetric;
  network: string;
  campaign_id?: string;
  campaign_name?: string;
  value: number;
  /** z-score for z_score; signed percent for percent_delta. */
  score: number;
  direction: AnomalyDirection;
  /** BQ query that produced the source row; matches an
   *  ANALYST_QUERY_IDS entry. */
  source_query_id: "network_breakdown" | "campaigns";
  rationale: string;
};

export type AnomstackInput = {
  networks: NetworkRow[];
  campaigns: CampaignRow[];
  /** ISO start/end of the active period. Used only to mint stable
   *  finding ids; algorithm is period-agnostic otherwise. */
  periodIsoStart?: string;
  periodIsoEnd?: string;
};

export type AnomstackResult = {
  /** Flat list, original shape. Consumed by Hermes' rank-and-frame in
   *  "shadow" / "off" mode. */
  anomalies: RawAnomaly[];
  /** Provenance-stamped findings. Consumed by ReadyData. Same anomalies
   *  as `anomalies`, lifted to the AnalystFinding contract. */
  findings: AnalystFinding[];
  counts: {
    z_score: number;
    percent_delta_network: number;
    percent_delta_campaign: number;
    /** How many findings were suppressed by the cohort-maturity gate.
     *  Surfaces in shadow-mode logs so we can see the trust delta. */
    suppressed_by_cohort_gate: number;
  };
};

// ── Statistics primitives ──────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance =
    xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function metricFromNetwork(
  row: NetworkRow,
  metric: AnomalyMetric,
): number | null {
  switch (metric) {
    case "spend":
      return row.spend;
    case "cpi":
      return row.cpi;
    case "cpa_d7":
      return row.cpaD7;
    case "installs":
      return row.installs;
    case "sub_start":
      return row.subStart;
    case "sub_d7":
      return row.subD7;
  }
}

// Metrics whose denominator is sub_d7 (cohort-derived). Findings on
// these metrics require the row's sub_d7 to be >= the cohort maturity
// threshold; otherwise a single subscriber produces a four-figure CPA
// outlier that the detector reads as a real movement.
const COHORT_DEPENDENT_METRICS: ReadonlySet<AnomalyMetric> = new Set([
  "cpa_d7",
]);

function isCohortMature(row: NetworkRow, metric: AnomalyMetric): boolean {
  if (!COHORT_DEPENDENT_METRICS.has(metric)) return true;
  return row.subD7 >= COHORT_D7_MATURITY_THRESHOLD;
}

// ── Detectors ──────────────────────────────────────────────────────────

function detectZScores(
  rows: NetworkRow[],
  metric: AnomalyMetric,
): { anomalies: RawAnomaly[]; suppressed: number } {
  if (rows.length < MIN_POPULATION) return { anomalies: [], suppressed: 0 };
  const values = rows
    .map((r) => metricFromNetwork(r, metric))
    .filter((v): v is number => v != null && Number.isFinite(v) && v !== 0);
  if (values.length < MIN_SAMPLE_SIZE) return { anomalies: [], suppressed: 0 };
  const m = mean(values);
  const s = stdev(values);
  if (s === 0) return { anomalies: [], suppressed: 0 };

  const anomalies: RawAnomaly[] = [];
  let suppressed = 0;
  for (const row of rows) {
    const v = metricFromNetwork(row, metric);
    if (v == null || !Number.isFinite(v) || v === 0) continue;
    const z = (v - m) / s;
    if (Math.abs(z) < Z_THRESHOLD) continue;
    if (!isCohortMature(row, metric)) {
      suppressed++;
      continue;
    }
    anomalies.push({
      detector: "z_score",
      metric,
      network: row.network,
      value: v,
      score: z,
      direction: z > 0 ? "up" : "down",
      source_query_id: "network_breakdown",
      rationale: `${row.network} ${metric} = ${v.toFixed(2)} is ${z.toFixed(1)}σ from the cross-network mean ${m.toFixed(2)}.`,
    });
  }
  return { anomalies, suppressed };
}

function detectCpaD7VsTrailing(
  rows: NetworkRow[],
): { anomalies: RawAnomaly[]; suppressed: number } {
  const anomalies: RawAnomaly[] = [];
  let suppressed = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.cpaD7) || row.cpaD7 === 0) continue;
    if (!Number.isFinite(row.trailingCpaD7Avg) || row.trailingCpaD7Avg === 0) {
      continue;
    }
    const pctDelta = (row.cpaD7 - row.trailingCpaD7Avg) / row.trailingCpaD7Avg;
    if (Math.abs(pctDelta) < PCT_DELTA_THRESHOLD) continue;
    if (!isCohortMature(row, "cpa_d7")) {
      suppressed++;
      continue;
    }
    anomalies.push({
      detector: "percent_delta",
      metric: "cpa_d7",
      network: row.network,
      value: row.cpaD7,
      score: pctDelta,
      direction: pctDelta > 0 ? "up" : "down",
      source_query_id: "network_breakdown",
      rationale: `${row.network} CPA D7 is ${row.cpaD7.toFixed(2)} this period vs a trailing 30-day baseline of ${row.trailingCpaD7Avg.toFixed(2)} (${(pctDelta * 100).toFixed(0)}% move).`,
    });
  }
  return { anomalies, suppressed };
}

function detectCampaignSpendDeltas(rows: CampaignRow[]): RawAnomaly[] {
  // Spend has no cohort dependency, so no maturity-gate suppression
  // here. Threshold check only.
  const anomalies: RawAnomaly[] = [];
  for (const row of rows) {
    if (row.spendDelta == null || !Number.isFinite(row.spendDelta)) continue;
    if (Math.abs(row.spendDelta) < PCT_DELTA_THRESHOLD) continue;
    anomalies.push({
      detector: "percent_delta",
      metric: "spend",
      network: row.network,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      value: row.spend,
      score: row.spendDelta,
      direction: row.spendDelta > 0 ? "up" : "down",
      source_query_id: "campaigns",
      rationale: `Campaign "${row.campaign_name}" on ${row.network} spent ${row.spend.toFixed(0)} this period,a ${(row.spendDelta * 100).toFixed(0)}% move vs the previous period.`,
    });
  }
  return anomalies;
}

// ── RawAnomaly -> AnalystFinding lift ──────────────────────────────────

function severityFromAnomaly(a: RawAnomaly): "low" | "medium" | "high" {
  // Cost-metric direction: up is bad. Volume-metric: up is good. The
  // severity reflects the magnitude of movement, framed by direction.
  // High when |z| >= 3 or |delta| >= 0.5; medium between threshold and
  // the high cutoff; low never (anything below threshold is filtered).
  const abs = Math.abs(a.score);
  if (a.detector === "z_score") {
    return abs >= 3 ? "high" : "medium";
  }
  return abs >= 0.5 ? "high" : "medium";
}

function summaryFromAnomaly(a: RawAnomaly): string {
  if (a.detector === "z_score") {
    return `${a.network} ${a.metric} z-score = ${a.score.toFixed(1)}σ`;
  }
  if (a.campaign_name) {
    return `${a.campaign_name} on ${a.network} ${a.metric} moved ${(a.score * 100).toFixed(0)}%`;
  }
  return `${a.network} ${a.metric} moved ${(a.score * 100).toFixed(0)}%`;
}

function findingFromAnomaly(
  a: RawAnomaly,
  periodIsoStart: string,
  periodIsoEnd: string,
): AnalystFinding {
  const target = a.campaign_id ?? a.network;
  const queryId =
    a.source_query_id === "network_breakdown"
      ? ANALYST_QUERY_IDS.NETWORK_BREAKDOWN
      : ANALYST_QUERY_IDS.CAMPAIGNS;
  const algorithm =
    a.detector === "z_score"
      ? "anomstack/z-score@1.0"
      : "anomstack/percent-delta@1.0";

  const details: AnomalyDetails = {
    detector: a.detector,
    metric: a.metric,
    network: a.network,
    campaign_id: a.campaign_id,
    campaign_name: a.campaign_name,
    value: a.value,
    score: a.score,
    direction: a.direction,
  };

  return {
    id: findingId({
      kind: "anomaly",
      target,
      periodIsoStart,
      periodIsoEnd,
      extra: { metric: a.metric, detector: a.detector },
    }),
    kind: "anomaly",
    severity: severityFromAnomaly(a),
    summary: summaryFromAnomaly(a),
    details: details as unknown as Record<string, unknown>,
    provenance: stampFindingProvenance({
      algorithm,
      inputs: {
        value: a.value,
        score: a.score,
        direction: a.direction,
        metric: a.metric,
      },
      queryIds: [queryId],
    }),
  };
}

// ── Public entry point ─────────────────────────────────────────────────

export function runAnomstack(input: AnomstackInput): AnomstackResult {
  const zSpend = detectZScores(input.networks, "spend");
  const zCpi = detectZScores(input.networks, "cpi");
  const zCpaD7 = detectZScores(input.networks, "cpa_d7");
  const networkPctDeltas = detectCpaD7VsTrailing(input.networks);
  const campaignPctDeltas = detectCampaignSpendDeltas(input.campaigns);

  const anomalies = [
    ...zSpend.anomalies,
    ...zCpi.anomalies,
    ...zCpaD7.anomalies,
    ...networkPctDeltas.anomalies,
    ...campaignPctDeltas,
  ];

  // Use the period bounds if provided; fall back to a stable sentinel
  // so findingId is deterministic even when the caller did not pass
  // ISO bounds (some tests).
  const isoStart = input.periodIsoStart ?? "unknown-start";
  const isoEnd = input.periodIsoEnd ?? "unknown-end";
  const findings = anomalies.map((a) => findingFromAnomaly(a, isoStart, isoEnd));

  return {
    anomalies,
    findings,
    counts: {
      z_score:
        zSpend.anomalies.length +
        zCpi.anomalies.length +
        zCpaD7.anomalies.length,
      percent_delta_network: networkPctDeltas.anomalies.length,
      percent_delta_campaign: campaignPctDeltas.length,
      suppressed_by_cohort_gate:
        zSpend.suppressed +
        zCpi.suppressed +
        zCpaD7.suppressed +
        networkPctDeltas.suppressed,
    },
  };
}
