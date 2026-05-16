import "server-only";

import type { CampaignRow, NetworkRow } from "@/types/dashboard";

// Deterministic anomaly detector. Pure function over the same data the
// dashboard reads. Three classes per the master plan:
//
//   1. Z-score across networks on cost-shape metrics (spend, CPI, CPA D7).
//      Flags an outlier when |z| >= Z_THRESHOLD with a minimum population
//      size, so a two-network client doesn't false-positive.
//   2. Percent delta vs the trailing-period baseline that ships on the
//      NetworkRow itself (spendDelta, subD7Delta, etc). Flags when
//      |delta| >= PCT_DELTA_THRESHOLD.
//   3. "Best in N weeks",deferred; requires a wider date-range query
//      than the current dashboard slice. TODO(phase-6+).
//
// Output is a typed list of raw anomalies. The Analyze node hands these
// to Sonnet for ranking + framing; the model never invents an anomaly
// the data didn't show.

export const Z_THRESHOLD = 2.0;
export const PCT_DELTA_THRESHOLD = 0.25; // 25 percent
const MIN_POPULATION = 3;

export type AnomalyMetric =
  | "spend"
  | "cpi"
  | "cpa_d7"
  | "installs"
  | "sub_start"
  | "sub_d7";

export type AnomalyDirection = "up" | "down";

export type RawAnomaly = {
  detector: "z_score" | "percent_delta";
  metric: AnomalyMetric;
  network: string;
  campaign_id?: string;
  campaign_name?: string;
  value: number;
  score: number; // z-score for z_score; signed percent for percent_delta
  direction: AnomalyDirection;
  /** Identifies which BQ query produced the row this anomaly was derived from. */
  source_query_id: "network_breakdown" | "campaigns";
  rationale: string;
};

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

function detectZScores(
  rows: NetworkRow[],
  metric: AnomalyMetric,
): RawAnomaly[] {
  if (rows.length < MIN_POPULATION) return [];
  const values = rows
    .map((r) => metricFromNetwork(r, metric))
    .filter((v): v is number => v != null && Number.isFinite(v) && v !== 0);
  if (values.length < MIN_POPULATION) return [];
  const m = mean(values);
  const s = stdev(values);
  if (s === 0) return [];

  const anomalies: RawAnomaly[] = [];
  for (const row of rows) {
    const v = metricFromNetwork(row, metric);
    if (v == null || !Number.isFinite(v) || v === 0) continue;
    const z = (v - m) / s;
    if (Math.abs(z) < Z_THRESHOLD) continue;
    // For cost-shape metrics (cpi, cpa_d7), "up" is bad. For volume
    // metrics (installs, sub_start, sub_d7), "up" is good. The direction
    // field captures the raw movement; Sonnet decides framing.
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
  return anomalies;
}

function detectCpaD7VsTrailing(rows: NetworkRow[]): RawAnomaly[] {
  // The only baseline on NetworkRow is `trailingCpaD7Avg`. Use it to
  // surface networks whose current-period CPA D7 has moved materially
  // against their own trailing 30-day window. Other per-network deltas
  // would need a wider date-range query,deferred until phase 6+.
  const anomalies: RawAnomaly[] = [];
  for (const row of rows) {
    if (!Number.isFinite(row.cpaD7) || row.cpaD7 === 0) continue;
    if (!Number.isFinite(row.trailingCpaD7Avg) || row.trailingCpaD7Avg === 0) {
      continue;
    }
    const pctDelta = (row.cpaD7 - row.trailingCpaD7Avg) / row.trailingCpaD7Avg;
    if (Math.abs(pctDelta) < PCT_DELTA_THRESHOLD) continue;
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
  return anomalies;
}

function detectCampaignSpendDeltas(rows: CampaignRow[]): RawAnomaly[] {
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

export type AnomstackInput = {
  networks: NetworkRow[];
  campaigns: CampaignRow[];
};

export type AnomstackResult = {
  anomalies: RawAnomaly[];
  counts: {
    z_score: number;
    percent_delta_network: number;
    percent_delta_campaign: number;
  };
};

export function runAnomstack(input: AnomstackInput): AnomstackResult {
  const zSpend = detectZScores(input.networks, "spend");
  const zCpi = detectZScores(input.networks, "cpi");
  const zCpaD7 = detectZScores(input.networks, "cpa_d7");
  const networkPctDeltas = detectCpaD7VsTrailing(input.networks);
  const campaignPctDeltas = detectCampaignSpendDeltas(input.campaigns);

  const anomalies = [
    ...zSpend,
    ...zCpi,
    ...zCpaD7,
    ...networkPctDeltas,
    ...campaignPctDeltas,
  ];

  return {
    anomalies,
    counts: {
      z_score: zSpend.length + zCpi.length + zCpaD7.length,
      percent_delta_network: networkPctDeltas.length,
      percent_delta_campaign: campaignPctDeltas.length,
    },
  };
}
