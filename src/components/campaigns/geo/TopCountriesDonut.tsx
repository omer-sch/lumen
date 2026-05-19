"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { GeoRow } from "@/lib/globalcomix-queries";

type Props = {
  rows: GeoRow[];
  /** Stagger position for the GlassCard enter animation. */
  enterIndex?: number;
};

type Slice = {
  key: string;
  label: string;
  value: number;
  pct: number;
  fill: string;
};

/**
 * Slice colors for the top-5 + Others rollup. Mint anchors the
 * top-spender slice; descending mint tints fill #2-#5; Others uses a
 * neutral surface fill so it visually recedes (it's a rollup, not a
 * driver). All colors are token-resolved; no raw hex.
 */
const SLICE_FILLS = [
  "var(--color-ua)",
  "color-mix(in oklab, var(--color-ua) 70%, var(--surface-base))",
  "color-mix(in oklab, var(--color-ua) 50%, var(--surface-base))",
  "color-mix(in oklab, var(--color-ua) 35%, var(--surface-base))",
  "color-mix(in oklab, var(--color-ua) 22%, var(--surface-base))",
  "var(--surface-hover)", // Others
] as const;

const SIZE = 180;
const RADIUS_OUTER = 78;
const RADIUS_INNER = 50;
const CX = SIZE / 2;
const CY = SIZE / 2;

/**
 * Top-5 countries by Sub D7 + an "Others" rollup. Mirrors the visual
 * weight of ChannelMix without literally being a bar — the donut
 * shape is the Looker reference for the GEO page. Slice order is
 * mint-anchored on the top spender so the visual story leads with
 * "where most of the demand sits."
 */
export function TopCountriesDonut({ rows, enterIndex }: Props) {
  const [animated, setAnimated] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setAnimated(true);
      return;
    }
    const t = window.setTimeout(() => setAnimated(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  const { slices, total } = useMemo(() => buildSlices(rows), [rows]);

  if (slices.length === 0) {
    return (
      <GlassCard
        glow="ua"
        enterIndex={enterIndex}
        className="flex flex-col gap-3 p-4"
        data-testid="geo-top-countries-donut"
      >
        <div>
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            Top countries
          </h2>
          <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
            By Sub D7 share.
          </p>
        </div>
        <div className="grid place-items-center py-10 font-body text-xs text-[color:var(--text-muted)]">
          No geographic data for this window.
        </div>
      </GlassCard>
    );
  }

  // Compute arc start/end angles in radians from the cumulative sums.
  let cursor = -Math.PI / 2; // start at 12 o'clock
  const arcs = slices.map((s) => {
    const start = cursor;
    const end = cursor + (s.pct / 100) * Math.PI * 2;
    cursor = end;
    return { ...s, start, end };
  });

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className="flex flex-col gap-3 p-4"
      data-testid="geo-top-countries-donut"
    >
      <div>
        <h2 className="font-display text-md font-bold leading-none text-cloud-white">
          Top countries
        </h2>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          By Sub D7 share. Top 5 plus an Others rollup.
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-4">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Donut chart of top countries by Sub D7"
          className="shrink-0"
        >
          {arcs.map((a) => (
            <path
              key={a.key}
              d={animated ? donutSlicePath(a.start, a.end) : donutSlicePath(a.start, a.start)}
              fill={a.fill}
              opacity={hoveredKey == null || hoveredKey === a.key ? 1 : 0.4}
              onMouseEnter={() => setHoveredKey(a.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                cursor: "pointer",
                transition:
                  "d 560ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms ease",
              }}
            />
          ))}
          <text
            x={CX}
            y={CY - 6}
            textAnchor="middle"
            className="fill-cloud-white font-display"
            style={{ fontSize: 18, fontWeight: 800 }}
          >
            {fmtCompact(total)}
          </text>
          <text
            x={CX}
            y={CY + 12}
            textAnchor="middle"
            className="font-body"
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fill: "var(--text-muted)",
            }}
          >
            Sub D7
          </text>
        </svg>

        <ul className="flex flex-col gap-1.5">
          {slices.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-2 font-body text-xs"
              onMouseEnter={() => setHoveredKey(s.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                opacity: hoveredKey == null || hoveredKey === s.key ? 1 : 0.55,
                transition: "opacity 180ms ease",
              }}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.fill }}
              />
              <span className="min-w-0 flex-1 truncate text-cloud-white">
                {s.label}
              </span>
              <span className="text-[color:var(--text-muted)]">
                {s.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function buildSlices(rows: GeoRow[]): { slices: Slice[]; total: number } {
  const total = rows.reduce((acc, r) => acc + (r.sub_d7 ?? 0), 0);
  if (total <= 0) return { slices: [], total: 0 };

  const sorted = [...rows]
    .filter((r) => (r.sub_d7 ?? 0) > 0)
    .sort((a, b) => b.sub_d7 - a.sub_d7);

  const top = sorted.slice(0, 5);
  const restSum = sorted.slice(5).reduce((acc, r) => acc + r.sub_d7, 0);

  const slices: Slice[] = top.map((r, i) => ({
    key: r.country_code || r.country_name || `row-${i}`,
    label: r.country_name || r.country_code,
    value: r.sub_d7,
    pct: (r.sub_d7 / total) * 100,
    fill: SLICE_FILLS[i] ?? SLICE_FILLS[4]!,
  }));

  if (restSum > 0) {
    slices.push({
      key: "__others__",
      label: "Others",
      value: restSum,
      pct: (restSum / total) * 100,
      fill: SLICE_FILLS[5]!,
    });
  }

  return { slices, total };
}

/** SVG path for a donut slice between two angles (radians). Handles
 *  the >180° large-arc case so a single dominant slice still renders
 *  correctly. */
function donutSlicePath(startAngle: number, endAngle: number): string {
  // Guard: when start == end (the pre-animation collapsed state) we
  // emit an empty path. SVG renders nothing, which is exactly the
  // "grow from zero" starting frame we want.
  if (Math.abs(endAngle - startAngle) < 1e-6) return "";
  const x1 = CX + RADIUS_OUTER * Math.cos(startAngle);
  const y1 = CY + RADIUS_OUTER * Math.sin(startAngle);
  const x2 = CX + RADIUS_OUTER * Math.cos(endAngle);
  const y2 = CY + RADIUS_OUTER * Math.sin(endAngle);
  const x3 = CX + RADIUS_INNER * Math.cos(endAngle);
  const y3 = CY + RADIUS_INNER * Math.sin(endAngle);
  const x4 = CX + RADIUS_INNER * Math.cos(startAngle);
  const y4 = CY + RADIUS_INNER * Math.sin(startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${RADIUS_OUTER} ${RADIUS_OUTER} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${RADIUS_INNER} ${RADIUS_INNER} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}
