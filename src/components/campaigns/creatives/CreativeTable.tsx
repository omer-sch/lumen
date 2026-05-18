"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cellTone, type CellTone } from "@/lib/dashboard/cell-tone";
import { formatKpi } from "@/lib/format";
import type { CreativeRow } from "@/lib/globalcomix-queries";

type Props = {
  rows: CreativeRow[];
};

/**
 * Per-ad table — 12 columns matching the GlobalComix Looker dashboard's
 * Creative Breakdown page. Spend column has a blue intensity bar
 * background (the higher the row's share of the table's total spend,
 * the wider the tint). Rate-metric cells (CPI / CP SubStart / CPA D0 /
 * CPA D7) are tinted against the table's grand-total average baseline
 * — lower-is-better polarity for all four. Meta ads show a thumbnail
 * inline next to the ad name; other networks render a neutral
 * placeholder. Rows without per-ad spend (Google / Apple) print "—" on
 * the rate metrics and sort to the bottom of the spend-DESC order.
 */
export function CreativeTable({ rows }: Props) {
  // Baselines for the rate-metric cell-tone tints. Pre-computed once
  // per render — a simple grand-total average across all rows is the
  // table's local "what does normal look like" reference. Rate cells
  // tint against this so an analyst can scan visually for outliers
  // without doing the per-network averaging in their head.
  const baselines = useMemo(() => computeBaselines(rows), [rows]);

  // Spend intensity bar uses the row's spend / max spend so the largest
  // row reaches 100% fill and everything else scales down.
  const maxSpend = useMemo(
    () =>
      rows.reduce(
        (acc, r) => (r.spend != null && r.spend > acc ? r.spend : acc),
        0,
      ),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <GlassCard className="p-6" data-testid="creative-table-empty">
        <EmptyState
          title="No creatives match the current filters"
          description="Try widening the date range, clearing filter chips, or selecting a different client."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard
      className="flex flex-col gap-3 p-3"
      data-testid="creative-table"
    >
      {/* Horizontal scroll under 1024px — keeps every column visible
          without folding columns onto a second row. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1024px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              <Th className="text-left">Ad Name</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Impr</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">Installs</Th>
              <Th className="text-right">CPI</Th>
              <Th className="text-right">SubStart</Th>
              <Th className="text-right">CP SubStart</Th>
              <Th className="text-right">Sub D0</Th>
              <Th className="text-right">CPA D0</Th>
              <Th className="text-right">Sub D7</Th>
              <Th className="text-right">CPA D7</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const spendFillPct =
                r.spend != null && maxSpend > 0
                  ? Math.max(2, Math.round((r.spend / maxSpend) * 100))
                  : 0;
              const cpSubStart = derivedRate(r.spend, r.sub_start_d7);
              return (
                <tr
                  key={`${r.network}-${r.ad_id}`}
                  data-testid={`creative-row-${r.ad_id}`}
                  className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                >
                  {/* Ad name + thumbnail. Truncated with a title tooltip
                      so the encoded archetype / format / version stays
                      readable for analysts who learned the convention. */}
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-3">
                      {r.thumbnail_url ? (
                        <Image
                          src={r.thumbnail_url}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-[color:var(--text-muted)]"
                          style={{ background: "var(--surface-hover)" }}
                        >
                          <Megaphone className="h-4 w-4" strokeWidth={2} />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span
                          className="max-w-[16rem] truncate font-medium text-cloud-white"
                          title={r.ad_name}
                        >
                          {r.ad_name || r.ad_id}
                        </span>
                        <span className="font-body text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                          {r.network} · {r.adset_name || "—"}
                        </span>
                      </span>
                    </div>
                  </td>

                  <SpendCell value={r.spend} fillPct={spendFillPct} />
                  <NumCell value={r.impressions} />
                  <NumCell value={r.clicks} />
                  <NumCell value={r.installs} />
                  <RateCell
                    value={r.cpi}
                    baseline={baselines.cpi}
                    format={formatKpi.cpi}
                    metricLabel="CPI"
                  />
                  <NumCell value={r.sub_start_d7} />
                  <RateCell
                    value={cpSubStart}
                    baseline={baselines.cpSubStart}
                    format={formatKpi.cpi}
                    metricLabel="CP SubStart"
                  />
                  {/* Sub D0 / CPA D0 placeholders: cohort table only
                      surfaces sub_d0 at the (date, network) grain post-
                      WS2; per-ad sub_d0 isn't joined yet, so these read
                      as "—" until a follow-up extends the cohort sub. */}
                  <DashCell />
                  <DashCell />
                  <NumCell value={r.sub_d7} />
                  <RateCell
                    value={r.cpa_d7}
                    baseline={baselines.cpaD7}
                    format={formatKpi.cpi}
                    metricLabel="CPA D7"
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ── Cell renderers ────────────────────────────────────────────────────

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "select-none whitespace-nowrap px-3 pb-2 pt-1",
        className,
      )}
    >
      {children}
    </th>
  );
}

function NumCell({ value }: { value: number | null }) {
  if (value == null) return <DashCell />;
  return (
    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
      {value.toLocaleString("en-US")}
    </td>
  );
}

function DashCell() {
  return (
    <td className="whitespace-nowrap px-3 py-3 text-right text-[color:var(--text-muted)]">
      —
    </td>
  );
}

function SpendCell({
  value,
  fillPct,
}: {
  value: number | null;
  fillPct: number;
}) {
  if (value == null) return <DashCell />;
  return (
    <td className="relative whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1.5 left-0 rounded-sm"
        style={{
          width: `${fillPct}%`,
          background:
            "linear-gradient(90deg, color-mix(in oklab, var(--color-blue, #4FA9FF) 22%, transparent), color-mix(in oklab, var(--color-blue, #4FA9FF) 4%, transparent))",
        }}
      />
      <span className="relative z-10">{formatKpi.money(value)}</span>
    </td>
  );
}

function RateCell({
  value,
  baseline,
  format,
  metricLabel,
}: {
  value: number | null;
  baseline: number | null;
  format: (n: number) => string;
  metricLabel: string;
}) {
  if (value == null) return <DashCell />;
  const tone = cellTone(value, baseline ?? null, "lower-better");
  return (
    <td
      className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white"
      title={
        baseline != null && baseline > 0
          ? `${metricLabel}: ${format(value)} vs table avg ${format(baseline)}`
          : undefined
      }
    >
      <span
        className="inline-flex items-center justify-end rounded-sm px-1.5 py-0.5"
        style={{ background: toneBackground(tone) }}
      >
        {format(value)}
      </span>
    </td>
  );
}

function toneBackground(tone: CellTone): string {
  switch (tone) {
    case "good":
      return "color-mix(in oklab, var(--color-ua) 14%, transparent)";
    case "bad":
      return "color-mix(in oklab, var(--color-creative) 14%, transparent)";
    case "warn":
      return "color-mix(in oklab, var(--color-yellow) 12%, transparent)";
    default:
      return "transparent";
  }
}

// ── Math helpers ──────────────────────────────────────────────────────

function derivedRate(
  spend: number | null,
  denominator: number | null,
): number | null {
  if (spend == null || denominator == null || denominator <= 0) return null;
  return spend / denominator;
}

function computeBaselines(rows: CreativeRow[]) {
  // Grand-total averages for each rate metric. Sum of numerators / sum
  // of denominators is the right shape: averaging row-level rates would
  // weight a $5 ad the same as a $5,000 ad and shift the baseline.
  let spendTotal = 0;
  let installsTotal = 0;
  let subStartTotal = 0;
  let subD7Total = 0;
  for (const r of rows) {
    if (r.spend != null) spendTotal += r.spend;
    if (r.installs != null) installsTotal += r.installs;
    if (r.sub_start_d7 != null) subStartTotal += r.sub_start_d7;
    if (r.sub_d7 != null) subD7Total += r.sub_d7;
  }
  return {
    cpi: installsTotal > 0 ? spendTotal / installsTotal : null,
    cpSubStart: subStartTotal > 0 ? spendTotal / subStartTotal : null,
    cpaD7: subD7Total > 0 ? spendTotal / subD7Total : null,
  };
}
