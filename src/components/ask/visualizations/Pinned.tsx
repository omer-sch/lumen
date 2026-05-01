"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PinnedConfig } from "@/lib/pins/types";

const fmt = {
  money: (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`,
  count: (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString(),
  ratio: (n: number) => `${n.toFixed(2)}x`,
  percent: (n: number) => `${n.toFixed(1)}%`,
} as const;

/**
 * Renders a single PinnedConfig in chart form. Used by:
 *   - Ask page answer cards
 *   - Dashboard's Pinned views section
 *
 * Compact by default (suits the dashboard grid). Pass `size="lg"` for
 * the Ask page's full-width result panel.
 */
export function PinnedRenderer({
  config,
  size = "md",
}: {
  config: PinnedConfig;
  size?: "md" | "lg";
}) {
  if (config.kind === "kpi") {
    const { value, delta, deltaLabel, direction } = config;
    const hasDelta = typeof delta === "number";
    const isGood = hasDelta
      ? direction === "higher-better"
        ? delta >= 0
        : delta < 0
      : false;
    const Arrow = hasDelta && delta >= 0 ? ArrowUpRight : ArrowDownRight;
    const tone = !hasDelta ? "neutral" : isGood ? "good" : "bad";
    const toneColor =
      tone === "good"
        ? "var(--color-ua)"
        : tone === "bad"
          ? "var(--color-creative)"
          : "var(--text-muted)";
    return (
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            {config.metric}
          </span>
          <span
            className={
              size === "lg"
                ? "font-display text-4xl font-extrabold leading-none tracking-tight text-cloud-white sm:text-[56px]"
                : "font-display text-3xl font-extrabold leading-none tracking-tight text-cloud-white"
            }
          >
            {value}
          </span>
        </div>
        {hasDelta && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              color: toneColor,
              background: `color-mix(in oklab, ${toneColor} 14%, transparent)`,
              border: `1px solid color-mix(in oklab, ${toneColor} 28%, transparent)`,
            }}
          >
            <Arrow className="h-3.5 w-3.5" strokeWidth={2.5} />
            {Math.abs(delta).toFixed(1)}% {deltaLabel}
          </span>
        )}
      </div>
    );
  }

  if (config.kind === "line") {
    const f = fmt[config.formatter];
    return (
      <div className={size === "lg" ? "h-72 w-full" : "h-40 w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={config.data}
            margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
          >
            <defs>
              <linearGradient id="pinned-line-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ua)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--color-ua)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={f}
              width={42}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-ua)", strokeOpacity: 0.4 }}
              contentStyle={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                color: "var(--text-primary)",
                fontSize: 12,
                boxShadow: "var(--shadow-elevated)",
              }}
              labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
              formatter={(v) => [f(typeof v === "number" ? v : Number(v)), config.metric]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-ua)"
              strokeWidth={2}
              fill="url(#pinned-line-fill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.kind === "bar") {
    const f = fmt[config.formatter];
    const max = Math.max(...config.data.map((d) => d.value), 1);
    return (
      <ul className="flex flex-col gap-2.5">
        {config.data.map((row) => {
          const isTop = row.label === config.highlightLabel;
          const pct = (row.value / max) * 100;
          return (
            <li key={row.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-body text-sm">
                <span className="font-medium text-cloud-white">{row.label}</span>
                <span className="tabular-nums text-[color:var(--text-muted)]">
                  {f(row.value)}
                </span>
              </div>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-track)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: isTop
                      ? "linear-gradient(90deg, var(--color-ua), var(--color-ua-glow))"
                      : "var(--color-ua)",
                    boxShadow: isTop
                      ? "0 0 14px color-mix(in oklab, var(--color-ua-glow) 65%, transparent)"
                      : undefined,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  // table
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            {config.columns.map((c) => (
              <th
                key={c.key}
                className={`pb-2 ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-[color:var(--border-subtle)] transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)]"
            >
              {config.columns.map((c) => {
                const v = row[c.key];
                const text =
                  typeof v === "number" && c.format
                    ? fmt[c.format](v)
                    : String(v ?? "");
                const isLeader = i === 0 && c.key === "campaign";
                return (
                  <td
                    key={c.key}
                    className={`py-2 ${
                      c.align === "right"
                        ? "text-right tabular-nums text-[color:var(--text-secondary)]"
                        : "text-cloud-white"
                    }`}
                  >
                    {isLeader ? (
                      <span className="font-semibold text-ua">{text}</span>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
