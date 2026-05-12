"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { findClient } from "@/lib/mock/clients";
import { getCampaignDetail } from "@/lib/mock/campaigns";
import type { CampaignDetail } from "@/lib/mock/campaigns";
import type { Channel } from "@/types/dashboard";

const CHANNEL_TINT: Record<Channel, { bg: string; fg: string }> = {
  Meta:      { bg: "var(--tint-ua-soft)",       fg: "var(--color-ua)" },
  TikTok:    { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
  Google:    { bg: "var(--tint-yellow-soft)",   fg: "var(--color-yellow)" },
  AppsFlyer: { bg: "var(--tint-organic-soft)",  fg: "var(--color-organic)" },
};

const INSIGHT_META: Record<
  CampaignDetail["insights"][number]["type"],
  { Icon: typeof Sparkles; accentVar: string; tintVar: string; label: string }
> = {
  anomaly:     { Icon: TrendingDown,  accentVar: "--color-creative", tintVar: "--tint-creative-soft", label: "Anomaly" },
  opportunity: { Icon: Sparkles,      accentVar: "--color-yellow",   tintVar: "--tint-yellow-soft",   label: "Opportunity" },
  risk:        { Icon: AlertTriangle, accentVar: "--color-creative", tintVar: "--tint-creative-soft", label: "Risk" },
};

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

export function CampaignProfile({ id }: { id: string }) {
  return (
    <Suspense fallback={null}>
      <Inner id={id} />
    </Suspense>
  );
}

function Inner({ id }: { id: string }) {
  const { from, to, client } = useGlobalFilters();
  const c = findClient(client);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  const detail = useMemo(
    () => getCampaignDetail(id, { from, to, client }),
    [id, from, to, client],
  );

  if (!detail) {
    return (
      <div className="flex flex-col gap-4 py-6">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 self-start font-body text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)] transition-colors hover:text-cloud-white"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          Back to campaigns
        </Link>
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          Campaign not found.
        </p>
      </div>
    );
  }

  const tint = CHANNEL_TINT[detail.channel];

  // KpiCard expects the brand-formatted strings, so we shape each tile
  // here. Direction is per-metric: lower-better for CPI, higher-better
  // everywhere else.
  const KPIS = [
    {
      id: "roas",
      label: "ROAS (D7)",
      value: `${detail.roas.toFixed(2)}x`,
      delta: detail.deltaRoas,
      direction: "higher-better" as const,
      hint: "vs target 1.30x",
      highlight: true,
      series: detail.trend.map((p) => ({ date: p.date, value: p.roas })),
    },
    {
      id: "spend",
      label: "Spend",
      value: fmtMoney(detail.spend),
      delta: detail.deltaSpend,
      direction: "higher-better" as const,
      hint: `vs prev ${days}d`,
      highlight: false,
      series: detail.trend.map((p) => ({ date: p.date, value: p.spend })),
    },
    {
      id: "installs",
      label: "Installs",
      value: detail.installs.toLocaleString(),
      delta: detail.deltaInstalls,
      direction: "higher-better" as const,
      hint: `vs prev ${days}d`,
      highlight: false,
      series: detail.trend.map((p) => ({ date: p.date, value: p.installs })),
    },
    {
      id: "cpi",
      label: "CPI",
      value: `$${detail.cpi.toFixed(2)}`,
      delta: detail.deltaCpi,
      direction: "lower-better" as const,
      hint: "lower is better",
      highlight: false,
      series: detail.trend.map((p) => ({ date: p.date, value: p.cpi })),
    },
  ];

  return (
    <div className="flex flex-col gap-6 py-2 md:gap-7">
      {/* Breadcrumb back-link */}
      <Link
        href={`/campaigns${typeof window !== "undefined" && window.location.search ? window.location.search : ""}`}
        className="inline-flex items-center gap-1.5 self-start font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)] transition-[color,transform] duration-280 ease-out-quart hover:-translate-x-0.5 hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
        Back to campaigns
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ background: tint.bg, color: tint.fg }}
            >
              {detail.channel}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{
                background:
                  detail.status === "active"
                    ? "color-mix(in oklab, var(--color-ua) 14%, transparent)"
                    : "var(--surface-hover)",
                color:
                  detail.status === "active"
                    ? "var(--color-ua)"
                    : "var(--text-muted)",
              }}
            >
              {detail.status === "active" && (
                <LivePulse accent="mint" size={6} />
              )}
              {detail.status}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              {c.name} · last {days} days
            </span>
          </div>
          <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
            {detail.name}
          </h2>
          <p className="max-w-2xl font-body text-sm text-[color:var(--text-secondary)]">
            Per-campaign breakdown for the active window. The KPI tiles, trend
            chart, and platform split all react to your global date range and
            client.
          </p>
        </div>

        <div
          className="flex items-center gap-3 rounded-lg p-3"
          style={{
            background: "var(--surface-glass)",
            border: "1px solid var(--border-glass)",
          }}
        >
          <div className="flex flex-col">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Revenue
            </p>
            <p className="font-display text-lg font-extrabold tabular-nums text-cloud-white">
              {fmtMoney(detail.revenue)}
            </p>
          </div>
        </div>
      </header>

      {/* KPI strip — same shape as the dashboard, ROAS lit yellow */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k, i) => (
          <KpiCard
            key={k.id}
            id={k.id}
            label={k.label}
            value={k.value}
            delta={k.delta}
            direction={k.direction}
            hint={k.hint}
            highlight={k.highlight}
            size="compact"
            enterIndex={i + 1}
            series={k.series}
          />
        ))}
      </section>

      {/* Trend chart with metric switcher (re-uses the dashboard component) */}
      <TrendChart trend={detail.trend} enterIndex={5} />

      {/* Platform split + Insights */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <GlassCard glow="ua" enterIndex={6} className="flex flex-col gap-5 p-6 lg:col-span-1">
          <div>
            <h3 className="font-display text-md font-bold leading-none text-cloud-white">
              Platform split
            </h3>
            <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
              iOS / Android performance for this campaign over the active window.
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {detail.byPlatform.map((p) => {
              const max = Math.max(...detail.byPlatform.map((x) => x.spend), 1);
              const pct = (p.spend / max) * 100;
              const isLeader = p.spend === max;
              return (
                <li key={p.platform} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-body text-sm">
                    <span className="font-medium text-cloud-white">
                      {p.platform}
                    </span>
                    <span className="tabular-nums text-[color:var(--text-muted)]">
                      {fmtMoney(p.spend)} · {p.installs.toLocaleString()} installs ·{" "}
                      <span className="text-cloud-white">{p.roas.toFixed(2)}x</span>
                    </span>
                  </div>
                  <div
                    className="relative h-2 w-full overflow-hidden rounded-full"
                    style={{ background: "var(--surface-track)" }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-transform duration-1000 ease-out-quart"
                      style={{
                        width: `${pct}%`,
                        background: isLeader
                          ? "linear-gradient(90deg, var(--color-ua), var(--color-ua-glow))"
                          : "var(--color-ua)",
                        boxShadow: isLeader
                          ? "0 0 14px color-mix(in oklab, var(--color-ua-glow) 65%, transparent)"
                          : "0 0 8px color-mix(in oklab, var(--color-ua) 40%, transparent)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard glow="ua" enterIndex={7} className="flex flex-col gap-4 p-6 lg:col-span-2">
          <div>
            <h3 className="font-display text-md font-bold leading-none text-cloud-white">
              Lumen&rsquo;s read
            </h3>
            <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
              What the AI noticed about this campaign — what to scale, what to fix.
            </p>
          </div>
          {detail.insights.length === 0 ? (
            <p className="font-body text-sm text-[color:var(--text-muted)]">
              Nothing flagged in the current window. The campaign is performing
              within its expected band.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {detail.insights.map((insight, i) => {
                const meta = INSIGHT_META[insight.type];
                const accent = `var(${meta.accentVar})`;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md p-3"
                    style={{
                      background: `var(${meta.tintVar})`,
                      border: `1px solid color-mix(in oklab, ${accent} 28%, transparent)`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
                      style={{
                        background: `color-mix(in oklab, ${accent} 18%, transparent)`,
                        color: accent,
                      }}
                    >
                      <meta.Icon className="h-4 w-4" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: accent }}
                        >
                          {meta.label}
                        </span>
                        {insight.metricChip && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                            style={{
                              background: `color-mix(in oklab, ${accent} 18%, transparent)`,
                              color: accent,
                            }}
                          >
                            {insight.metricChip}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-display text-sm font-bold leading-snug text-cloud-white">
                        {insight.title}
                      </p>
                      <p className="mt-1 font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
                        {insight.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </section>

      {/* Top creatives */}
      <GlassCard glow="ua" enterIndex={8} className="flex flex-col gap-4 p-6">
        <div>
          <h3 className="font-display text-md font-bold leading-none text-cloud-white">
            Top creatives
          </h3>
          <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
            The three highest-spend creatives in this campaign. CTR + ROAS shown
            for context.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-[color:var(--border-subtle)]">
          {detail.creatives.map((cr, i) => (
            <li
              key={cr.id}
              className="flex items-center gap-3 py-3 transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)]"
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md font-display text-xs font-extrabold",
                  i === 0
                    ? "text-navy"
                    : "text-[color:var(--text-secondary)]",
                )}
                style={
                  i === 0
                    ? {
                        background:
                          "linear-gradient(135deg, var(--color-yellow) 0%, var(--color-yellow-light) 100%)",
                        boxShadow:
                          "0 0 12px color-mix(in oklab, var(--color-yellow) 40%, transparent)",
                      }
                    : { background: "var(--surface-hover)" }
                }
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm font-semibold text-cloud-white">
                  {cr.label}
                </p>
                <p className="font-body text-xs text-[color:var(--text-muted)]">
                  CTR {cr.ctr.toFixed(2)}% · ROAS {cr.roas.toFixed(2)}x
                </p>
              </div>
              <span className="font-body text-sm font-semibold tabular-nums text-cloud-white">
                {fmtMoney(cr.spend)}
              </span>
              <span className="text-[color:var(--text-muted)]">
                {cr.roas >= 1 ? (
                  <ArrowUpRight className="h-4 w-4 text-ua" strokeWidth={2.25} />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-creative" strokeWidth={2.25} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
