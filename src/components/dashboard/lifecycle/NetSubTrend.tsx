"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatKpi } from "@/lib/format";
import type {
  LifecycleDailyRow,
  LifecycleNetSubPoint,
} from "@/lib/lifecycle/use-lifecycle-data";

/** Bar/line crossover: a window shorter than this renders as bars
 *  (bars read more honestly at low density), longer renders as a line
 *  with an area fill underneath. */
export const LINE_VS_BAR_THRESHOLD = 14;

type Props = {
  trend: LifecycleNetSubPoint[];
  /** Daily rows are used for the hover tooltip, which surfaces subs +
   *  churn alongside net sub. Trend alone only carries net sub. */
  daily: LifecycleDailyRow[];
  enterIndex?: number;
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
 * Net subscribers over time. The "real chart" the prompt asks for:
 * shared chart frame (axes, gridlines, tooltip, end-of-line label) and
 * a line + area fill when the window has enough days to read; bars
 * when the window is short (<14 days).
 *
 * Hover tooltip surfaces date, subs, churn, net sub — same hover
 * pattern Performance's TrendChart uses.
 */
export function NetSubTrend({ trend, daily, enterIndex }: Props) {
  if (trend.length === 0) {
    return (
      <GlassCard
        className="flex flex-col gap-3 p-5"
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

  const renderAsLine = trend.length >= LINE_VS_BAR_THRESHOLD;

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

  const last = data[data.length - 1];

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className="flex flex-col gap-3 p-5"
      data-testid="lifecycle-net-sub-trend"
      data-mode={renderAsLine ? "line" : "bar"}
    >
      <SectionHeader windowLength={data.length} mode={renderAsLine ? "line" : "bar"} />

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 28, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="lifecycle-net-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ua)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--color-ua)" stopOpacity={0} />
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
              cursor={
                renderAsLine
                  ? { stroke: "var(--color-ua)", strokeOpacity: 0.4, strokeWidth: 1 }
                  : { fill: "var(--color-ua)", fillOpacity: 0.08 }
              }
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
            {renderAsLine ? (
              <Area
                type="monotone"
                dataKey="netSub"
                stroke="var(--color-ua)"
                strokeWidth={2.25}
                fill="url(#lifecycle-net-fill)"
                fillOpacity={0.6}
                dot={false}
                activeDot={{ r: 4, fill: "var(--color-ua)", strokeWidth: 0 }}
                isAnimationActive
              />
            ) : (
              <Bar dataKey="netSub" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.map((r) => (
                  <Cell
                    key={r.date}
                    fill={r.netSub >= 0 ? "var(--color-ua)" : "var(--color-creative)"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {last && renderAsLine && (
        <p className="font-body text-[11px] text-[color:var(--text-muted)]">
          Latest:{" "}
          <span className="font-semibold text-[color:var(--text-primary)] tabular-nums">
            {last.netSub > 0 ? "+" : ""}
            {last.netSub.toLocaleString()}
          </span>{" "}
          on {fmtAxisDate(last.date)}
        </p>
      )}
    </GlassCard>
  );
}

function SectionHeader({
  windowLength,
  mode,
}: {
  windowLength?: number;
  mode?: "line" | "bar";
}) {
  const subtitle =
    windowLength == null
      ? "Daily new subscribers minus cancellations across the active window."
      : mode === "line"
        ? `Daily across the last ${windowLength} days. New subs minus cancellations.`
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
