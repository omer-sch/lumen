"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { TrendChartSkeleton } from "@/components/ui/Skeleton";
import { formatKpi } from "@/lib/format";
import type { TopAdTrendResponse } from "@/lib/globalcomix-queries";

type Props = {
  data: TopAdTrendResponse | null;
  loading: boolean;
};

type ChartPoint = {
  /** Day-index from the window start. Allows current + prior windows
   *  to align on the X-axis (calendar dates would offset by 30 days). */
  dayIndex: number;
  /** Pretty date label for the tooltip (current period only — the
   *  prior period's date lives in `priorLabel`). */
  currentLabel: string | null;
  priorLabel: string | null;
  currentSpend: number | null;
  priorSpend: number | null;
};

/**
 * Top Ad spend trend — solid mint line for the current period plus a
 * dashed, lower-opacity line for the equivalent prior 30 days. The
 * chart auto-picks the #1 creative by total spend; the caption beneath
 * names that creative. Renders an empty state when no ad in the window
 * clears the spend threshold.
 */
export function TopAdTrend({ data, loading }: Props) {
  // Compute the aligned chart points before any early return so hook
  // call order stays stable across renders.
  const points = useMemo<ChartPoint[]>(() => {
    if (!data || data.points.length === 0) return [];
    const currentSorted = data.points
      .filter((p) => p.is_current)
      .sort((a, b) => a.date.localeCompare(b.date));
    const priorSorted = data.points
      .filter((p) => !p.is_current)
      .sort((a, b) => a.date.localeCompare(b.date));
    const maxLen = Math.max(currentSorted.length, priorSorted.length);
    const out: ChartPoint[] = [];
    for (let i = 0; i < maxLen; i++) {
      const cur = currentSorted[i];
      const pri = priorSorted[i];
      out.push({
        dayIndex: i,
        currentLabel: cur ? cur.date.slice(5) : null,
        priorLabel: pri ? pri.date.slice(5) : null,
        currentSpend: cur ? cur.spend : null,
        priorSpend: pri ? pri.spend : null,
      });
    }
    return out;
  }, [data]);

  // Skeleton until the first fetch resolves so the chart doesn't pop
  // in late and shift the rest of the page.
  if (loading && data === null) {
    return <TrendChartSkeleton />;
  }

  if (!data || !data.top_ad || points.length === 0) {
    return (
      <GlassCard
        className="flex min-h-[14rem] flex-col items-center justify-center gap-2 p-6"
        data-testid="top-ad-trend-empty"
      >
        <h3 className="font-display text-md font-bold text-cloud-white">
          Top Ad by spend
        </h3>
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          No top creative for this window.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard
      className="flex flex-col gap-3 p-5"
      data-testid="top-ad-trend"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display text-md font-bold text-cloud-white">
          Top Ad by spend (current period vs previous)
        </h3>
        <p
          className="truncate font-body text-xs text-[color:var(--text-muted)]"
          title={data.top_ad.ad_name}
        >
          {data.top_ad.ad_name}
          <span className="ml-2 text-[color:var(--text-muted)]">
            · {data.top_ad.network}
          </span>
        </p>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="currentLabel"
              tick={{
                fill: "var(--text-muted)",
                fontSize: 11,
                fontFamily: "var(--font-body)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
            />
            <YAxis
              tickFormatter={(n) => formatKpi.money(Number(n))}
              tick={{
                fill: "var(--text-muted)",
                fontSize: 11,
                fontFamily: "var(--font-body)",
              }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              cursor={{ stroke: "var(--text-muted)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--surface-glass-solid, var(--surface-base))",
                border: "1px solid var(--border-glass)",
                borderRadius: "0.5rem",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 12,
              }}
              formatter={(value, name) => {
                if (value == null) return ["—", name];
                return [formatKpi.money(Number(value)), name];
              }}
              labelFormatter={() => ""}
            />
            <Line
              type="monotone"
              dataKey="currentSpend"
              name="Current"
              stroke="var(--color-ua)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="priorSpend"
              name="Prior 30 days"
              stroke="var(--color-ua)"
              strokeOpacity={0.45}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
