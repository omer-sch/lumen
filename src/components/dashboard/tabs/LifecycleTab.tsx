"use client";

import { DailySubsTable } from "@/components/dashboard/lifecycle/DailySubsTable";
import { LifecycleKpiStrip } from "@/components/dashboard/lifecycle/LifecycleKpiStrip";
import { NetSubTrend } from "@/components/dashboard/lifecycle/NetSubTrend";
import { OsMixCard } from "@/components/dashboard/lifecycle/OsMixCard";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { LifecycleSkeleton } from "@/components/ui/Skeleton";
import { useLifecycleData } from "@/lib/lifecycle/use-lifecycle-data";

/**
 * Lifecycle tab — the subscriber retention narrative. The page reads
 * top-to-bottom as: current period totals (KpiStrip), the trend that
 * produced them (NetSubTrend), then the OS split and the daily detail
 * row side-by-side.
 *
 * Filters relevant on this tab: Date, Client only. OS and Platform
 * chips unmount from the TopBar (CLAUDE.md, Lifecycle) because the
 * dwh_total_subs query ignores them — OS appears here as a chart
 * dimension instead.
 *
 * Decomposition replaces the legacy SubscriberLifecycle stuffed card.
 * Each section is its own GlassCard with its own header + skeleton +
 * empty state, so the page reads as a vertical narrative instead of
 * a single card someone forgot to finish.
 */
export function LifecycleTab() {
  const { daily, osMix, trend, totals, deltas, sparklines, loading, error } =
    useLifecycleData();

  if (loading) {
    return (
      <div
        className="flex flex-col gap-6 md:gap-8"
        data-testid="lifecycle-tab"
        id="dashboard-tab-panel-lifecycle"
        role="tabpanel"
        aria-labelledby="dashboard-tab-lifecycle"
      >
        <LifecycleSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col gap-6"
        data-testid="lifecycle-tab"
        id="dashboard-tab-panel-lifecycle"
        role="tabpanel"
        aria-labelledby="dashboard-tab-lifecycle"
      >
        <ErrorState
          title="Lifecycle didn't load"
          description="The subscriber lifecycle query came back empty or failed. Try a different date range, or refresh the page."
        />
      </div>
    );
  }

  // Tab-level empty: no daily rows AND no OS mix. Each section still
  // has its own targeted empty state, but if both core fetches return
  // nothing the page reads as one large empty rather than four small
  // ones — clearer and easier to act on.
  if (daily.length === 0 && osMix.length === 0 && trend.length === 0) {
    return (
      <div
        className="flex flex-col gap-6"
        data-testid="lifecycle-tab"
        id="dashboard-tab-panel-lifecycle"
        role="tabpanel"
        aria-labelledby="dashboard-tab-lifecycle"
      >
        <GlassCard className="flex flex-col gap-3 p-5">
          <EmptyState
            title="No subscription events in this window."
            description="Lifecycle covers all OS regardless of the dashboard's OS filter. Try widening the date range."
            bulbSize={88}
          />
        </GlassCard>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-6 md:gap-8"
      data-testid="lifecycle-tab"
      id="dashboard-tab-panel-lifecycle"
      role="tabpanel"
      aria-labelledby="dashboard-tab-lifecycle"
    >
      <LifecycleKpiStrip
        totals={totals}
        deltas={deltas}
        sparklines={sparklines}
      />

      {/* Asymmetric pair: the chart takes ~2/3 (the trend is the story),
          the donut takes ~1/3 (composition glance). Reads as one row at
          lg+ and stacks on smaller widths. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <NetSubTrend
          trend={trend}
          daily={daily}
          enterIndex={4}
          className="lg:col-span-2"
        />
        <OsMixCard osMix={osMix} enterIndex={5} className="lg:col-span-1" />
      </div>

      <DailySubsTable daily={daily} enterIndex={6} />
    </div>
  );
}
