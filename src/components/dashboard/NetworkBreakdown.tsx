"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatKpi } from "@/lib/format";
import {
  STATUS_COLOR_VAR,
  STATUS_LABEL,
  statusFromCpaD7,
  type CpaStatus,
} from "@/lib/dashboard/status";
import type { NetworkRow } from "@/types/dashboard";

type Props = {
  rows: NetworkRow[];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
};

/**
 * Per-network performance list — compact stack of network cards
 * designed for the narrow 1/3-width column on the dashboard. Each row
 * shows the spend-share bar, the hero metric (CPA D7), a status pill,
 * and a few key counts. The "Show more" toggle reveals secondary KPIs
 * inside each row instead of adding columns to a wide table.
 */
export function NetworkBreakdown({ rows, enterIndex }: Props) {
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);

  if (rows.length === 0) return null;

  // Sort by spend descending so the biggest network leads.
  const sorted = [...rows].sort((a, b) => b.spend - a.spend);

  return (
    <GlassCard
      glow="ua"
      feature
      enterIndex={enterIndex}
      className="flex h-full flex-col gap-3 p-3"
      data-testid="network-breakdown"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            Network performance
          </h2>
          <p className="mt-0.5 font-body text-[11px] text-[color:var(--text-muted)]">
            Status compares CPA D7 to the trailing 30-day average.
          </p>
        </div>
        <button
          type="button"
          data-testid="network-show-more"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={showMore}
          className="shrink-0 rounded-sm px-2 py-1 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)] transition-colors hover:text-cloud-white"
          style={{
            border: "1px solid var(--border-subtle)",
            background: "var(--surface-input)",
          }}
        >
          {showMore ? "Less" : "More"}
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {sorted.map((r) => {
          const status: CpaStatus = statusFromCpaD7(r.cpaD7, r.trailingCpaD7Avg);
          const sharePct = Math.max(0, Math.min(1, r.share)) * 100;
          const dot = networkDot(r.network);
          return (
            <li
              key={r.network}
              data-testid={`network-row-${r.network}`}
              data-clickable="true"
              onClick={() =>
                router.push(
                  `/campaigns?network=${encodeURIComponent(r.network)}`,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(
                    `/campaigns?network=${encodeURIComponent(r.network)}`,
                  );
                }
              }}
              role="button"
              tabIndex={0}
              className="relative cursor-pointer overflow-hidden rounded-md p-2.5 transition-colors duration-200 hover:bg-[color:var(--surface-hover)]"
              style={{
                background: "var(--surface-input)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {/* Spend-share fill behind the row — subtle, network-tinted. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0"
                style={{
                  width: `${sharePct}%`,
                  background: `linear-gradient(90deg, color-mix(in oklab, ${dot} 16%, transparent), color-mix(in oklab, ${dot} 2%, transparent))`,
                }}
              />

              <div className="relative z-10 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: dot,
                        boxShadow: `0 0 6px ${dot}`,
                      }}
                    />
                    <span className="truncate font-display text-sm font-bold text-cloud-white">
                      {r.network}
                    </span>
                    <span className="font-body text-[10px] tabular-nums text-[color:var(--text-muted)]">
                      {sharePct.toFixed(0)}%
                    </span>
                  </span>
                  <StatusPill status={status} />
                </div>

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-body text-[11px]">
                  <Metric label="Spend" value={formatKpi.money(r.spend)} />
                  <Metric
                    label="CPA D7"
                    value={formatKpi.cpi(r.cpaD7)}
                    accent
                  />
                  <Metric label="Installs" value={formatKpi.count(r.installs)} />
                </div>

                {showMore && (
                  <div
                    className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t pt-1.5 font-body text-[11px] sm:grid-cols-3"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <Metric label="Impr." value={formatKpi.count(r.impressions)} />
                    <Metric label="Clicks" value={formatKpi.count(r.clicks)} />
                    <Metric label="CTR" value={formatKpi.percent(r.ctr)} />
                    <Metric label="CPI" value={formatKpi.cpi(r.cpi)} />
                    <Metric label="CPM" value={formatKpi.moneyCents(r.cpm)} />
                    <Metric label="CPC" value={formatKpi.moneyCents(r.cpc)} />
                    <Metric label="Sub starts" value={formatKpi.count(r.subStart)} />
                    <Metric label="Sub D7" value={formatKpi.count(r.subD7)} />
                    <Metric label="Ret. D7" value={formatKpi.percent(r.retD7)} />
                    <Metric label="ROAS D7" value={formatKpi.ratio(r.roasD7)} />
                    <Metric label="ROAS D30" value={formatKpi.ratio(r.roasD30)} />
                    <Metric label="ROAS D90" value={formatKpi.ratio(r.roasD90)} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  /** Accent applies brand mint — used for the hero column (CPA D7). */
  accent?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          color: accent ? "var(--color-ua)" : "var(--text-primary)",
          fontWeight: accent ? 700 : 600,
        }}
      >
        {value}
      </span>
    </span>
  );
}

function StatusPill({ status }: { status: CpaStatus }) {
  const color = STATUS_COLOR_VAR[status];
  return (
    <span
      data-testid={`network-status-${status}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-body text-[9.5px] font-semibold uppercase tracking-wider"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Color dot next to the network name — matches the trend chart's line
 *  color so the same visual identity carries between chart and table. */
function networkDot(network: string): string {
  const map: Record<string, string> = {
    Google: "#54F0A3",
    Meta: "#926FDE",
    TikTok: "#F88673",
    "Apple Search Ads": "#9CA9C5",
  };
  return map[network] ?? "#9CA9C5";
}
