import type { ReadyData } from "@/lib/analyst/types";

// Freshness caveat generator. Inspects ReadyData.provenance for stale
// or partial-source signals and emits short caveat sentences the
// prose-writer (or the renderer's cover band) can surface.
//
// Two signal kinds today:
//   1. Warehouse staleness: bqCacheAgeSeconds measures how old the
//      most recent BQ row is vs. now. Past a threshold (24 hours of
//      data lag) we emit a "data is X days behind" caveat so a CSM
//      reading the deck knows the numbers aren't live.
//   2. Per-network sparseness: a network row with spend but with all
//      cohort fields at zero (sub_d7 / sub_d0 / payers_d7 all 0) is
//      almost certainly "data still incoming". We emit per-network
//      caveats so the platform-overall prose can reference them ("Google
//      results are still incomplete and expected to improve as data
//      updates").
//
// All thresholds are named constants so a future tuner sees them in
// one place.

// Number of hours past which the warehouse data is "stale" enough to
// surface. 24 means: "the most recent BQ row is more than a day old".
// Below this we don't bother with a freshness caveat.
const STALE_HOURS_THRESHOLD = 24;

// Minimum spend to bother flagging cohort sparseness. A network with
// $1 of spend and no cohort matches isn't surprising; we want this on
// real-money networks that should have cohort data.
const MIN_SPEND_FOR_SPARSE_FLAG = 100;

export type FreshnessCaveat = {
  /** Subject of the caveat: a network label ("Google", "TikTok") or
   *  "warehouse" for the dataset-wide staleness signal. */
  subject: string;
  /** Short sentence the prose-writer can drop verbatim into the
   *  platform-overall narrative or the cover. Never contains
   *  highlight markup or citations -- it's framing, not a claim. */
  message: string;
};

export type FreshnessSummary = {
  /** All caveats, ordered: dataset-wide first, then per-network in
   *  spend-descending order. Empty when nothing needs flagging. */
  caveats: FreshnessCaveat[];
  /** True when at least one caveat fired. Lets a consumer branch
   *  ("emit a Freshness section") without iterating. */
  hasIssues: boolean;
};

/**
 * Inspect ReadyData and return a structured freshness summary. Pure
 * function; no I/O. Safe to call multiple times per compose run.
 */
export function summarizeFreshness(ready: ReadyData): FreshnessSummary {
  const caveats: FreshnessCaveat[] = [];

  // 1. Warehouse-wide staleness. bqCacheAgeSeconds is the gap between
  // the most recent BQ date and "now"; convert to hours and gate on
  // the threshold. We don't surface a green-light "data is fresh"
  // caveat because that's noise; absence of a caveat is the signal.
  const hoursStale = Math.floor(ready.provenance.bqCacheAgeSeconds / 3600);
  if (hoursStale >= STALE_HOURS_THRESHOLD) {
    const daysStale = Math.floor(hoursStale / 24);
    const label =
      daysStale >= 2
        ? `${daysStale} days behind`
        : `${hoursStale} hours behind`;
    caveats.push({
      subject: "warehouse",
      message: `Data is ${label}; numbers will update as the warehouse refreshes.`,
    });
  }

  // 2. Per-network sparseness. A network with non-trivial spend but
  // empty cohort fields almost certainly hasn't fully attributed yet.
  // The Week 18 reference deck calls this out for iOS Google: "Google
  // results are still incomplete and expected to improve as data
  // updates." We mirror that voice here.
  const sparseNetworks = ready.networks
    .filter(
      (n) =>
        n.spend >= MIN_SPEND_FOR_SPARSE_FLAG &&
        n.subD0 === 0 &&
        n.subD7 === 0 &&
        n.payersD7 === 0,
    )
    .sort((a, b) => b.spend - a.spend);

  for (const n of sparseNetworks) {
    caveats.push({
      subject: n.network,
      message: `${n.network} results are still incomplete and expected to improve as data updates.`,
    });
  }

  return {
    caveats,
    hasIssues: caveats.length > 0,
  };
}

/**
 * Render a freshness summary as a single paragraph for the
 * prose-writer to consume. Returns the empty string when there's
 * nothing to surface so the prompt template can include it
 * unconditionally without an awkward stub.
 */
export function freshnessAsContextString(
  summary: FreshnessSummary,
): string {
  if (!summary.hasIssues) return "";
  return summary.caveats.map((c) => `- ${c.message}`).join("\n");
}
