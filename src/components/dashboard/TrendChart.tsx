"use client";

import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import type {
  DashboardData,
  TrendFormatter,
} from "@/lib/mock/dashboard";

type TrendChartProps = {
  trend: DashboardData["trend"];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
};

const fmt: Record<TrendFormatter, (n: number) => string> = {
  money: (n) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`),
  count: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`),
};

export function TrendChart({ trend, enterIndex }: TrendChartProps) {
  const accent = "var(--color-ua)";
  const gradId = "trend-grad-ua";
  const strokeId = "trend-grad-stroke";
  const format = fmt[trend.formatter];

  return (
    <GlassCard
      glow="ua"
      feature
      shimmer
      enterIndex={enterIndex}
      className="flex flex-col p-6"
    >
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            {trend.title}
          </h2>
          <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
            {trend.subtitle}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-body text-xs font-semibold"
          style={{
            borderColor: "color-mix(in oklab, var(--color-ua) 35%, transparent)",
            background: "color-mix(in oklab, var(--color-ua) 10%, transparent)",
            color: "var(--color-ua)",
          }}
        >
          <LivePulse accent="mint" size={8} />
          UA · live
        </span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend.data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <defs>
              {/* Area fill — mint translucent → transparent */}
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
              {/* Stroke — pure mint → mint glow for a subtle gradient line */}
              <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-ua)" />
                <stop offset="100%" stopColor="var(--color-ua-glow)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
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
              tickFormatter={format}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: accent, strokeOpacity: 0.4, strokeWidth: 1 }}
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
              formatter={(value) => [
                format(typeof value === "number" ? value : Number(value)),
                trend.metricLabel,
              ]}
            />
            <Area
              type="monotone"
              dataKey="primary"
              stroke={`url(#${strokeId})`}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{
                r: 5,
                fill: "var(--color-ua)",
                stroke: "var(--color-ua-glow)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
