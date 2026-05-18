"use client";

import { useEffect, useMemo, useState } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { aggregateTrend, type Cadence } from "@/lib/dashboard/aggregate-trend";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
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
 * aggregated view of the trend data.
 *
 * Fetches /api/bq/trend directly with full YYYY-MM-DD dates rather than
 * relying on the post-transformed trend the dashboard hook exposes —
 * that transform chops the year off the date string (line 239 of
 * use-dashboard-data.ts) to keep the chart x-axis label compact, which
 * left aggregateTrend's bucket-date parser staring at "04-15" and
 * emitting "Invalid Date" in every row. Owning the fetch keeps the
 * date intact and matches what the other WS7 sections do.
 *
 * Rate metrics (CPI, CPA D7, ROI D7, CTR) are recomputed from bucket
 * sums in aggregate-trend.ts — never average daily rates.
 */
export function CadenceTable() {
  const { from, to, client, os, platforms } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [trend, setTrend] = useState<BQTrendPointByNetwork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const qs = new URLSearchParams({
      client,
      from: fromIso,
      to: toIso,
    });
    if (os !== "total") qs.set("os", os);
    if (platforms.length > 0) qs.set("platforms", platforms.join(","));

    fetch(`/api/bq/trend?${qs.toString()}`)
      .then((r) => r.json())
      .then((data: BQTrendPointByNetwork[]) => {
        if (cancelled) return;
        setTrend(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso, os, platforms]);

  const rows = useMemo(() => {
    if (trend.length === 0) return [];
    return aggregateTrend(trend, cadence);
  }, [trend, cadence]);

  if (!loading && rows.length === 0) return null;

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
                    : "var(--text-secondary)",
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
                <td className="py-2 pr-3 font-medium text-[color:var(--text-primary)]">
                  {r.label}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                  {fmtMoney(r.spend)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                  {fmtCount(r.installs)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                  {fmtCount(r.subStartD7)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                  {fmtCount(r.subD7)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                  {r.cpaD7 > 0 ? fmtMoney(r.cpaD7) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-secondary)]">
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
