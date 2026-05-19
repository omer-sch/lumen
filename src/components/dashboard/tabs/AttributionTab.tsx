"use client";

import { BcacHero } from "@/components/dashboard/attribution/BcacHero";
import { CoverageWarningsRow } from "@/components/dashboard/attribution/CoverageWarningsRow";
import { PaidVsOrganicCard } from "@/components/dashboard/attribution/PaidVsOrganicCard";
import { DataFreshnessBar } from "@/components/dashboard/DataFreshnessBar";
import { ErrorState } from "@/components/ui/EmptyState";
import { AttributionSkeleton } from "@/components/ui/Skeleton";
import { useAttributionData } from "@/lib/attribution/use-attribution-data";

/**
 * Attribution tab — the trust story. Layout reads top-down:
 *
 *   Row 1 — BCAC hero (full width)              "what does each sub cost?"
 *   Row 2 — Paid vs Organic donut card           "where did those subs come from?"
 *   Row 3 — Data freshness (compact card)        "is the data we're reading current?"
 *   Row 4 — Coverage warnings                    "what reasons might these numbers be partial?"
 *
 * The pie chart is the visual centerpiece of the page — the question
 * "how much of this is paid vs the organic halo" answers in one glance.
 * BCAC anchors the cost, the donut shows the source mix, the freshness
 * + coverage strip at the bottom guards trust.
 *
 * Filters relevant on this tab: Date, OS, Platform, Client (all four).
 * The OS + Platform chips mount on the TopBar the same way Performance
 * does because Attribution slices by network and OS.
 */
export function AttributionTab() {
  const { totals, bcac, bcacDelta, loading, error } = useAttributionData();

  if (loading) {
    return (
      <div
        className="flex flex-col gap-6 md:gap-8"
        data-testid="attribution-tab"
        id="dashboard-tab-panel-attribution"
        role="tabpanel"
        aria-labelledby="dashboard-tab-attribution"
      >
        <AttributionSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col gap-6"
        data-testid="attribution-tab"
        id="dashboard-tab-panel-attribution"
        role="tabpanel"
        aria-labelledby="dashboard-tab-attribution"
      >
        <ErrorState
          title="Attribution didn't load"
          description="One of the cohort or spend fetches failed. Try a different date range, or refresh the page."
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-6 md:gap-8"
      data-testid="attribution-tab"
      id="dashboard-tab-panel-attribution"
      role="tabpanel"
      aria-labelledby="dashboard-tab-attribution"
    >
      <BcacHero bcac={bcac} delta={bcacDelta} />

      <PaidVsOrganicCard
        data={{
          subTotal: totals.subTotal,
          paid: totals.paid,
          organic: totals.organic,
        }}
        enterIndex={2}
      />

      <DataFreshnessBar compact />

      <CoverageWarningsRow />
    </div>
  );
}
