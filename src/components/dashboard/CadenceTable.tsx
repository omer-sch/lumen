"use client";

import { useMemo, useState } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { aggregateTrend, type Cadence } from "@/lib/dashboard/aggregate-trend";
import type { BQTrendPointByNetwork } from "@/types/dashboard";

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

const fmtCount = (n: number) => Math.round(n).toLocaleString();

const fmtRoi = (n: number) => `${n.toFixed(2)}x`;

/**
 * Cadence table (WS7.A). Daily / Weekly / Monthly toggle above an
 * aggregated view of the trend data the dashboard already fetched.
 * Rate metrics (CPI, CPA D7, ROI D7) are recomputed from the bucket
 * sums in aggregate-trend.ts so we never average daily rates.
 */
export function CadenceTable({
  trend,
}: {
  trend: BQTrendPointByNetwork[] | undefined;
}) {
  const [cadence, setCadence] = useState<Cadence>("weekly");

  const rows = useMemo(() => {
    if (!trend || trend.length === 0) return [];
    return aggregateTrend(trend, cadence);
  }, [trend, cadence]);

  if (rows.length === 0) return null;

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-cloud-white">
          Performance by cadence
        </h3>
        <div
          role="group"
          aria-label="Cadence"
          className="flex items-center gap-1 rounded-md p-1"
          style={{
            background: "var(--surface-input)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {CADENCES.map((c) => {
            const active = cadence === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCadence(c.value)}
                aria-pressed={active}
                className="rounded-sm px-2.5 py-1 font-body text-xs font-medium transition-colors"
                style={{
                  background: active ? "var(--color-ua)" : "transparent",
                  color: active
                    ? "var(--surface-base)"
                    : "var(--text-light-secondary)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              <th className="py-1 pr-3 text-left">Period</th>
              <th className="py-1 pr-3 text-right">Spend</th>
              <th className="py-1 pr-3 text-right">Installs</th>
              <th className="py-1 pr-3 text-right">Sub Start D7</th>
              <th className="py-1 pr-3 text-right">Sub D7</th>
              <th className="py-1 pr-3 text-right">CPA D7</th>
              <th className="py-1 text-right">ROI D7</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.bucket}
                className="border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <td className="py-2 pr-3 font-medium text-[color:var(--text-light-primary)]">
                  {r.label}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                  {fmtMoney(r.spend)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                  {fmtCount(r.installs)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                  {fmtCount(r.subStartD7)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                  {fmtCount(r.subD7)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                  {r.cpaD7 > 0 ? fmtMoney(r.cpaD7) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                  {r.roiD7 > 0 ? fmtRoi(r.roiD7) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
