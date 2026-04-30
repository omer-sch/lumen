import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { LivePulse } from "@/components/ui/LivePulse";
import type { FeedItem, FeedSeverity } from "@/lib/mock/feed";

const SEVERITY_ICON: Record<FeedSeverity, LucideIcon> = {
  highlight: Sparkles,
  spike: TrendingUp,
  drop: TrendingDown,
  info: Lightbulb,
};

/**
 * Per brand: cards default to MINT glow (UA workspace). Yellow glow is
 * reserved for the highlight hero card. Severity is otherwise expressed
 * through the GlassIcon accent + the badge tint, never through card glow.
 */
const SEVERITY_META: Record<
  FeedSeverity,
  {
    /** CSS variable name (without `var(--…)`) for the severity icon + badge. */
    accentVar: string;
    label: string;
    /** Card glow per brand: only highlight gets yellow; everything else mint. */
    glow: "yellow" | "ua";
  }
> = {
  highlight: { accentVar: "--color-yellow",   label: "Highlight", glow: "yellow" },
  spike:     { accentVar: "--color-ua",       label: "Spike",     glow: "ua"     },
  drop:      { accentVar: "--color-creative", label: "Drop",      glow: "ua"     },
  info:      { accentVar: "--color-ua",       label: "Insight",   glow: "ua"     },
};

type FeedCardProps = {
  item: FeedItem;
  /** 1-based position in the grid; drives the staggered entry animation. */
  enterIndex?: number;
};

export function FeedCard({ item, enterIndex }: FeedCardProps) {
  const Icon = SEVERITY_ICON[item.severity];
  const meta = SEVERITY_META[item.severity];
  const accent = `var(${meta.accentVar})`;

  const isHighlight = item.severity === "highlight";
  const isSpike = item.severity === "spike";

  return (
    <GlassCard
      glow={meta.glow}
      feature={isHighlight}
      shimmer={isHighlight}
      enterIndex={enterIndex}
      className={
        isHighlight
          ? "flex flex-col gap-5 p-6 lg:col-span-2 lg:p-7"
          : "flex flex-col gap-4 p-5"
      }
    >
      <div className="flex items-center gap-3">
        <GlassIcon
          icon={Icon}
          accentVar={meta.accentVar}
          size={isHighlight ? "md" : "sm"}
        />

        <span
          className="rounded-full px-2.5 py-0.5 font-body text-xs font-semibold uppercase tracking-wider"
          style={{
            background: `color-mix(in oklab, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {meta.label}
        </span>

        {isSpike && (
          <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-ua)]">
            <LivePulse accent="mint" size={7} />
            Live
          </span>
        )}

        <span className="ml-auto font-body text-xs text-[color:var(--text-muted)]">
          {item.timeAgo}
        </span>
      </div>

      <h3
        className={
          isHighlight
            ? "font-display text-xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-2xl"
            : "font-display text-md font-bold leading-snug text-cloud-white"
        }
      >
        {item.title}
      </h3>

      <p
        className={
          isHighlight
            ? "max-w-2xl font-body text-base leading-relaxed text-[color:var(--text-secondary)]"
            : "font-body text-sm leading-relaxed text-[color:var(--text-secondary)]"
        }
      >
        {item.body}
      </p>

      <div className="mt-auto flex items-center gap-3 pt-1">
        <span className="font-body text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
          {item.metric}
        </span>
        <span
          className="font-display text-md font-bold tabular-nums"
          style={{ color: accent }}
        >
          {item.delta}
        </span>
      </div>
    </GlassCard>
  );
}
