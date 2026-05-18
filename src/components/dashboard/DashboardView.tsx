"use client";

import { Suspense, useEffect, useRef } from "react";
import { LayoutDashboard, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { useDashboardMode } from "@/lib/filters/use-dashboard-mode";
import {
  findClient,
  getClientCoverage,
  getSupportedKpis,
} from "@/lib/mock/clients";
import { useDashboardData } from "@/lib/dashboard/use-dashboard-data";
import { useFreshness } from "@/lib/dashboard/use-freshness";
import type { FreshnessData } from "@/types/dashboard";
import { AIModeView } from "@/components/dashboard/AIModeView";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { PinnedSection } from "@/components/dashboard/PinnedSection";
import { SyncNowButton } from "@/components/dashboard/SyncNowButton";
import { PerformanceTab } from "@/components/dashboard/tabs/PerformanceTab";
import { LifecycleTab } from "@/components/dashboard/tabs/LifecycleTab";
import { AttributionTab } from "@/components/dashboard/tabs/AttributionTab";
import { LivePulse } from "@/components/ui/LivePulse";

export function DashboardView() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const { from, to, client, os, platforms, tab, setCustomRange } =
    useGlobalFilters();
  const { mode } = useDashboardMode();
  const { data, loading, errors, bounds, windowEmpty, refetch } =
    useDashboardData({ from, to, client, os, platforms });
  const coverage = getClientCoverage(client);
  const supportedKpis = getSupportedKpis(client);

  // Auto-snap: if the active window has zero spend AND the client has
  // data outside that window, jump the global filter to the most recent
  // 30 days of available data. The ref guard prevents fighting the user
  // - once we've snapped for a (client, bounds) pair we won't snap
  // again until either the client changes or the bounds shift.
  const snappedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!bounds?.earliest || !bounds?.latest) return;
    if (!windowEmpty) return;
    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, bounds?.earliest, bounds?.latest, windowEmpty]);

  // Three-tab IA. Each tab is a self-contained module; DashboardView
  // is just the orchestrator that picks which one to render based on
  // ?tab=. AI Mode still applies at the dashboard level for now -
  // when active it short-circuits the tab body and renders the
  // AI-built grid instead. (Open question 3 from the spec: per-tab
  // AI Mode is a follow-up; today it's shared so the brand-yellow
  // toggle has one home.)
  return (
    <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col gap-3 md:gap-4">
      <DashboardHeader />

      {mode === "ai" ? (
        <AIModeView />
      ) : (
        <>
          <DashboardTabs />

          {tab === "performance" && (
            <PerformanceTab
              data={data}
              loading={loading}
              coverage={coverage}
              supportedKpis={supportedKpis}
              errors={errors}
              onRetry={refetch}
            />
          )}
          {tab === "lifecycle" && <LifecycleTab />}
          {tab === "attribution" && <AttributionTab />}
        </>
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
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2 self-start">
          <span
            data-testid="data-freshness-bar"
            title={hoverTitle}
            className="inline-flex shrink-0 flex-col gap-0.5 rounded-md px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-wider"
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
          <SyncNowButton />
        </div>
        <h2 className="font-display text-xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-2xl">
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

function pickSyncLabel(state: FreshnessData | null, errored: boolean): string {
  if (errored) return "freshness unavailable";
  if (state == null) return "checking freshness";
  if (state.hoursAgo < 0) return "freshness unavailable";
  if (state.hoursAgo === 0) return "synced under an hour ago";
  const unit = state.hoursAgo === 1 ? "hour" : "hours";
  return `synced ${state.hoursAgo} ${unit} ago`;
}

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
    hours >= 24 ? " Loader is overdue (more than a day since last run)." : "";
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
