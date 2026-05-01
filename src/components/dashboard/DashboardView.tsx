"use client";

import { Suspense, useState } from "react";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDashboardData,
  type DashboardData,
  type Kpi,
  type KpiId,
} from "@/lib/mock/dashboard";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { useDashboardMode } from "@/lib/filters/use-dashboard-mode";
import { findClient } from "@/lib/mock/clients";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ChannelMix } from "@/components/dashboard/ChannelMix";
import { PinnedSection } from "@/components/dashboard/PinnedSection";
import { AIModeView } from "@/components/dashboard/AIModeView";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { LivePulse } from "@/components/ui/LivePulse";

export function DashboardView() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const { from, to, client } = useGlobalFilters();
  const { mode } = useDashboardMode();
  const data = getDashboardData({ from, to, client });

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <DashboardHeader />
      {mode === "ai" ? <AIModeView /> : <MyDashboard data={data} />}
      <PinnedSection />
    </div>
  );
}

function DashboardHeader() {
  const { mode, setMode } = useDashboardMode();
  const { from, to, client } = useGlobalFilters();
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const c = findClient(client);

  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
      <div className="flex min-w-0 flex-col gap-2">
        <span
          className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "color-mix(in oklab, var(--color-ua) 12%, transparent)",
            color: "var(--color-ua)",
            border:
              "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
            boxShadow:
              "0 0 24px color-mix(in oklab, var(--color-ua) 18%, transparent)",
          }}
        >
          <LivePulse accent="mint" size={8} />
          UA · {c.slug === "all" ? "All clients" : c.name} · last {days} days
        </span>
        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          {mode === "ai" ? (
            <>
              The dashboard{" "}
              <span className="text-gradient-brand">rebuilt itself.</span>
            </>
          ) : (
            <>
              Paid performance{" "}
              <span
                className="block bg-clip-text text-transparent sm:inline"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, var(--color-ua) 0%, var(--color-ua-glow) 55%, var(--color-yellow) 100%)",
                }}
              >
                looking sharp.
              </span>
            </>
          )}
        </h2>
        <p className="max-w-xl font-body text-sm text-[color:var(--text-secondary)]">
          {mode === "ai"
            ? "Lumen looked at the live signals and chose what's worth your attention right now. Step back into My Dashboard for the curated view."
            : "ROAS crossed your weekly target. CPI is trending down. Lumen flagged two opportunities to scale and one creative to retire."}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3">
        <ModeToggle mode={mode} setMode={setMode} />
        {mode === "my" && (
          <GlassCard glow="ua" feature className="flex w-full max-w-sm items-start gap-3 p-4">
            <GlassIcon icon={Sparkles} accentVar="--color-ua" size="sm" />
            <div className="min-w-0">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                Today&rsquo;s hint
              </p>
              <p className="mt-1 font-body text-sm leading-snug text-cloud-white">
                TikTok HC creatives are{" "}
                <span className="font-semibold text-ua">+34%</span>. Worth
                promoting to its own ad set.
              </p>
            </div>
          </GlassCard>
        )}
      </div>
    </header>
  );
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
        AI Dashboard
      </button>
    </div>
  );
}

/** Default order of metrics across the four KPI slots. */
const DEFAULT_SLOTS: KpiId[] = ["roas", "spend", "installs", "cpi"];

function MyDashboard({ data }: { data: DashboardData }) {
  // Per-slot active metric. Each tile is independently swappable — pick
  // any of the 4 metrics in any slot. Yellow follows ROAS wherever it
  // lands so the brand "yellow is intentional" rule still holds.
  const [slots, setSlots] = useState<KpiId[]>(DEFAULT_SLOTS);

  const setSlot = (slotIndex: number, nextId: KpiId) => {
    setSlots((cur) => cur.map((id, i) => (i === slotIndex ? nextId : id)));
  };

  const swapOptions = data.kpis.map((k) => ({ id: k.id, label: k.label }));
  const kpiById = (id: KpiId): Kpi =>
    data.kpis.find((k) => k.id === id) ?? data.kpis[0];

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      {/* KPI strip — 4 equal tiles in a row on lg+, each with a 30-day
          sparkline of its own metric. Each slot lets the user swap which
          metric it displays via the chevron next to the label. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((activeId, i) => {
          const kpi = kpiById(activeId);
          const series = data.trend.map((p) => ({
            date: p.date,
            value: p[activeId],
          }));
          return (
            <KpiCard
              key={`slot-${i}`}
              id={kpi.id}
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              direction={kpi.direction}
              hint={kpi.hint}
              highlight={activeId === "roas"}
              size="compact"
              enterIndex={i + 1}
              series={series}
              swap={{
                options: swapOptions,
                activeId,
                onChange: (next) => setSlot(i, next),
              }}
            />
          );
        })}
      </section>

      {/* Trend + Channel mix */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="lg:col-span-2">
          <TrendChart trend={data.trend} enterIndex={5} />
        </div>
        <ChannelMix data={data.channelMix} enterIndex={6} />
      </section>
    </div>
  );
}
