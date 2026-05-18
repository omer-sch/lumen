"use client";

import { useEffect, useState } from "react";

import type { DashboardData, Kpi, KpiId } from "@/types/dashboard";
import type { ClientCoverage } from "@/lib/mock/clients";
import type { SectionErrors } from "@/lib/dashboard/use-dashboard-data";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ChannelMix } from "@/components/dashboard/ChannelMix";
import { NetworkBreakdown } from "@/components/dashboard/NetworkBreakdown";
import { CadenceTable } from "@/components/dashboard/CadenceTable";
import { WeekendsVsWeekdays } from "@/components/dashboard/WeekendsVsWeekdays";
import { PaybackCurve } from "@/components/dashboard/PaybackCurve";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { SectionError } from "@/components/ui/SectionError";
import {
  KpiCardSkeleton,
  Skeleton,
  TrendChartSkeleton,
} from "@/components/ui/Skeleton";

/** Default order of metrics across the four KPI slots. CPA D7 leads as
 *  the hero (yellow), then the subscription-funnel volume reads: spend,
 *  installs, subscribers at D7. Agent-strategy clients don't have CPA D7
 *  or subD7 populated so `slotsForCoverage` swaps them out for the
 *  legacy four. */
const DEFAULT_SLOTS: KpiId[] = ["cpaD7", "spend", "installs", "subD7"];

/** Legacy default for agent-strategy clients (Playw3, 100play). Those
 *  clients don't populate the subscription funnel, so we keep the
 *  gaming-vocab tiles where they were. */
const LEGACY_SLOTS: KpiId[] = ["roas", "spend", "installs", "cpi"];

/** Filter the default slots down to what the client has data for. */
function slotsForCoverage(coverage: ClientCoverage): KpiId[] {
  const supportsCpaD7 = coverage.supportedKpis?.includes("cpaD7") ?? false;
  const base = supportsCpaD7 ? DEFAULT_SLOTS : LEGACY_SLOTS;
  return base.filter((id) => {
    if (id === "installs") return coverage.hasInstalls;
    if (id === "cpi") return coverage.hasCpi;
    return true;
  });
}

type Props = {
  data: DashboardData | null;
  loading: boolean;
  coverage: ClientCoverage;
  supportedKpis: KpiId[];
  errors: SectionErrors;
  onRetry: () => void;
};

/**
 * Performance tab - the acquisition story. Renders the existing KPI
 * strip + TrendChart + NetworkBreakdown content (was MyDashboard inside
 * DashboardView) plus the per-cadence and weekend bucketing sections
 * that were previously stacked below MyDashboard.
 *
 * Filters relevant on this tab: Date, OS, Platform, Client (all four).
 * TopBar conditionally renders the OS + Platform chips when the active
 * tab is "performance" or "attribution"; they hide on "lifecycle".
 */
export function PerformanceTab({
  data,
  loading,
  coverage,
  supportedKpis,
  errors,
  onRetry,
}: Props) {
  const coverageKey = `${coverage.hasInstalls}|${coverage.hasCpi}`;
  const [slots, setSlots] = useState<KpiId[]>(() => slotsForCoverage(coverage));
  useEffect(() => {
    setSlots(slotsForCoverage(coverage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageKey]);

  const gridCols =
    slots.length >= 4
      ? "lg:grid-cols-4"
      : slots.length === 3
      ? "lg:grid-cols-3"
      : slots.length === 2
      ? "lg:grid-cols-2"
      : "lg:grid-cols-1";

  if (loading) {
    return (
      <div
        className="flex flex-col gap-3 md:gap-4"
        data-loading
        data-testid="performance-loading"
      >
        <section
          className={`grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 ${gridCols}`}
        >
          {slots.map((_, i) => (
            <KpiCardSkeleton key={`kpi-skel-${i}`} />
          ))}
        </section>
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
          <div className="lg:col-span-3">
            <TrendChartSkeleton />
          </div>
          <Skeleton className="h-full w-full rounded-lg lg:col-span-2" />
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3 md:gap-4">
        <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${gridCols}`}>
          <div className="sm:col-span-2 lg:col-span-4">
            <SectionError
              section="the KPI tiles"
              shape="min-h-[7rem]"
              onRetry={onRetry}
              data-testid="kpi-section-error"
            />
          </div>
        </section>
      </div>
    );
  }

  // Trim the KPI list to what this client actually populates.
  const supportedSet = new Set<KpiId>(supportedKpis);
  const visibleKpis = data.kpis.filter((k) => {
    if (!supportedSet.has(k.id)) return false;
    if (k.id === "installs") return coverage.hasInstalls;
    if (k.id === "cpi") return coverage.hasCpi;
    return true;
  });
  const kpiById = (id: KpiId): Kpi =>
    visibleKpis.find((k) => k.id === id) ?? visibleKpis[0];

  return (
    <div className="flex flex-col gap-3 md:gap-4" data-live>
      {/* KPI strip. */}
      <section
        className={`grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 ${gridCols}`}
      >
        {slots.map((activeId, i) => {
          const kpi = kpiById(activeId);
          const series = data.trend.map((p) => ({
            date: p.date,
            value: p[activeId] ?? 0,
          }));
          const heroSlot = i === 0;
          return (
            <KpiCard
              key={`slot-${i}`}
              id={kpi.id}
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              direction={kpi.direction}
              hint={kpi.hint}
              target={kpi.target}
              highlight={heroSlot}
              size="compact"
              enterIndex={i + 1}
              series={series}
            />
          );
        })}
      </section>

      {coverage.qualityCallout && (
        <InfoCallout
          data-testid="dashboard-quality-callout"
          title={coverage.qualityCallout.title}
          body={coverage.qualityCallout.body}
          dismissKey={coverage.qualityCallout.dismissKey}
        />
      )}

      {coverage.coverageNote && (
        <p
          data-testid="client-coverage-footnote"
          className="font-body text-[11px] leading-relaxed text-[color:var(--text-muted)]"
        >
          {coverage.coverageNote}
        </p>
      )}

      {/* Trend chart + network breakdown side-by-side. */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="lg:col-span-3">
          {errors.trend ? (
            <SectionError
              section="the trend chart"
              shape="min-h-[14rem]"
              onRetry={onRetry}
              data-testid="trend-section-error"
            />
          ) : (
            <TrendChart
              trend={data.trend}
              trendByNetwork={data.trendByNetwork}
              enterIndex={5}
            />
          )}
        </div>
        <div className="lg:col-span-2">
          {errors.channelMix ? (
            <SectionError
              section="the channel mix"
              shape="min-h-[14rem]"
              onRetry={onRetry}
              data-testid="channel-mix-section-error"
            />
          ) : data.networkBreakdown.length > 0 ? (
            <NetworkBreakdown rows={data.networkBreakdown} enterIndex={6} />
          ) : (
            <ChannelMix data={data.channelMix} enterIndex={6} />
          )}
        </div>
      </section>

      {/* Cadence aggregation + Weekends bucket comparison. */}
      <CadenceTable />
      <WeekendsVsWeekdays />

      {/* Payback curve - cohort D0 -> D90. Empty on agent-strategy
          clients (the multi-source-only query returns []). */}
      <PaybackCurve points={data.payback} enterIndex={9} />
    </div>
  );
}
