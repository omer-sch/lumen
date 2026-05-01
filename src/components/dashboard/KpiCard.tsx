"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUpNumber } from "@/components/ui/CountUpNumber";
import type { KpiDirection } from "@/lib/mock/dashboard";

type KpiCardProps = {
  /** Stable identifier — surfaces as `data-testid="kpi-{id}"` when set. */
  id?: string;
  label: string;
  value: string;
  delta: number;
  hint?: string;
  highlight?: boolean;
  direction?: KpiDirection;
  /**
   * Bento sizing variant.
   *  - "hero" — wide, taller, larger value typography (the page's single yellow KPI)
   *  - "compact" — standard KPI tile
   * Defaults to "compact".
   */
  size?: "hero" | "compact";
  /** Stagger position in the KPI grid (1-based). */
  enterIndex?: number;
  /**
   * Optional time-series. Renders as a mini area chart inside the hero
   * card so a tall tile doesn't read as empty space. Tick formatter is
   * inferred from the metric prefix/suffix.
   */
  series?: { date: string; value: number }[];
};

/**
 * Parse a brand-formatted KPI string into its numeric core + prefix/suffix
 * so the value can animate with <CountUpNumber>. Supports the four shapes
 * found in the mock dashboard: "$284,920", "62,418", "$4.56", "1.42x".
 */
function parseKpiValue(raw: string): {
  numeric: number;
  prefix?: string;
  suffix?: string;
  decimals: number;
} {
  const trimmed = raw.trim();
  const prefixMatch = trimmed.match(/^[^\d-]+/);
  const suffixMatch = trimmed.match(/[^\d.,\s]+$/);
  const prefix = prefixMatch ? prefixMatch[0] : undefined;
  const suffix = suffixMatch ? suffixMatch[0] : undefined;

  const core = trimmed
    .slice(prefix?.length ?? 0, suffix ? trimmed.length - suffix.length : trimmed.length)
    .replace(/,/g, "");

  const numeric = Number(core);
  const dotIndex = core.indexOf(".");
  const decimals = dotIndex === -1 ? 0 : core.length - dotIndex - 1;

  return {
    numeric: Number.isFinite(numeric) ? numeric : 0,
    prefix,
    suffix,
    decimals,
  };
}

const fmtForTick = (prefix?: string, suffix?: string, decimals = 0) =>
  (n: number) => {
    if (suffix === "x") return `${n.toFixed(2)}x`;
    if (prefix === "$") {
      if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
      return `$${n.toFixed(decimals === 0 ? 0 : 2)}`;
    }
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n)}`;
  };

export function KpiCard({
  id,
  label,
  value,
  delta,
  hint,
  highlight,
  direction = "higher-better",
  size = "compact",
  enterIndex,
  series,
}: KpiCardProps) {
  const positive = direction === "higher-better" ? delta >= 0 : delta <= 0;
  const { numeric, prefix, suffix, decimals } = parseKpiValue(value);
  const isHero = size === "hero";
  const hasSeries = series && series.length > 1;
  const stroke = highlight ? "var(--color-yellow)" : "var(--color-ua)";
  const heroFillId = highlight ? "kpi-spark-yellow-hero" : "kpi-spark-ua-hero";
  const compactFillId = `kpi-spark-compact-${id ?? "x"}`;
  const tickFormat = fmtForTick(prefix, suffix, decimals);

  return (
    <GlassCard
      glow={highlight ? "yellow" : "ua"}
      feature={highlight}
      shimmer={highlight}
      enterIndex={enterIndex}
      data-testid={id ? `kpi-${id}` : undefined}
      className={
        isHero
          ? "flex h-full flex-col gap-5 p-6 sm:p-7"
          : "flex h-full flex-col gap-4 p-5"
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          {label}
        </span>
        {isHero && hint && (
          <span className="hidden font-body text-xs text-[color:var(--text-muted)] sm:inline">
            {hint}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        <span
          className="font-display font-extrabold leading-none tracking-tight tabular-nums"
          style={{
            fontSize: isHero ? "var(--text-4xl)" : "var(--text-3xl)",
            color: highlight ? "var(--color-yellow)" : "var(--text-primary)",
            textShadow: highlight ? "var(--shadow-yellow)" : undefined,
          }}
        >
          <CountUpNumber
            value={numeric}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
            duration={isHero ? 1400 : 1100}
          />
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-xs font-semibold tabular-nums transition-transform duration-280 ease-out-quart group-hover:-translate-y-px"
          style={{
            background: positive
              ? "var(--tint-success-soft)"
              : "var(--tint-danger-soft)",
            color: positive ? "var(--color-ua)" : "var(--color-creative)",
          }}
        >
          {delta >= 0 ? (
            <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
          ) : (
            <ArrowDownRight className="h-3 w-3" strokeWidth={2.25} />
          )}
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>

      {hint && !isHero && (
        <p className="font-body text-xs text-[color:var(--text-muted)]">{hint}</p>
      )}
      {isHero && hint && (
        <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)] sm:hidden">
          {hint}
        </p>
      )}

      {/* Hero — full sparkline with axes + tooltip. Compact — bare-bottom
          strip (no axes), keeps the tile dense without overwhelming it. */}
      {hasSeries && isHero && (
        <div className="mt-auto h-40 w-full pt-2 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
            >
              <defs>
                <linearGradient id={heroFillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickFormat}
                width={36}
              />
              <Tooltip
                cursor={{ stroke, strokeOpacity: 0.4, strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 10,
                  color: "var(--text-primary)",
                  fontSize: 12,
                  boxShadow: "var(--shadow-elevated)",
                }}
                labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                formatter={(v) => [
                  tickFormat(typeof v === "number" ? v : Number(v)),
                  label,
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#${heroFillId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: stroke,
                  stroke: highlight ? "var(--color-yellow-light)" : "var(--color-ua-glow)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasSeries && !isHero && (
        <div className="-mx-2 -mb-2 mt-auto h-12 w-[calc(100%+1rem)]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={compactFillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={1.5}
                fill={`url(#${compactFillId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}
