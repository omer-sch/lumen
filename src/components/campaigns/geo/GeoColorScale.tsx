"use client";

import type { Buckets } from "./ChoroplethMap";

type Props = {
  buckets: Buckets;
};

/**
 * Horizontal gradient legend for the choropleth's color buckets. Reads
 * from `computeBuckets`'s output so the threshold labels stay in sync
 * with whatever the map is actually painting. Capped at ~480px wide,
 * centered, hairline outline to keep it from competing visually with
 * the map and donut above.
 *
 * Threshold labels: the 25/50/75 quartile cutoffs in compact form
 * ("1.2k" instead of "1,234") so they fit in the available width.
 */
export function GeoColorScale({ buckets }: Props) {
  const { thresholds, max } = buckets;
  return (
    <div
      className="mx-auto flex w-full max-w-[480px] flex-col gap-1.5"
      data-testid="geo-color-scale"
    >
      <div
        className="h-2.5 w-full rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--surface-hover) 0%, color-mix(in oklab, var(--color-ua) 18%, var(--surface-base)) 25%, color-mix(in oklab, var(--color-ua) 38%, var(--surface-base)) 50%, color-mix(in oklab, var(--color-ua) 60%, var(--surface-base)) 75%, var(--color-ua) 100%)",
          border:
            "1px solid color-mix(in oklab, var(--color-ua) 22%, transparent)",
        }}
      />
      <div className="flex justify-between font-body text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
        <span>0</span>
        <span>{fmtCompact(thresholds[0])}</span>
        <span>{fmtCompact(thresholds[1])}</span>
        <span>{fmtCompact(thresholds[2])}</span>
        <span>{fmtCompact(max)}</span>
      </div>
      <p className="text-center font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        Sub D7 per country
      </p>
    </div>
  );
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}
