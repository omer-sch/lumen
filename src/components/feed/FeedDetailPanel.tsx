"use client";

import { useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Lightbulb,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedItem, FeedSeverity } from "@/lib/mock/feed";

const SEVERITY_ICON: Record<FeedSeverity, LucideIcon> = {
  highlight: Sparkles,
  spike: TrendingUp,
  drop: TrendingDown,
  info: Lightbulb,
};

const SEVERITY_META: Record<FeedSeverity, { accentVar: string; tintVar: string; label: string }> = {
  highlight: { accentVar: "--color-yellow",   tintVar: "--tint-yellow-soft",   label: "Highlight" },
  spike:     { accentVar: "--color-ua",       tintVar: "--tint-ua-soft",       label: "Spike"     },
  drop:      { accentVar: "--color-creative", tintVar: "--tint-creative-soft", label: "Drop"      },
  info:      { accentVar: "--color-ua",       tintVar: "--tint-ua-soft",       label: "Insight"   },
};

const CHANNEL_TINT: Record<FeedItem["campaigns"][number]["channel"], { bg: string; fg: string }> = {
  Meta:      { bg: "var(--tint-ua-soft)",       fg: "var(--color-ua)" },
  TikTok:    { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
  Google:    { bg: "var(--tint-yellow-soft)",   fg: "var(--color-yellow)" },
  AppsFlyer: { bg: "var(--tint-organic-soft)",  fg: "var(--color-organic)" },
};

type FeedDetailPanelProps = {
  item: FeedItem | null;
  onClose: () => void;
};

/**
 * Slide-over drill-in for a Feed item. Shows the supporting chart, the
 * specific campaigns the AI tied to the signal, and a one-line action.
 * Closes on Esc + outside-click. Uses surface-elevated so it occludes the
 * page cleanly (glass-on-glass reads as soup at panel scale).
 */
export function FeedDetailPanel({ item, onClose }: FeedDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const open = !!item;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const meta = item ? SEVERITY_META[item.severity] : null;
  const accent = meta ? `var(${meta.accentVar})` : "var(--color-ua)";
  const Icon = item ? SEVERITY_ICON[item.severity] : Sparkles;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/65 backdrop-blur-md transition-opacity duration-280 ease-out-quart",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label={item?.title}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden border-l backdrop-blur-glass transition-[transform,opacity] duration-450 ease-out-quart",
          open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0",
        )}
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%), color-mix(in oklab, var(--surface-elevated) 96%, transparent)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] px-5 py-4">
          {item && meta && (
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
              style={{
                background: `var(${meta.tintVar})`,
                color: accent,
                boxShadow: `0 0 14px color-mix(in oklab, ${accent} 35%, transparent)`,
              }}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {item && meta && (
              <p
                className="font-body text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: accent }}
              >
                {meta.label} · {item.timeAgo}
              </p>
            )}
            <h2 className="mt-0.5 truncate font-display text-md font-bold leading-snug text-cloud-white">
              {item?.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[color:var(--text-muted)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        {/* Body */}
        {item && meta && (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
              {item.body}
            </p>

            <div className="flex items-end justify-between gap-3 rounded-md p-3" style={{ background: "var(--surface-glass)", border: "1px solid var(--border-glass)" }}>
              <div className="flex flex-col">
                <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  {item.metric}
                </span>
                <span
                  className="font-display text-2xl font-extrabold tabular-nums"
                  style={{ color: accent }}
                >
                  {item.delta}
                </span>
              </div>
              <div className="h-12 w-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={item.chart} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                    <defs>
                      <linearGradient id={`feed-spark-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={accent}
                      strokeWidth={1.75}
                      fill={`url(#feed-spark-${item.id})`}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-display text-sm font-bold leading-none text-cloud-white">
                Supporting chart · last 14 days
              </h3>
              <div className="h-48 w-full rounded-md p-3" style={{ background: "var(--surface-glass)", border: "1px solid var(--border-glass)" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={item.chart} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <defs>
                      <linearGradient id={`feed-chart-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0} />
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
                      width={36}
                    />
                    <Tooltip
                      cursor={{ stroke: accent, strokeOpacity: 0.4 }}
                      contentStyle={{
                        background: "var(--surface-elevated)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 8,
                        color: "var(--text-primary)",
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={accent}
                      strokeWidth={2}
                      fill={`url(#feed-chart-${item.id})`}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-bold leading-none text-cloud-white">
                Affected campaigns
              </h3>
              <ul className="flex flex-col gap-2">
                {item.campaigns.map((c) => {
                  const tint = CHANNEL_TINT[c.channel];
                  return (
                    <li
                      key={c.name}
                      className="flex items-center justify-between gap-3 rounded-md p-3"
                      style={{
                        background: "var(--surface-glass)",
                        border: "1px solid var(--border-glass)",
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: tint.bg, color: tint.fg }}
                        >
                          {c.channel}
                        </span>
                        <span className="truncate font-body text-sm font-medium text-cloud-white">
                          {c.name}
                        </span>
                      </div>
                      <span
                        className="font-body text-sm font-semibold tabular-nums"
                        style={{ color: accent }}
                      >
                        {c.delta}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div
              className="rounded-md p-4"
              style={{
                background: `color-mix(in oklab, ${accent} 8%, transparent)`,
                border: `1px solid color-mix(in oklab, ${accent} 28%, transparent)`,
              }}
            >
              <p
                className="font-body text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: accent }}
              >
                Recommended action
              </p>
              <p className="mt-1 font-body text-sm leading-relaxed text-cloud-white">
                {item.action}
              </p>
            </div>

            <a
              href="/campaigns"
              className="inline-flex items-center justify-center gap-1.5 rounded-md py-2.5 font-body text-xs font-semibold uppercase tracking-wider text-navy"
              style={{
                background:
                  item.severity === "highlight"
                    ? "var(--color-yellow)"
                    : "var(--color-ua)",
                boxShadow:
                  item.severity === "highlight"
                    ? "var(--shadow-yellow)"
                    : "var(--shadow-mint)",
              }}
            >
              Open in Campaigns
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </a>
          </div>
        )}
      </aside>
    </>
  );
}
