"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatKpi } from "@/lib/format";
import type { PaybackPoint } from "@/types/dashboard";

type Props = {
  /** D0 → D90 cohort payback points. Empty when the active client isn't
   *  multi-source. */
  points: PaybackPoint[];
  enterIndex?: number;
};

/**
 * Payback curve: cohort-attributed ROAS at D0 → D7 → D14 → D30 → D90.
 * Shows how quickly the period's ad spend is repaying. A reference line
 * at 1.0x highlights the "break even" mark — anything above means the
 * cohort has paid for its acquisition cost by that day.
 *
 * D90 is structurally low for recent windows (a 30-day window's installs
 * haven't had 90 days to convert). The tooltip surfaces this so the
 * analyst doesn't read a dipping D90 as poor performance.
 */
export function PaybackCurve({ points, enterIndex }: Props) {
  if (points.length === 0) return null;

  // Pre-shape for the chart: x-axis label "D0", "D7", ... so users read
  // the cohort window directly without a legend.
  const data = points.map((p) => ({
    day: `D${p.day}`,
    roas: +p.roas.toFixed(4),
    revenue: p.revenue,
    rawDay: p.day,
  }));

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className="flex flex-col gap-3 p-4"
      data-testid="payback-curve"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            Payback curve
          </h2>
          <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
            Cohort ROAS at D0 through D90 against this period&rsquo;s spend.
          </p>
        </div>
        <span
          className="font-body text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-yellow)" }}
        >
          1.0x = break even
        </span>
      </div>

      <div className="h-52 w-full sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
          >
            <defs>
              <linearGradient id="payback-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ua)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--color-ua)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="payback-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-ua)" />
                <stop offset="100%" stopColor="var(--color-ua-glow)" />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v.toFixed(2)}x`}
              width={48}
              domain={[0, "auto"]}
            />
            <ReferenceLine
              y={1}
              stroke="var(--color-yellow)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: "break even",
                position: "insideTopRight",
                fill: "var(--color-yellow)",
                fontSize: 10,
              }}
            />
            <Tooltip
              cursor={{
                stroke: "var(--color-ua)",
                strokeOpacity: 0.4,
                strokeWidth: 1,
              }}
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
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return [formatKpi.ratio(Number.isFinite(n) ? n : 0), "ROAS"];
              }}
              labelFormatter={(label, payload) => {
                const head = typeof label === "string" ? label : String(label ?? "");
                const first = payload?.[0]?.payload as
                  | { revenue?: number; rawDay?: number }
                  | undefined;
                const rev = first?.revenue;
                const note = first?.rawDay === 90 ? " (matures slowly)" : "";
                return rev != null
                  ? `${head} cohort${note} · revenue ${formatKpi.money(rev)}`
                  : head;
              }}
            />
            <Area
              type="monotone"
              dataKey="roas"
              stroke="url(#payback-stroke)"
              strokeWidth={2.5}
              fill="url(#payback-grad)"
              dot={{
                r: 4,
                fill: "var(--color-ua)",
                stroke: "var(--color-ua-glow)",
                strokeWidth: 2,
              }}
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
