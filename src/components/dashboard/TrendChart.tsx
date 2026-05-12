"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import type { KpiId, TrendPoint } from "@/types/dashboard";

type TrendChartProps = {
  trend: TrendPoint[];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
  /** Optional initial metric — defaults to "spend". */
  initialMetric?: KpiId;
};

type MetricSpec = {
  id: KpiId;
  label: string;
  format: (n: number) => string;
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
const fmtCpi = (n: number) => `$${n.toFixed(2)}`;

const METRICS: MetricSpec[] = [
  { id: "spend",    label: "Spend",    format: fmtMoneyShort },
  { id: "installs", label: "Installs", format: fmtCount      },
  { id: "cpi",      label: "CPI",      format: fmtCpi        },
  { id: "roas",     label: "ROAS",     format: fmtRatio      },
];

export function TrendChart({
  trend,
  enterIndex,
  initialMetric = "spend",
}: TrendChartProps) {
  const [metric, setMetric] = useState<KpiId>(initialMetric);
  const active = METRICS.find((m) => m.id === metric) ?? METRICS[0];

  return (
    <GlassCard
      glow="ua"
      feature
      shimmer
      enterIndex={enterIndex}
      className="flex flex-col p-4"
      data-testid="trend-chart"
      data-metric={metric}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            {active.label} over time
          </h2>
          <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
            Daily, last {trend.length} days
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

      {/* Metric switcher */}
      <div
        role="tablist"
        aria-label="Trend metric"
        className="mb-3 flex flex-wrap items-center gap-1 rounded-md p-1 self-start"
        style={{
          background: "var(--surface-input)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {METRICS.map((m) => {
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
                "rounded-sm px-2.5 py-1 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
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
            </button>
          );
        })}
      </div>

      <div className="h-52 w-full sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id="trend-grad-ua" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ua)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--color-ua)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="trend-grad-stroke" x1="0" y1="0" x2="1" y2="0">
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
              tickFormatter={active.format}
              width={48}
            />
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
              formatter={(value) => [
                active.format(typeof value === "number" ? value : Number(value)),
                active.label,
              ]}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="url(#trend-grad-stroke)"
              strokeWidth={2.5}
              fill="url(#trend-grad-ua)"
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
