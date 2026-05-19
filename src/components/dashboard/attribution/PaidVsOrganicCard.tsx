"use client";

import { useEffect, useState } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type Props = {
  data: {
    subTotal: number;
    paid: number;
    organic: number;
  };
  enterIndex?: number;
  className?: string;
};

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Paid vs Organic split — replaces the legacy two-card pair
 * (PaidVsOrganic + PaidVsOrganicMix). Single GlassCard with:
 *
 *   - 3 sub-tiles in a row: Sub Total / Sub Paid / Sub Organic
 *   - Horizontal stacked share bar (mint Paid, violet Organic)
 *   - One-line caption explaining what "blended" buys us
 *
 * The donut went away because the share bar already conveys the split
 * more honestly at small widths, and the legacy donut + KPI strip
 * pairing fought BcacHero for visual weight on the same row.
 */
export function PaidVsOrganicCard({ data, enterIndex, className }: Props) {
  const total = data.paid + data.organic;
  const paidPct = total > 0 ? data.paid / total : 0;
  const organicPct = total > 0 ? data.organic / total : 0;

  // Bar grows from 0 → real split on mount with brand easing — same
  // motion the ChannelMix bars use so the page reads as one system.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimated(true);
      return;
    }
    const t = window.setTimeout(() => setAnimated(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className={cn("flex flex-col gap-4 p-5", className)}
      data-testid="attribution-paid-vs-organic"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-md font-bold leading-none text-cloud-white">
          Paid vs Organic
        </h2>
        <p className="font-body text-[11px] text-[color:var(--text-muted)]">
          Cohort-attributed subscribers in the active window.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <SubTile
          id="paid-vs-organic-sub-total"
          label="Sub Total"
          count={data.subTotal}
          colorVar="var(--text-primary)"
        />
        <SubTile
          id="paid-vs-organic-sub-paid"
          label="Sub Paid"
          count={data.paid}
          share={paidPct}
          colorVar="var(--color-ua)"
        />
        <SubTile
          id="paid-vs-organic-sub-organic"
          label="Sub Organic"
          count={data.organic}
          share={organicPct}
          colorVar="var(--color-organic)"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div
          className="relative flex h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--surface-track)" }}
          role="img"
          aria-label={`Paid ${(paidPct * 100).toFixed(0)} percent, Organic ${(organicPct * 100).toFixed(0)} percent`}
          data-testid="attribution-paid-vs-organic-bar"
        >
          <div
            className="h-full transition-transform duration-1000 ease-out-quart"
            style={{
              width: `${paidPct * 100}%`,
              transformOrigin: "left center",
              transform: `scaleX(${animated ? 1 : 0})`,
              background:
                "linear-gradient(90deg, var(--color-ua), var(--color-ua-glow))",
              boxShadow:
                "0 0 10px color-mix(in oklab, var(--color-ua) 50%, transparent)",
            }}
            data-testid="attribution-paid-vs-organic-bar-paid"
          />
          <div
            className="h-full transition-transform duration-1000 ease-out-quart"
            style={{
              width: `${organicPct * 100}%`,
              transformOrigin: "left center",
              transform: `scaleX(${animated ? 1 : 0})`,
              transitionDelay: "120ms",
              background: "var(--color-organic)",
              opacity: 0.85,
            }}
            data-testid="attribution-paid-vs-organic-bar-organic"
          />
        </div>
        <div className="flex items-center justify-between font-body text-[11px] text-[color:var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-ua)" }}
            />
            Paid {(paidPct * 100).toFixed(1)}%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-organic)" }}
            />
            Organic {(organicPct * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <p className="font-body text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        Organic halo lifts paid efficiency — higher organic share pushes BCAC down.
      </p>
    </GlassCard>
  );
}

function SubTile({
  id,
  label,
  count,
  share,
  colorVar,
}: {
  id: string;
  label: string;
  count: number;
  share?: number;
  colorVar: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={`kpi-${id}`}>
      <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
        {label}
      </span>
      <span
        className="font-display text-2xl font-extrabold leading-none tabular-nums"
        style={{ color: colorVar }}
      >
        {fmtCount(count)}
      </span>
      {share != null && (
        <span className="font-body text-[11px] text-[color:var(--text-secondary)] tabular-nums">
          {(share * 100).toFixed(1)}%
        </span>
      )}
    </div>
  );
}
