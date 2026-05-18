"use client";

import { useEffect, useState } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { WeekendsVsWeekdaysSkeleton } from "@/components/ui/Skeleton";
import { cellTone, type CellTone } from "@/lib/dashboard/cell-tone";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";

/** Soft cell-tone tint matching CadenceTable's helper. Kept inline here
 *  rather than imported because it's tiny + the two tables can drift
 *  independently if a future iteration wants different tint strengths. */
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

type WeekendsRow = {
  bucket: "weekday" | "weekend";
  spend: number;
  installs: number;
  sub_d7: number;
  sub_start_d7: number;
  cpa_d7: number;
  cp_sub_start: number;
  roi_d7: number;
  install_cvr: number;
  sub_cvr: number;
};

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

const fmtCount = (n: number) => Math.round(n).toLocaleString();

const fmtRatio = (n: number) => `${(n * 100).toFixed(1)}%`;

const fmtRoi = (n: number) => `${n.toFixed(2)}x`;

/**
 * Weekends vs Weekdays (WS7.B). Two-row table + a compact spend bar.
 * Respects the OS + Platform filters via the WS6 filter spine.
 */
export function WeekendsVsWeekdays() {
  const { from, to, client, os, platforms } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [rows, setRows] = useState<WeekendsRow[]>([]);
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

    fetch(`/api/bq/weekends?${qs.toString()}`)
      .then((r) => r.json())
      .then((data: WeekendsRow[]) => {
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso, os, platforms]);

  if (loading) return <WeekendsVsWeekdaysSkeleton />;
  if (rows.length === 0) return null;

  const totalSpend = rows.reduce((acc, r) => acc + r.spend, 0);

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-cloud-white">
          Weekends vs Weekdays
        </h3>
      </header>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr]">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              <th className="py-1 pr-3 text-left">Bucket</th>
              <th className="py-1 pr-3 text-right">Spend</th>
              <th className="py-1 pr-3 text-right">Installs</th>
              <th className="py-1 pr-3 text-right">Sub D7</th>
              <th className="py-1 pr-3 text-right">CPA D7</th>
              <th className="py-1 pr-3 text-right">ROI D7</th>
              <th className="py-1 text-right">Install CVR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // In a 2-row weekday-vs-weekend table, each row IS the
              // other's baseline. Find the other row to use as the
              // comparison anchor; if only one row exists (degenerate),
              // neutral the tone so we don't pretend to compare nothing.
              const other = rows.find((x) => x.bucket !== r.bucket);
              const cpaTone = other
                ? cellTone(r.cpa_d7, other.cpa_d7, "lower-better")
                : "neutral";
              const roiTone = other
                ? cellTone(r.roi_d7, other.roi_d7, "higher-better")
                : "neutral";
              const cvrTone = other
                ? cellTone(r.install_cvr, other.install_cvr, "higher-better")
                : "neutral";
              return (
                <tr
                  key={r.bucket}
                  className="group border-t transition-colors hover:bg-[color-mix(in_oklab,var(--color-ua)_6%,transparent)]"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <td className="py-2 pr-3 font-medium text-[color:var(--text-primary)]">
                    {r.bucket === "weekend" ? "Weekend" : "Weekday"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {fmtMoney(r.spend)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {fmtCount(r.installs)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {fmtCount(r.sub_d7)}
                  </td>
                  <td
                    className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-primary)] transition-colors"
                    style={{ background: toneBackground(cpaTone) }}
                    title={other ? `CPA D7 vs the other bucket` : undefined}
                  >
                    {fmtMoney(r.cpa_d7)}
                  </td>
                  <td
                    className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-primary)] transition-colors"
                    style={{ background: toneBackground(roiTone) }}
                    title={other ? `ROI D7 vs the other bucket` : undefined}
                  >
                    {fmtRoi(r.roi_d7)}
                  </td>
                  <td
                    className="py-2 text-right tabular-nums text-[color:var(--text-primary)] transition-colors"
                    style={{ background: toneBackground(cvrTone) }}
                    title={other ? `Install CVR vs the other bucket` : undefined}
                  >
                    {fmtRatio(r.install_cvr)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <SpendBars rows={rows} totalSpend={totalSpend} />
      </div>
    </GlassCard>
  );
}

function SpendBars({
  rows,
  totalSpend,
}: {
  rows: WeekendsRow[];
  totalSpend: number;
}) {
  if (totalSpend === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="font-body text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        Spend share
      </span>
      {rows.map((r) => {
        const share = totalSpend > 0 ? r.spend / totalSpend : 0;
        return (
          <div key={r.bucket} className="flex items-center gap-3 font-body text-sm">
            <span className="min-w-[64px] text-[color:var(--text-primary)]">
              {r.bucket === "weekend" ? "Weekend" : "Weekday"}
            </span>
            <div
              className="h-2 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--surface-input)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${share * 100}%`,
                  background: "var(--color-ua)",
                }}
              />
            </div>
            <span className="w-12 text-right tabular-nums text-[color:var(--text-secondary)]">
              {(share * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
