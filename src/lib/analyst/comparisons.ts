import "server-only";

import type { NetworkRow } from "@/types/dashboard";

import {
  COHORT_D7_MATURITY_THRESHOLD,
  MIN_DENOMINATOR,
  PCT_DELTA_THRESHOLD,
} from "./maturity-gates";
import { ANALYST_QUERY_IDS, type PeriodOverPeriod } from "./types";

// Period-over-period comparisons. Phase 1 only ships CPA D7 vs the
// trailing 30-day baseline because that is the only baseline our BQ
// queries surface today (`trailingCpaD7Avg` on NetworkRow). A real
// equal-length PoP earns its own kind ("vs_prior_period") once the
// new BQ query lands; until then naming is honest: `kind:
// "vs_trailing_30d"` so a downstream LLM cannot accidentally cite
// "week-over-week CPA D7 changed by X" off a 30-day average.
//
// Maturity gates: each entry must clear sub_d7 >= COHORT_D7 on both
// sides AND the baseline must be >= MIN_DENOMINATOR. An entry that
// fails the gate is still returned with mature=false and a documented
// reason so the consumer can render "(maturing)" rather than fabricate
// a delta.

const VS_TRAILING_30D = "vs_trailing_30d" as const;

export function cpaD7VsTrailing30d(networks: NetworkRow[]): PeriodOverPeriod[] {
  return networks.map<PeriodOverPeriod>((row) => {
    const current = Number(row.cpaD7);
    const baseline = Number(row.trailingCpaD7Avg);
    const currentSampleSize = Number(row.subD7);
    // The trailing baseline does not carry a per-row sub_d7 count on
    // NetworkRow today; it is an averaged 30-day rate. We can't gate
    // the baseline sample size from the row, so we treat the baseline
    // as mature whenever it is a positive finite number above the
    // minimum denominator. A future PoP query that exposes the prior-
    // period sub_d7 count tightens this.
    const baselineMature = Number.isFinite(baseline) && baseline > 0;
    const currentMature = currentSampleSize >= COHORT_D7_MATURITY_THRESHOLD;
    const baselineUsable = baselineMature && baseline >= MIN_DENOMINATOR;

    if (
      !Number.isFinite(current) ||
      current === 0 ||
      !Number.isFinite(baseline) ||
      baseline === 0
    ) {
      return {
        kind: VS_TRAILING_30D,
        metric: "cpa_d7",
        target: row.network,
        current: Number.isFinite(current) ? current : 0,
        baseline: Number.isFinite(baseline) ? baseline : 0,
        deltaPct: 0,
        tone: "neutral",
        mature: false,
        maturityReason: "current or baseline is zero / non-finite",
        currentSampleSize,
      };
    }

    const deltaPct = (current - baseline) / baseline;
    const mature = currentMature && baselineUsable;

    let maturityReason: string | undefined;
    if (!currentMature) {
      maturityReason = `current sub_d7 ${currentSampleSize} below maturity threshold ${COHORT_D7_MATURITY_THRESHOLD}`;
    } else if (!baselineUsable) {
      maturityReason = `baseline ${baseline.toFixed(2)} below MIN_DENOMINATOR ${MIN_DENOMINATOR}`;
    }

    // tone: cost metric -> down is good, up is bad. Below the
    // percent-delta threshold the move is too small to color; keep
    // neutral so consumers don't read seasonal noise as a signal.
    let tone: PeriodOverPeriod["tone"] = "neutral";
    if (mature && Math.abs(deltaPct) >= PCT_DELTA_THRESHOLD) {
      tone = deltaPct < 0 ? "good" : "bad";
    }

    return {
      kind: VS_TRAILING_30D,
      metric: "cpa_d7",
      target: row.network,
      current,
      baseline,
      deltaPct,
      tone,
      mature,
      maturityReason,
      currentSampleSize,
    };
  });
}

export const COMPARISONS_QUERY_IDS = [
  ANALYST_QUERY_IDS.NETWORK_BREAKDOWN,
] as const;
