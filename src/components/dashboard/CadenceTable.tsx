"use client";

import { useEffect, useMemo, useState } from "react";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { CadenceTableSkeleton } from "@/components/ui/Skeleton";
import { aggregateTrend, type Cadence } from "@/lib/dashboard/aggregate-trend";
import { cellTone, type CellTone } from "@/lib/dashboard/cell-tone";
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

const fmtDeltaPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

/** Map a CellTone verdict to a soft background tint. Neutral renders as
 *  transparent (no tint) so the table doesn't feel paint-by-numbers. */
function toneBackground(tone: CellTone): string {
  switch (tone) {
    case "good":
      return "color-mix(in oklab, var(--color-ua) 10%, transparent)";
    case "bad":
      return "color-mix(in oklab, var(--color-creative) 10%, transparent)";
    case "warn":
      return "color-mix(in oklab, var(--color-yellow) 8%, transparent)";
    default:
      return "transparent";
  }
}

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

  // Period-over-prior-period delta is meaningful only at Weekly /
  // Monthly cadence (row N's "prior" is row N-1). Daily cadence skips it
  // because the prior-day comparison is too noisy to color a cell on.
  const showDeltaCol = cadence !== "daily" && rows.length > 1;

  // Baseline for cell tinting: the table's own grand-total average for
  // each rate metric. Computed once over the visible rows so a user
  // toggling cadence sees the tones recompute against the new bucket
  // set. Skip when only one row exists (no baseline = no tint).
  const baselines = useMemo(() => {
    if (rows.length <= 1) return null;
    const cpaD7 = rows.filter((r) => r.cpaD7 > 0);
    const roiD7 = rows.filter((r) => r.roiD7 > 0);
    return {
      cpaD7:
        cpaD7.length > 0
          ? cpaD7.reduce((a, r) => a + r.cpaD7, 0) / cpaD7.length
          : 0,
      roiD7:
        roiD7.length > 0
          ? roiD7.reduce((a, r) => a + r.roiD7, 0) / roiD7.length
          : 0,
    };
  }, [rows]);

  if (loading) return <CadenceTableSkeleton />;
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
              <th className={showDeltaCol ? "py-1 pr-3 text-right" : "py-1 text-right"}>
                ROI D7
              </th>
              {showDeltaCol && (
                <th className="py-1 text-right">Δ CPA vs prior</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // Tone the cost / return cells against the table-average
              // baseline so a user can scan a column for outliers.
              const cpaTone = baselines
                ? cellTone(r.cpaD7, baselines.cpaD7, "lower-better")
                : "neutral";
              const roiTone = baselines
                ? cellTone(r.roiD7, baselines.roiD7, "higher-better")
                : "neutral";
              // Delta vs prior period: row N's cpaD7 against row N-1.
              // First row has no prior, so the cell renders "—".
              const prior = i > 0 ? rows[i - 1] : null;
              const deltaPct =
                prior && prior.cpaD7 > 0 && r.cpaD7 > 0
                  ? ((r.cpaD7 - prior.cpaD7) / prior.cpaD7) * 100
                  : null;
              return (
                <tr
                  key={r.bucket}
                  className="group border-t transition-colors hover:bg-[color-mix(in_oklab,var(--color-ua)_6%,transparent)]"
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
                  <td
                    className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-primary)] transition-colors"
                    style={{ background: toneBackground(cpaTone) }}
                    title={
                      baselines && r.cpaD7 > 0
                        ? `CPA D7 ${fmtDeltaPct(((r.cpaD7 - baselines.cpaD7) / baselines.cpaD7) * 100)} vs the table average`
                        : undefined
                    }
                  >
                    {r.cpaD7 > 0 ? fmtMoney(r.cpaD7) : "—"}
                  </td>
                  <td
                    className={
                      (showDeltaCol ? "py-2 pr-3" : "py-2") +
                      " text-right tabular-nums text-[color:var(--text-primary)] transition-colors"
                    }
                    style={{ background: toneBackground(roiTone) }}
                    title={
                      baselines && r.roiD7 > 0
                        ? `ROI D7 ${fmtDeltaPct(((r.roiD7 - baselines.roiD7) / baselines.roiD7) * 100)} vs the table average`
                        : undefined
                    }
                  >
                    {r.roiD7 > 0 ? fmtRoi(r.roiD7) : "—"}
                  </td>
                  {showDeltaCol && (
                    <td className="py-2 text-right">
                      <DeltaChip pct={deltaPct} direction="lower-better" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

/**
 * Period-over-prior-period delta pill. Mirrors KpiCard's delta chip
 * shape (mint / coral tint, ArrowUpRight / ArrowDownRight icon) so the
 * cadence table reads with the same visual vocabulary as the KPI strip
 * above it. Renders a muted em-dash when no prior period exists.
 *
 * `direction` flips polarity: for a CPA metric (lower-better) a drop
 * tints mint; for a ROI metric (higher-better) a rise tints mint.
 */
function DeltaChip({
  pct,
  direction,
}: {
  pct: number | null;
  direction: "lower-better" | "higher-better";
}) {
  if (pct == null || !Number.isFinite(pct)) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-xs font-semibold tabular-nums text-[color:var(--text-muted)]"
        style={{ background: "var(--surface-input)" }}
        title="No prior-period baseline"
      >
        —
      </span>
    );
  }
  const rose = pct > 0;
  const isGood = direction === "lower-better" ? !rose : rose;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-xs font-semibold tabular-nums"
      style={{
        background: isGood ? "var(--tint-success-soft)" : "var(--tint-danger-soft)",
        color: isGood ? "var(--color-ua)" : "var(--color-creative)",
      }}
    >
      {rose ? (
        <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
      ) : (
        <ArrowDownRight className="h-3 w-3" strokeWidth={2.25} />
      )}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
