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
 *   Row 1 (hero):       BCAC headline KpiCard
 *   Row 2 (mix + meta): PaidVsOrganicCard (2/3) | DataFreshnessBar (1/3, compact)
 *   Row 3 (warnings):   3-column grid of CoverageWarningCards
 *
 * The visual hierarchy matches the question the page answers: "Can I
 * trust the cohort numbers I'm reporting on?" — BCAC first (at what
 * cost), the paid/organic split that BCAC depends on, then every reason
 * the numbers might be partial.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PaidVsOrganicCard
          data={{
            subTotal: totals.subTotal,
            paid: totals.paid,
            organic: totals.organic,
          }}
          enterIndex={2}
          className="lg:col-span-2"
        />
        <DataFreshnessBar compact />
      </div>

      <CoverageWarningsRow />
    </div>
  );
}
