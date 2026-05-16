"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import {
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  networkColor,
  networkLineDashed,
} from "@/lib/dashboard/network-colors";
import type { KpiId, TrendPoint } from "@/types/dashboard";

type TrendByNetwork = { network: string; points: TrendPoint[] };

type TrendChartProps = {
  /** Aggregate series. Used when `trendByNetwork` is empty (legacy
   *  agent-strategy clients) or when the chart falls back to a single
   *  line for the campaign profile. Carries every metric per date. */
  trend: TrendPoint[];
  /** Per-network series. When present and non-empty, the chart renders
   *  one colored line per network instead of the legacy aggregate. */
  trendByNetwork?: TrendByNetwork[];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
  /** Optional initial metric. Defaults to `spend` (Volume) — the
   *  daily-glance read most users open the chart for. Callers can
   *  override to land on a different hero metric. */
  initialMetric?: KpiId;
};

type MetricSpec = {
  id: KpiId;
  label: string;
  /** y-axis / tooltip formatter. */
  format: (n: number) => string;
  /**
   * Cohort-based metrics depend on follow-up windows that mature over
   * time. Marking them as cohort=true does two things: it adds a "tail"
   * indicator pill to the tab, and it fades the chart's right edge by
   * the metric's maturity window when this metric is active.
   */
  cohort?: number; // days of maturity (e.g. 7, 30, 90)
};

const fmtMoneyShort = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}k`
      : `$${n}`;
const fmtCount = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
const fmtRatio = (n: number) => `${n.toFixed(2)}x`;
const fmtMoneyCents = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(2)}k` : `$${n.toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

const METRICS: Record<KpiId, MetricSpec> = {
  spend:       { id: "spend",       label: "Spend",                       format: fmtMoneyShort },
  impressions: { id: "impressions", label: "Impressions",                 format: fmtCount      },
  clicks:      { id: "clicks",      label: "Clicks",                      format: fmtCount      },
  installs:    { id: "installs",    label: "Installs",                    format: fmtCount      },
  subStart:    { id: "subStart",    label: "Sub starts",                  format: fmtCount      },
  subD0:       { id: "subD0",       label: "Subscribers · 1 day",         format: fmtCount,     cohort: 1  },
  subD7:       { id: "subD7",       label: "Subscribers · 1 week",        format: fmtCount,     cohort: 7  },
  cpi:         { id: "cpi",         label: "Cost per install",            format: fmtMoneyCents },
  cpSubStart:  { id: "cpSubStart",  label: "Cost per sub start",          format: fmtMoneyCents },
  cpaD0:       { id: "cpaD0",       label: "Cost per subscriber · 1 day", format: fmtMoneyCents, cohort: 1  },
  cpaD7:       { id: "cpaD7",       label: "Cost per subscriber · 1 week",format: fmtMoneyCents, cohort: 7  },
  ctr:         { id: "ctr",         label: "Click rate",                  format: fmtPct        },
  cpm:         { id: "cpm",         label: "Cost per 1k impr.",           format: fmtMoneyCents },
  cpc:         { id: "cpc",         label: "Cost per click",              format: fmtMoneyCents },
  retD7:       { id: "retD7",       label: "Came back · 1 week",          format: fmtPct,       cohort: 7  },
  revD7:       { id: "revD7",       label: "Revenue · 1 week",            format: fmtMoneyShort, cohort: 7  },
  revD30:      { id: "revD30",      label: "Revenue · 1 month",           format: fmtMoneyShort, cohort: 30 },
  roas:        { id: "roas",        label: "Money back · 1 week",         format: fmtRatio,     cohort: 7  },
  roasD14:     { id: "roasD14",     label: "Money back · 2 weeks",        format: fmtRatio,     cohort: 14 },
  roasD30:     { id: "roasD30",     label: "Money back · 1 month",        format: fmtRatio,     cohort: 30 },
  roasD90:     { id: "roasD90",     label: "Money back · 3 months",       format: fmtRatio,     cohort: 90 },
  payersD7:    { id: "payersD7",    label: "Payers · 1 week",             format: fmtCount,     cohort: 7  },
  ftdD7:       { id: "ftdD7",       label: "First deposits · 1 week",     format: fmtCount,     cohort: 7  },
};

type MetricGroup = {
  label: string;
  metrics: KpiId[];
};

const METRIC_GROUPS: MetricGroup[] = [
  {
    label: "Volume",
    metrics: ["spend", "installs", "clicks", "impressions", "subStart", "subD0", "subD7"],
  },
  {
    label: "Efficiency",
    metrics: ["cpi", "ctr", "cpm", "cpc", "cpSubStart", "cpaD0", "cpaD7"],
  },
  {
    label: "Revenue",
    metrics: ["revD7", "revD30"],
  },
  {
    label: "Money back",
    metrics: ["roas", "roasD14", "roasD30", "roasD90"],
  },
  {
    label: "Users",
    metrics: ["retD7", "payersD7", "ftdD7"],
  },
];

export function TrendChart({
  trend,
  trendByNetwork,
  enterIndex,
  initialMetric = "spend",
}: TrendChartProps) {
  const [metric, setMetric] = useState<KpiId>(initialMetric);
  const active = METRICS[metric] ?? METRICS.spend;

  // The visible groups are those that have at least one metric we know
  // how to render. The active group is the one that owns the current
  // metric (or the first visible group if the current metric is orphaned).
  const visibleGroups = METRIC_GROUPS.map((group) => ({
    ...group,
    metrics: group.metrics.filter((id) => Boolean(METRICS[id])),
  })).filter((g) => g.metrics.length > 0);
  const activeGroup =
    visibleGroups.find((g) => g.metrics.includes(metric)) ?? visibleGroups[0];

  // Per-network rendering when we have it. Falls back to a single
  // synthetic "All" series built from the aggregate so legacy callers
  // (campaign profile) still render.
  const byNetwork: TrendByNetwork[] =
    trendByNetwork && trendByNetwork.length > 0
      ? trendByNetwork
      : [{ network: "All", points: trend }];

  // Build a row-per-date dataset for recharts. Each row's keys are the
  // network names so we can render one <Line> per network with
  // `dataKey={network}`.
  const dates = uniqueDatesPreservingOrder(byNetwork);
  const chartData = dates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const series of byNetwork) {
      const point = series.points.find((p) => p.date === date);
      const raw = point ? (point[metric] as number | undefined) : undefined;
      row[series.network] = raw ?? 0;
    }
    return row;
  });

  // Maturity tail — fade the right edge of the chart when a cohort
  // metric is active. Width is `min(cohort_days, chart_dates)` so the
  // overlay never exceeds the chart. The faded zone starts at the date
  // `cohort_days` from the end of the series.
  const maturityDays = active.cohort ?? 0;
  const fadeStartDate =
    maturityDays > 0 && dates.length > 0
      ? dates[Math.max(0, dates.length - maturityDays)]
      : null;
  const showMaturityNote = maturityDays > 0 && fadeStartDate != null;

  return (
    <GlassCard
      glow="ua"
      feature
      shimmer
      enterIndex={enterIndex}
      className="flex h-full flex-col p-3"
      data-testid="trend-chart"
      data-metric={metric}
    >
      <div className="mb-2 min-w-0">
        <h2
          className="font-display text-md font-bold leading-none text-cloud-white"
          data-testid="trend-chart-title"
        >
          {active.label} over time, by ad network.
        </h2>
        <p className="mt-0.5 font-body text-[11px] text-[color:var(--text-muted)]">
          Daily, last {dates.length} days · split by ad network
        </p>
      </div>

      {/* Group pills — pick a category, then a metric inside it. */}
      <div
        className="mb-2 flex flex-col gap-1.5 rounded-md p-1.5"
        style={{
          background: "var(--surface-input)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleGroups.map((group) => {
            const isActive = activeGroup?.label === group.label;
            return (
              <button
                key={group.label}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`trend-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  if (!isActive) setMetric(group.metrics[0]);
                }}
                className={cn(
                  "rounded-sm px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-[0.12em] transition-[background-color,color,box-shadow] duration-200 ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                  isActive
                    ? "text-cloud-white"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                )}
                style={
                  isActive
                    ? {
                        background: "color-mix(in oklab, var(--color-ua) 14%, transparent)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklab, var(--color-ua) 35%, transparent)",
                      }
                    : undefined
                }
              >
                {group.label}
              </button>
            );
          })}
        </div>
        {activeGroup && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--border-subtle)] pt-1.5">
            {activeGroup.metrics.map((id) => {
              const m = METRICS[id];
              if (!m) return null;
              const isActive = m.id === metric;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  data-testid={`trend-metric-${m.id}`}
                  aria-selected={isActive}
                  onClick={() => setMetric(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                    isActive
                      ? "text-ua"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                  )}
                  style={
                    isActive
                      ? {
                          background: "var(--color-ua-dim)",
                          boxShadow:
                            "inset 0 0 0 1px color-mix(in oklab, var(--color-ua) 35%, transparent)",
                        }
                      : undefined
                  }
                >
                  {m.label}
                  {m.cohort && (
                    <Info
                      aria-label={`Recent days within the last ${m.cohort} days are still maturing.`}
                      className="h-3 w-3 shrink-0"
                      style={{ color: "var(--color-yellow)" }}
                      strokeWidth={2.25}
                    >
                      <title>
                        {`Recent days are still maturing. They may read lower than the truth.`}
                      </title>
                    </Info>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative w-full flex-1 min-h-[14rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
          >
            <defs>
              <linearGradient id="trend-maturity-fade" x1="0" y1="0" x2="1" y2="0">
                <stop
                  offset="0%"
                  stopColor="var(--color-yellow)"
                  stopOpacity={0}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-yellow)"
                  stopOpacity={0.14}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={active.format}
              width={56}
            />
            {fadeStartDate && dates.length > 1 && (
              <>
                <ReferenceArea
                  x1={fadeStartDate}
                  x2={dates[dates.length - 1]}
                  ifOverflow="extendDomain"
                  fill="url(#trend-maturity-fade)"
                  stroke="none"
                />
                <ReferenceLine
                  x={fadeStartDate}
                  stroke="var(--color-yellow)"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  ifOverflow="extendDomain"
                />
              </>
            )}
            <Tooltip
              cursor={{ stroke: "var(--color-ua)", strokeOpacity: 0.4, strokeWidth: 1 }}
              contentStyle={{
                background: "var(--surface-elevated)",
                backdropFilter: "blur(12px)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                color: "var(--text-primary)",
                fontSize: 12,
                boxShadow: "var(--shadow-elevated)",
              }}
              labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
              formatter={(value, name) => [
                active.format(typeof value === "number" ? value : Number(value)),
                String(name),
              ]}
            />
            {byNetwork.map((series, idx) => {
              const isAll = series.network === "All";
              const stroke = isAll
                ? "var(--color-ua)"
                : networkColor(series.network);
              const dashed = !isAll && networkLineDashed(series.network);
              return (
                <Line
                  key={series.network}
                  type="monotone"
                  dataKey={series.network}
                  name={series.network}
                  stroke={stroke}
                  strokeWidth={2.5}
                  strokeDasharray={dashed ? "5 3" : undefined}
                  strokeOpacity={dashed ? 0.85 : 1}
                  dot={false}
                  activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
                  isAnimationActive={idx === 0}
                />
              );
            })}
            {/* End-of-line labels with vertical collision avoidance. Drawn
             *  as a single SVG group via Customized so we can read the
             *  chart's pixel coords for every series and push overlapping
             *  labels apart along Y before rendering. */}
            <Customized
              component={(props: unknown) => (
                <EndOfLineLabels
                  chartProps={props}
                  byNetwork={byNetwork}
                  chartData={chartData}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {showMaturityNote && (
        <p
          data-testid="trend-maturity-note"
          className="mt-2 font-body text-[11px] italic leading-relaxed text-[color:var(--text-muted)]"
        >
          Days within the last {maturityDays}{" "}
          {maturityDays === 1 ? "day" : "days"} are still maturing.
        </p>
      )}
    </GlassCard>
  );
}


/**
 * End-of-line labels for the multi-network trend chart, with vertical
 * collision avoidance. Renders inside recharts' SVG via `Customized` so
 * it can read the resolved x/y axis scales and place every label in one
 * pass — if two labels would overlap (within MIN_GAP px vertically), the
 * lower one is nudged down. A short connector hooks each label back to
 * its line's terminal point so the mapping stays clear after the nudge.
 */
function EndOfLineLabels({
  chartProps,
  byNetwork,
  chartData,
}: {
  chartProps: unknown;
  byNetwork: TrendByNetwork[];
  chartData: Array<Record<string, number | string>>;
}) {
  const props = chartProps as {
    width?: number;
    offset?: { left?: number; right?: number };
    xAxisMap?: Record<
      string,
      {
        scale: (v: string | number) => number;
        bandwidth?: () => number;
      }
    >;
    yAxisMap?: Record<string, { scale: (v: number) => number }>;
  };
  const xAxis = Object.values(props.xAxisMap ?? {})[0];
  const yAxis = Object.values(props.yAxisMap ?? {})[0];
  if (!xAxis || !yAxis) return null;

  // Right edge of the plot area in px. We anchor labels here (textAnchor=
  // "end") so they grow leftward into the chart instead of reserving a
  // wide right margin. A short connector line ties each label back to
  // its data endpoint so the network-to-line mapping stays clear when
  // the label sits inside the chart area.
  const chartWidth = props.width ?? 0;
  const rightOffset = props.offset?.right ?? 0;
  const rightEdge = chartWidth - rightOffset - 2;

  type LabelEntry = {
    network: string;
    color: string;
    px: number;
    dataY: number;
    y: number;
  };

  const entries: LabelEntry[] = [];
  for (const series of byNetwork) {
    if (series.network === "All") continue;
    const lastIdx = findLastVisibleDate(chartData, series.network);
    if (lastIdx == null) continue;
    const row = chartData[lastIdx];
    const v = row[series.network];
    if (typeof v !== "number" || v === 0) continue;
    const date = row.date as string;
    let px = xAxis.scale(date);
    // Recharts band scales return the left edge of the band; center it.
    if (typeof xAxis.bandwidth === "function") {
      px += xAxis.bandwidth() / 2;
    }
    const py = yAxis.scale(v);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    entries.push({
      network: series.network,
      color: networkColor(series.network),
      px,
      dataY: py,
      y: py,
    });
  }

  if (entries.length === 0) return null;

  // Sort by anchor Y ascending; push overlapping labels apart with a
  // single forward pass at MIN_GAP minimum spacing.
  entries.sort((a, b) => a.dataY - b.dataY);
  const MIN_GAP = 14;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].y - entries[i - 1].y < MIN_GAP) {
      entries[i].y = entries[i - 1].y + MIN_GAP;
    }
  }

  return (
    <g pointerEvents="none" data-testid="trend-end-labels">
      {entries.map((e) => {
        // Always draw a connector from the data endpoint to the
        // right-anchored label position. When the label happens to sit
        // right on top of its endpoint (rare, only when the last data
        // point is already at the right edge) the connector is a 0-px
        // hairline and visually disappears.
        const labelX = rightEdge;
        return (
          <g key={e.network}>
            <line
              x1={e.px + 2}
              y1={e.dataY}
              x2={labelX - 1}
              y2={e.y}
              stroke={e.color}
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <text
              x={labelX}
              y={e.y}
              fill={e.color}
              fontSize={11}
              fontWeight={800}
              fontFamily="var(--font-display)"
              alignmentBaseline="middle"
              textAnchor="end"
            >
              {e.network}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Index of the latest date where this network had a non-zero value.
 *  `null` if the series is all zeros — we don't label an empty line. */
function findLastVisibleDate(
  rows: Array<Record<string, number | string>>,
  network: string,
): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][network];
    if (typeof v === "number" && v !== 0) return i;
  }
  return null;
}

/**
 * Returns the date list in insertion order. We rely on `Map` to
 * preserve insertion order (ES2015 guarantee) so the chart's x-axis
 * walks left → right in the same order BQ returned rows.
 */
function uniqueDatesPreservingOrder(byNetwork: TrendByNetwork[]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const series of byNetwork) {
    for (const point of series.points) {
      if (!seen.has(point.date)) {
        seen.add(point.date);
        dates.push(point.date);
      }
    }
  }
  return dates;
}

