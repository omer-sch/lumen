"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { alpha2FromNumeric } from "@/lib/geo/iso-numeric";
import {
  loadCountriesTopology,
  type CountryFeature,
  type CountryFeatureCollection,
} from "@/lib/geo/topology";
import type { GeoRow } from "@/lib/globalcomix-queries";

type Props = {
  rows: GeoRow[];
  /** Stagger position for the GlassCard enter animation. */
  enterIndex?: number;
};

const VIEW_W = 800;
const VIEW_H = 460;

/**
 * Bucket thresholds expressed as token expressions resolved at paint
 * time. Five steps from a near-neutral surface tint to full mint:
 *
 *   bucket 0 — no data (rendered with no fill style; falls back to
 *              the SVG `fill` attribute below)
 *   buckets 1-4 — sequential mint ramp on top of the navy surface
 *
 * Quantile cutoffs are computed at render time from the non-zero
 * subset of `rows` (see `computeBuckets`). Quantile is the right
 * choice here because Sub D7 is heavily skewed (US dwarfs everything
 * else); a linear scale would push 95% of countries into bucket 1.
 */
const BUCKET_FILL = [
  "var(--surface-hover)",
  "color-mix(in oklab, var(--color-ua) 18%, var(--surface-base))",
  "color-mix(in oklab, var(--color-ua) 38%, var(--surface-base))",
  "color-mix(in oklab, var(--color-ua) 60%, var(--surface-base))",
  "var(--color-ua)",
] as const;

type HoverState = {
  alpha2: string;
  name: string;
  row: GeoRow | null;
  /** SVG-space client coords (0..VIEW_W, 0..VIEW_H). */
  x: number;
  y: number;
};

/**
 * Quantile-bucketed world choropleth. Coloring keyed on Sub D7 since
 * the cost-side per-country spend join is not yet shipped (it lives
 * in the same Phase-2 backlog as `queryGlobalComixGeo`'s zero-filled
 * spend column). The hover tooltip surfaces all available cohort
 * metrics for the country.
 */
export function ChoroplethMap({ rows, enterIndex }: Props) {
  const [topology, setTopology] = useState<CountryFeatureCollection | null>(
    null,
  );
  const [topoError, setTopoError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCountriesTopology()
      .then((fc) => {
        if (cancelled) return;
        setTopology(fc);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setTopoError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Index rows by alpha-2 for O(1) lookup per country during render.
  const rowsByAlpha2 = useMemo(() => {
    const out = new Map<string, GeoRow>();
    for (const r of rows) {
      if (r.country_code && r.country_code.length === 2) {
        out.set(r.country_code.toUpperCase(), r);
      }
    }
    return out;
  }, [rows]);

  const buckets = useMemo(() => computeBuckets(rows), [rows]);

  // Build the path generator against a Mercator projection sized to
  // the viewBox. The projection is rebuilt only when the topology
  // arrives — the country features themselves never change.
  const pathFor = useMemo(() => {
    if (!topology) return null;
    // Filter out Antarctica (id 010) before fitting so the rest of
    // the map gets the available vertical real estate. Mercator
    // distorts the poles badly and Antarctica isn't UA-relevant.
    const fittable: CountryFeatureCollection = {
      ...topology,
      features: topology.features.filter((f) => String(f.id) !== "010"),
    };
    const projection = geoMercator().fitSize([VIEW_W, VIEW_H], fittable);
    return geoPath(projection);
  }, [topology]);

  const hasAnyData = rowsByAlpha2.size > 0;

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className="flex flex-col gap-3 p-4"
      data-testid="geo-choropleth-map"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            Where subscribers come from
          </h2>
          <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
            Country fill keyed on Sub D7 (quantile buckets). Hover for detail.
          </p>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="relative w-full overflow-hidden rounded-md"
        style={{
          aspectRatio: `${VIEW_W} / ${VIEW_H}`,
          background:
            "color-mix(in oklab, var(--surface-base) 65%, transparent)",
          border: "1px solid var(--border-glass)",
        }}
      >
        {topology == null && topoError == null ? (
          <Skeleton className="h-full w-full" />
        ) : topoError != null ? (
          <div className="flex h-full items-center justify-center px-6 text-center font-body text-xs text-[color:var(--text-muted)]">
            Map data couldn&apos;t load. Try refreshing the page.
          </div>
        ) : (
          <svg
            role="img"
            aria-label="World map shaded by Sub D7"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="block h-full w-full"
            onMouseLeave={() => setHover(null)}
          >
            {/* Defs — soft drop shadow used when a country is hovered.
                Reused across all hovered paths instead of one-per-path. */}
            <defs>
              <filter id="geo-hover-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {pathFor != null &&
              topology?.features.map((f) => (
                <CountryPath
                  key={`${f.id ?? f.properties?.name ?? Math.random()}`}
                  feature={f}
                  d={pathFor(f) ?? ""}
                  bucket={bucketForFeature(f, rowsByAlpha2, buckets)}
                  hovered={
                    hover != null &&
                    hover.alpha2 === alpha2FromNumeric(String(f.id ?? "")) &&
                    hover.alpha2 != null
                  }
                  onEnter={(svgX, svgY) => {
                    const alpha2 = alpha2FromNumeric(String(f.id ?? ""));
                    if (!alpha2) {
                      // Country isn't in the alpha-2 map (Antarctica,
                      // disputed regions). Still allow the hover label
                      // to surface "no data" so the user gets feedback.
                      setHover({
                        alpha2: "",
                        name: f.properties?.name ?? "Unknown",
                        row: null,
                        x: svgX,
                        y: svgY,
                      });
                      return;
                    }
                    const row = rowsByAlpha2.get(alpha2) ?? null;
                    setHover({
                      alpha2,
                      name: row?.country_name ?? f.properties?.name ?? alpha2,
                      row,
                      x: svgX,
                      y: svgY,
                    });
                  }}
                />
              ))}
          </svg>
        )}

        {hover != null && <MapTooltip hover={hover} viewW={VIEW_W} viewH={VIEW_H} />}

        {/* Empty-state overlay — pinned to the bottom-left so it doesn't
            block hover on countries. */}
        {!hasAnyData && topology != null && (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-md px-3 py-2 font-body text-xs text-[color:var(--text-secondary)]"
            style={{
              background:
                "color-mix(in oklab, var(--surface-base) 75%, transparent)",
              border: "1px solid var(--border-glass)",
            }}
          >
            No geographic data for this window.
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

type CountryPathProps = {
  feature: CountryFeature;
  d: string;
  bucket: number;
  hovered: boolean;
  onEnter: (svgX: number, svgY: number) => void;
};

function CountryPath({ feature: _f, d, bucket, hovered, onEnter }: CountryPathProps) {
  return (
    <path
      d={d}
      fill={BUCKET_FILL[bucket]}
      stroke={
        hovered
          ? "var(--color-ua)"
          : "color-mix(in oklab, var(--cloud-white) 12%, transparent)"
      }
      strokeWidth={hovered ? 1.25 : 0.5}
      filter={hovered ? "url(#geo-hover-glow)" : undefined}
      onMouseEnter={(e) => {
        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) {
          onEnter(0, 0);
          return;
        }
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
        const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
        onEnter(x, y);
      }}
      onMouseMove={(e) => {
        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
        const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
        onEnter(x, y);
      }}
      style={{
        cursor: bucket > 0 ? "pointer" : "default",
        transition: "stroke 180ms ease, stroke-width 180ms ease",
      }}
    />
  );
}

type TooltipProps = {
  hover: HoverState;
  viewW: number;
  viewH: number;
};

function MapTooltip({ hover, viewW, viewH }: TooltipProps) {
  // Anchor the tooltip in CSS percentages so it tracks with the SVG's
  // responsive resize without a ResizeObserver. Flip the tooltip to
  // the left of the cursor when we're past 70% of the width so it
  // doesn't get clipped at the right edge.
  const flipX = hover.x / viewW > 0.7;
  const flipY = hover.y / viewH > 0.7;
  const leftPct = (hover.x / viewW) * 100;
  const topPct = (hover.y / viewH) * 100;
  const total = hover.row ? hover.row.sub_d7 : 0;
  const paid = hover.row ? hover.row.sub_paid : 0;
  const organic = hover.row ? hover.row.sub_organic : 0;
  const rev = hover.row ? hover.row.rev_d7 : 0;

  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[180px] -translate-x-1/2 -translate-y-2 rounded-md px-3 py-2 font-body text-xs leading-snug"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(${flipX ? "-100%" : "-50%"}, ${flipY ? "-100%" : "8px"})`,
        background: "color-mix(in oklab, var(--surface-base) 88%, transparent)",
        border: "1px solid var(--border-glass)",
        boxShadow:
          "0 8px 24px color-mix(in oklab, var(--surface-base) 60%, transparent)",
        backdropFilter: "var(--blur-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
      }}
    >
      <p className="font-display text-sm font-bold text-cloud-white">
        {hover.name}
      </p>
      {hover.row ? (
        <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
          <dt className="text-[color:var(--text-muted)]">Sub D7</dt>
          <dd className="text-right font-medium text-cloud-white">{fmtCount(total)}</dd>
          <dt className="text-[color:var(--text-muted)]">Paid</dt>
          <dd className="text-right text-cloud-white">{fmtCount(paid)}</dd>
          <dt className="text-[color:var(--text-muted)]">Organic</dt>
          <dd className="text-right text-cloud-white">{fmtCount(organic)}</dd>
          <dt className="text-[color:var(--text-muted)]">Rev D7</dt>
          <dd className="text-right text-cloud-white">{fmtMoney(rev)}</dd>
        </dl>
      ) : (
        <p className="mt-1 text-[color:var(--text-muted)]">No data for this window.</p>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

export type Buckets = {
  /** Quartile thresholds for non-zero values. Partition the data into
   *  4 colored buckets (1-4); bucket 0 is reserved for no-data. */
  thresholds: [number, number, number];
  /** Max value across non-zero rows. Useful for the color scale legend. */
  max: number;
};

export function computeBuckets(rows: GeoRow[]): Buckets {
  const values = rows
    .map((r) => r.sub_d7)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return { thresholds: [0, 0, 0], max: 0 };
  }
  const q = (p: number) => {
    const idx = Math.min(
      values.length - 1,
      Math.max(0, Math.floor(p * values.length)),
    );
    return values[idx]!;
  };
  return {
    thresholds: [q(0.25), q(0.5), q(0.75)],
    max: values[values.length - 1]!,
  };
}

export function bucketForValue(value: number, buckets: Buckets): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const [t1, t2, t3] = buckets.thresholds;
  if (value < t1) return 1;
  if (value < t2) return 2;
  if (value < t3) return 3;
  return 4;
}

function bucketForFeature(
  f: CountryFeature,
  rowsByAlpha2: Map<string, GeoRow>,
  buckets: Buckets,
): number {
  const alpha2 = alpha2FromNumeric(String(f.id ?? ""));
  if (!alpha2) return 0;
  const row = rowsByAlpha2.get(alpha2);
  if (!row) return 0;
  return bucketForValue(row.sub_d7, buckets);
}

const fmtCount = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
const fmtMoney = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};
