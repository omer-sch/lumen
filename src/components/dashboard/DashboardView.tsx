"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardData, Kpi, KpiId } from "@/types/dashboard";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { useDashboardMode } from "@/lib/filters/use-dashboard-mode";
import {
  findClient,
  getClientCoverage,
  getSupportedKpis,
  type ClientCoverage,
} from "@/lib/mock/clients";
import { useDashboardData } from "@/lib/dashboard/use-dashboard-data";
import { useFreshness } from "@/lib/dashboard/use-freshness";
import type { FreshnessData } from "@/types/dashboard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ChannelMix } from "@/components/dashboard/ChannelMix";
import { NetworkBreakdown } from "@/components/dashboard/NetworkBreakdown";
import { PinnedSection } from "@/components/dashboard/PinnedSection";
import { AIModeView } from "@/components/dashboard/AIModeView";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { LivePulse } from "@/components/ui/LivePulse";
import { SectionError } from "@/components/ui/SectionError";
import type { SectionErrors } from "@/lib/dashboard/use-dashboard-data";
import {
  KpiCardSkeleton,
  Skeleton,
  TrendChartSkeleton,
} from "@/components/ui/Skeleton";

export function DashboardView() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const { from, to, client, setCustomRange } = useGlobalFilters();
  const { mode } = useDashboardMode();
  const { data, loading, errors, bounds, windowEmpty, refetch } =
    useDashboardData({ from, to, client });
  const coverage = getClientCoverage(client);
  const supportedKpis = getSupportedKpis(client);

  // Auto-snap: if the active window has zero spend AND the client has data
  // outside that window, jump the global filter to the most recent 30 days
  // of available data. The ref guard prevents fighting the user — once we've
  // snapped for a (client, bounds) pair we won't snap again until either
  // the client changes or the bounds shift.
  const snappedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!bounds?.earliest || !bounds?.latest) return;
    if (!windowEmpty) return;
    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
    // Skip if current window overlaps the data window at all — the user
    // might be intentionally looking at a real-but-empty day inside their
    // client's coverage. Only snap when fully outside.
    const overlaps = !(toIso < bounds.earliest || fromIso > bounds.latest);
    if (overlaps) return;
    const key = `${client}|${bounds.earliest}|${bounds.latest}`;
    if (snappedKey.current === key) return;
    snappedKey.current = key;
    const latest = new Date(`${bounds.latest}T00:00:00Z`);
    const earliest = new Date(`${bounds.earliest}T00:00:00Z`);
    const thirtyBack = new Date(latest);
    thirtyBack.setUTCDate(thirtyBack.getUTCDate() - 29);
    const snapFrom = thirtyBack < earliest ? earliest : thirtyBack;
    setCustomRange(snapFrom, latest);
    // setCustomRange / windowEmpty / bounds are stable enough; the key guard
    // is what prevents re-runs from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, bounds?.earliest, bounds?.latest, windowEmpty]);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <DashboardHeader />
      {mode === "ai" ? (
        <AIModeView />
      ) : (
        <MyDashboard
          data={data}
          loading={loading}
          coverage={coverage}
          supportedKpis={supportedKpis}
          errors={errors}
          onRetry={refetch}
        />
      )}
      <PinnedSection />
    </div>
  );
}

function DashboardHeader() {
  const { mode, setMode } = useDashboardMode();
  const { from, to, client } = useGlobalFilters();
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const c = findClient(client);
  const { state: freshness, errored } = useFreshness(client);

  const syncLabel = pickSyncLabel(freshness, errored);
  const syncTone = pickSyncTone(freshness, errored);
  const hoverTitle = pickHoverTitle(freshness, errored);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          data-testid="data-freshness-bar"
          title={hoverTitle}
          className="inline-flex shrink-0 flex-col gap-0.5 rounded-md px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-wider"
          style={{
            background: "color-mix(in oklab, var(--color-ua) 12%, transparent)",
            color: "var(--color-ua)",
            border:
              "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
            boxShadow:
              "0 0 24px color-mix(in oklab, var(--color-ua) 18%, transparent)",
          }}
        >
          <span className="inline-flex items-center gap-2">
            <LivePulse accent="mint" size={8} />
            UA · last {days} days
          </span>
          <span
            data-testid="data-freshness-label"
            className="inline-flex items-center gap-1.5 font-body text-[10px] font-medium normal-case tracking-normal"
            style={{ opacity: 0.78 }}
          >
            <span
              aria-hidden
              className="inline-block h-1 w-1 rounded-full"
              style={{ background: syncTone.dot, boxShadow: syncTone.glow }}
            />
            {syncLabel}
          </span>
        </span>
        <h2 className="truncate font-display text-lg font-extrabold leading-tight tracking-tight text-cloud-white sm:text-xl">
          {mode === "ai" ? (
            <>
              What Lumen thinks{" "}
              <span className="text-gradient-brand">matters now.</span>
            </>
          ) : (
            <>
              Performance overview,{" "}
              <span className="text-gradient-brand">{c.name}.</span>
            </>
          )}
        </h2>
      </div>
      <ModeToggle mode={mode} setMode={setMode} />
    </header>
  );
}

type SyncTone = { dot: string; glow: string };

const GRAY_TONE: SyncTone = { dot: "rgba(255,255,255,0.35)", glow: "none" };

function pickSyncTone(state: FreshnessData | null, errored: boolean): SyncTone {
  if (errored || state == null || state.hoursAgo < 0) return GRAY_TONE;
  if (state.hoursAgo < 12)
    return {
      dot: "var(--color-ua)",
      glow: "0 0 6px color-mix(in oklab, var(--color-ua) 50%, transparent)",
    };
  if (state.hoursAgo < 24)
    return {
      dot: "var(--color-yellow)",
      glow: "0 0 6px color-mix(in oklab, var(--color-yellow) 50%, transparent)",
    };
  return {
    dot: "var(--color-creative)",
    glow: "0 0 6px color-mix(in oklab, var(--color-creative) 50%, transparent)",
  };
}

/** Short text inside the chip. The full "Data as of" date lives in the
 *  hover tooltip so the chip stays compact. */
function pickSyncLabel(
  state: FreshnessData | null,
  errored: boolean,
): string {
  if (errored) return "freshness unavailable";
  if (state == null) return "checking freshness";
  if (state.hoursAgo < 0) return "freshness unavailable";
  if (state.hoursAgo === 0) return "synced under an hour ago";
  const unit = state.hoursAgo === 1 ? "hour" : "hours";
  return `synced ${state.hoursAgo} ${unit} ago`;
}

/** Verbose hover tooltip. Adds the "Data as of" date and surfaces a hint
 *  about loader staleness when the warehouse hasn't run in over a day. */
function pickHoverTitle(
  state: FreshnessData | null,
  errored: boolean,
): string | undefined {
  if (errored) return "Freshness signal unreachable from BigQuery.";
  if (state == null) return undefined;
  const asOf = state.dataAsOf ? formatDataAsOf(state.dataAsOf) : null;
  const head = asOf ? `Data as of ${asOf}.` : "Data freshness available.";
  if (state.hoursAgo < 0) return head;
  const hours = state.hoursAgo;
  const unit = hours === 1 ? "hour" : "hours";
  const synced =
    hours === 0
      ? "Pipeline synced less than an hour ago."
      : `Pipeline last synced ${hours} ${unit} ago.`;
  const tail =
    hours >= 24
      ? " Loader is overdue (more than a day since last run)."
      : "";
  return `${head} ${synced}${tail}`;
}

function formatDataAsOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: "my" | "ai";
  setMode: (m: "my" | "ai") => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard mode"
      data-testid="dashboard-mode-toggle"
      className="flex items-center gap-1 rounded-md p-1"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <button
        type="button"
        role="tab"
        data-testid="mode-my"
        aria-selected={mode === "my"}
        onClick={() => setMode("my")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          mode === "my"
            ? "text-ua"
            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
        )}
        style={
          mode === "my"
            ? {
                background: "var(--color-ua-dim)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in oklab, var(--color-ua) 35%, transparent)",
              }
            : undefined
        }
      >
        <LayoutDashboard className="h-3.5 w-3.5" strokeWidth={2} />
        My Dashboard
      </button>
      <button
        type="button"
        role="tab"
        data-testid="mode-ai"
        aria-selected={mode === "ai"}
        onClick={() => setMode("ai")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          mode === "ai"
            ? "text-yellow"
            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
        )}
        style={
          mode === "ai"
            ? {
                background: "var(--tint-yellow-soft)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in oklab, var(--color-yellow) 35%, transparent)",
              }
            : undefined
        }
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
        Lumen Dashboard
      </button>
    </div>
  );
}

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

/** Filter the default slots down to what the client has data for. Order is
 *  preserved so the hero stays in slot 0, and the layout collapses to
 *  the matching grid width below. */
function slotsForCoverage(coverage: ClientCoverage): KpiId[] {
  // If the client's supported KPI list doesn't include `cpaD7`, we're
  // on a legacy / agent-strategy client — fall back to the original
  // four-tile default.
  const supportsCpaD7 = coverage.supportedKpis?.includes("cpaD7") ?? false;
  const base = supportsCpaD7 ? DEFAULT_SLOTS : LEGACY_SLOTS;
  return base.filter((id) => {
    if (id === "installs") return coverage.hasInstalls;
    if (id === "cpi") return coverage.hasCpi;
    return true;
  });
}

function MyDashboard({
  data,
  loading,
  coverage,
  supportedKpis,
  errors,
  onRetry,
}: {
  /** `null` while the first fetch is in flight, or when the KPI fetch
   *  failed structurally. Trend / channel-mix failures show up as section
   *  errors inline instead of a null data object. */
  data: DashboardData | null;
  loading: boolean;
  coverage: ClientCoverage;
  /** KPI ids this client can actually populate. Drives swap options +
   *  visibility filtering so the user is never offered a tile that
   *  would just read 0. */
  supportedKpis: KpiId[];
  errors: SectionErrors;
  /** Refetch all four BQ-backed sections in parallel. Wired to the
   *  per-section Retry buttons. */
  onRetry: () => void;
}) {
  // Per-slot active metric. Each tile is independently swappable — pick
  // any of the 4 metrics in any slot. Yellow follows ROAS wherever it
  // lands so the brand "yellow is intentional" rule still holds.
  const coverageKey = `${coverage.hasInstalls}|${coverage.hasCpi}`;
  const [slots, setSlots] = useState<KpiId[]>(() => slotsForCoverage(coverage));
  // Re-pin slots when the client (and therefore coverage) changes — a user
  // navigating from GlobalComix to 100play would otherwise carry stale
  // `installs`/`cpi` slots that have no data to show.
  useEffect(() => {
    setSlots(slotsForCoverage(coverage));
    // `coverageKey` is the stable identity that triggers the reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageKey]);

  // Tailwind needs static class names — pick the column count up-front.
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
        data-testid="dashboard-loading"
      >
        <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${gridCols}`}>
          {slots.map((_, i) => (
            <KpiCardSkeleton key={`kpi-skel-${i}`} />
          ))}
        </section>
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
          <div className="lg:col-span-3">
            <TrendChartSkeleton />
          </div>
          <Skeleton className="h-72 w-full rounded-lg lg:col-span-2" />
        </section>
      </div>
    );
  }

  // Not loading and no data → the KPI fetch failed (structural). The
  // dashboard story rests on the KPI tiles, so render a single
  // section-error tile in their place and stop. The trend + channel mix
  // would have no anchor to attach to without KPIs.
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

  // Trim the KPI list to what this client actually populates. `supportedKpis`
  // is the canonical list (legacy four for agent-strategy clients, full
  // extended set for multi-source).
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
      {/* KPI strip — equal tiles in a row on lg+, each with its own
          sparkline. Column count adapts to coverage so missing metrics
          don't leave empty slots. The hero (yellow glow) follows the
          first slot wherever it lands so the brand "yellow is
          intentional" rule still holds. */}
      <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${gridCols}`}>
        {slots.map((activeId, i) => {
          const kpi = kpiById(activeId);
          // Extended metrics are optional on TrendPoint; coerce undefined
          // to 0 so the sparkline still renders for clients whose source
          // doesn't populate the field.
          const series = data.trend.map((p) => ({
            date: p.date,
            value: p[activeId] ?? 0,
          }));
          // Hero is whatever metric occupies slot 0 — the subscription
          // pivot landed CPA D7 there; agent-strategy clients still
          // start with ROAS.
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

      {/* Trend chart + network breakdown — side-by-side on lg+ so the
          dashboard fits in one viewport. Chart takes 3/5, breakdown
          gets 2/5 so the stacked network cards have room to breathe.
          Stacks on smaller screens. */}
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
    </div>
  );
}
