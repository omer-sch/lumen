import "server-only";

import type { CampaignRow } from "@/types/dashboard";

import { ANALYST_QUERY_IDS, type Rankings } from "./types";

// Pre-computed top-N projections. Phase 1 only ships top-campaigns-by-
// spend because the existing BQ campaigns query already returns rows
// sorted by spend DESC; adding a ranking just slices off the head and
// stamps the partial flag. Other rankings (top campaigns by ROAS, top
// networks by movement) need their own maturity-gate thinking and earn
// follow-up PRs per the spec.

const DEFAULT_TOP_N = 5;

/**
 * Top campaigns by current-period spend. Caller can pass `n`; defaults
 * to 5 (the count the deck's campaign table renders today). Source
 * rows are assumed already sorted by spend DESC; if they are not, we
 * sort defensively so a caller can't accidentally render the wrong
 * ordering.
 *
 * Partial flag: when the input has fewer rows than requested we return
 * what exists and flag `partial: true`. We never invent phantom rows.
 * Callers can use this to render "(top 3 of 3 campaigns this period)"
 * instead of misleading "top 5" labels over a 3-row table.
 */
export function topCampaignsBySpend(
  campaigns: CampaignRow[],
  n: number = DEFAULT_TOP_N,
): Rankings["topCampaignsBySpend"] {
  const sorted = campaigns
    .filter((c) => Number.isFinite(c.spend) && c.spend > 0)
    .slice()
    .sort((a, b) => b.spend - a.spend);
  const taken = sorted.slice(0, n);
  return {
    rows: taken,
    requestedN: n,
    actualN: taken.length,
    partial: taken.length < n,
  };
}

// queryId catalogue export so callers building a ReadyDataProvenance
// know which BQ query underpins the ranking.
export const RANKINGS_QUERY_IDS = [ANALYST_QUERY_IDS.CAMPAIGNS] as const;
