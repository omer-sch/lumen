"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatKpi } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  LifecycleDailyRow,
  LifecycleNetSubPoint,
} from "@/lib/lifecycle/use-lifecycle-data";

type Props = {
  trend: LifecycleNetSubPoint[];
  /** Daily rows are used for the hover tooltip, which surfaces subs +
   *  churn alongside net sub. Trend alone only carries net sub. */
  daily: LifecycleDailyRow[];
  enterIndex?: number;
  /** Optional grid-positioning class — used by LifecycleTab to span
   *  2/3 width in the asymmetric pair with OsMixCard. */
  className?: string;
};

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function fmtAxisDate(iso: string): string {
  const d = parseIsoLocal(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTooltipDate(iso: string): string {
  const d = parseIsoLocal(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TOOLTIP_STYLE = {
  background: "rgba(10, 20, 40, 0.96)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-strong, rgba(255,255,255,0.18))",
  borderRadius: 10,
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 12px",
  boxShadow: "var(--shadow-elevated)",
};

/**
 * Net subscribers over time. Always rendered as columns regardless of
 * window length — green when net sub is positive for the day, coral
 * when negative. Hover tooltip surfaces date + subs + churn + net sub.
 */
export function NetSubTrend({ trend, daily, enterIndex, className }: Props) {
  if (trend.length === 0) {
    return (
      <GlassCard
        className={cn("flex flex-col gap-3 p-5", className)}
        enterIndex={enterIndex}
        data-testid="lifecycle-net-sub-trend"
      >
        <SectionHeader />
        <EmptyState
          title="No net-sub activity in this window."
          description="Try widening the date range. Net Sub is sum of new subscribers minus cancellations per day."
          bulbSize={88}
        />
      </GlassCard>
    );
  }

  // Roll churn / sub per date out of the daily array (which can carry
  // multiple OS rows per date) so the tooltip can show all three counts.
  const dailyByDate = new Map<string, { subs: number; churn: number }>();
  for (const r of daily) {
    const cur = dailyByDate.get(r.date) ?? { subs: 0, churn: 0 };
    cur.subs += r.subs;
    cur.churn += r.churn;
    dailyByDate.set(r.date, cur);
  }

  const data = trend.map((p) => {
    const extra = dailyByDate.get(p.date) ?? { subs: 0, churn: 0 };
    return { date: p.date, netSub: p.netSub, subs: extra.subs, churn: extra.churn };
  });

  // Sparse-tick logic: with up to ~90 dates, native ticks overlap.
  // Show first / last and ~3 between so axis stays legible at any length.
  const tickIdxs = (() => {
    if (data.length <= 6) return data.map((_, i) => i);
    const out = new Set<number>([0, data.length - 1]);
    const step = Math.floor(data.length / 4);
    for (let i = step; i < data.length - 1; i += step) out.add(i);
    return [...out].sort((a, b) => a - b);
  })();
  const tickDates = new Set(tickIdxs.map((i) => data[i].date));

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className={cn("flex flex-col gap-3 p-5", className)}
      data-testid="lifecycle-net-sub-trend"
      data-mode="bar"
    >
      <SectionHeader windowLength={data.length} />

      {/* Chart fills whatever vertical space the card has — so the row
          reads as one balanced pair with OsMixCard rather than a short
          chart sitting on top of empty space. min-h keeps it usable
          when the card collapses on narrow viewports. */}
      <div className="min-h-[12rem] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 28, bottom: 0, left: 0 }}
          >
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
              interval="preserveStartEnd"
              tickFormatter={(iso: string) =>
                tickDates.has(iso) ? fmtAxisDate(iso) : ""
              }
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatKpi.count(v)}
              width={40}
            />
            <ReferenceLine
              y={0}
              stroke="var(--border-subtle)"
              strokeOpacity={0.6}
            />
            <Tooltip
              cursor={{ fill: "var(--color-ua)", fillOpacity: 0.08 }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{
                color: "#FFFFFF",
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 4,
                opacity: 0.95,
              }}
              itemStyle={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600, padding: 0 }}
              labelFormatter={(label) =>
                fmtTooltipDate(typeof label === "string" ? label : String(label ?? ""))
              }
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                const safe = Number.isFinite(n) ? n : 0;
                const labels: Record<string, string> = {
                  subs: "New subs",
                  churn: "Cancellations",
                  netSub: "Net Sub",
                };
                const sign = name === "netSub" && safe > 0 ? "+" : "";
                return [`${sign}${safe.toLocaleString()}`, labels[String(name)] ?? String(name)];
              }}
            />
            <Bar dataKey="netSub" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((r) => (
                <Cell
                  key={r.date}
                  fill={r.netSub >= 0 ? "var(--color-ua)" : "var(--color-creative)"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

function SectionHeader({ windowLength }: { windowLength?: number }) {
  const subtitle =
    windowLength == null
      ? "Daily new subscribers minus cancellations across the active window."
      : `Daily across the last ${windowLength} days. Green bars positive, coral negative.`;
  return (
    <header className="flex flex-col gap-0.5">
      <h2 className="font-display text-md font-bold leading-none text-cloud-white">
        Net Sub over time
      </h2>
      <p className="font-body text-[11px] text-[color:var(--text-muted)]">
        {subtitle}
      </p>
    </header>
  );
}
