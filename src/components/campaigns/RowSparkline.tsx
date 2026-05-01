"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

type RowSparklineProps = {
  data: { date: string; value: number }[];
  /** Direction of the trend tints the line: "good" mint, "bad" coral. */
  tone?: "good" | "bad" | "neutral";
};

const TONE_COLOR: Record<NonNullable<RowSparklineProps["tone"]>, string> = {
  good:    "var(--color-ua)",
  bad:     "var(--color-creative)",
  neutral: "var(--text-secondary)",
};

/**
 * Tiny one-row sparkline for the Campaigns table. Mint by default; flips
 * to coral when the metric direction is bad (e.g. CPI rising). Uses the
 * same gradient language as the dashboard trend chart so the visual idiom
 * stays consistent across surfaces.
 */
export function RowSparkline({ data, tone = "good" }: RowSparklineProps) {
  const accent = TONE_COLOR[tone];
  const fillId = `spark-fill-${tone}`;
  return (
    <div className="h-8 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={1.5}
            fill={`url(#${fillId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
