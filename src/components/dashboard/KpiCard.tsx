import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
}: KpiCardProps) {
  const positive = direction === "higher-better" ? delta >= 0 : delta <= 0;
  const { numeric, prefix, suffix, decimals } = parseKpiValue(value);
  const isHero = size === "hero";

  return (
    <GlassCard
      glow={highlight ? "yellow" : "ua"}
      feature={highlight}
      shimmer={highlight}
      enterIndex={enterIndex}
      data-testid={id ? `kpi-${id}` : undefined}
      className={
        isHero
          ? "flex h-full flex-col justify-between gap-6 p-6 sm:p-7"
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
      {isHero && (
        <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)] sm:hidden">
          {hint}
        </p>
      )}
    </GlassCard>
  );
}
