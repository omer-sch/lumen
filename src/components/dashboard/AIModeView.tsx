"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { rollAITiles, type AITile } from "@/lib/mock/ai-mode";

const ACCENT_VAR: Record<AITile["accent"], string> = {
  ua:       "--color-ua",
  yellow:   "--color-yellow",
  creative: "--color-creative",
  organic:  "--color-organic",
};

const ACCENT_TINT: Record<AITile["accent"], string> = {
  ua:       "--tint-ua-soft",
  yellow:   "--tint-yellow-soft",
  creative: "--tint-creative-soft",
  organic:  "--tint-organic-soft",
};

const fmt = {
  money: (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`,
  count: (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`,
  ratio: (n: number) => `${n.toFixed(2)}x`,
} as const;

export function AIModeView() {
  // Roll once per Lumen Dashboard entry — same minute means same tiles,
  // navigating away and back rolls a fresh selection.
  const tiles = useMemo(() => rollAITiles(), []);

  return (
    <section
      aria-label="Lumen Dashboard"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
    >
      {tiles.map((tile, i) => (
        <AITileCard key={tile.id} tile={tile} index={i} />
      ))}
    </section>
  );
}

function AITileCard({ tile, index }: { tile: AITile; index: number }) {
  const accentVar = ACCENT_VAR[tile.accent];
  const tintVar = ACCENT_TINT[tile.accent];
  const accent = `var(${accentVar})`;
  const tint = `var(${tintVar})`;

  return (
    <GlassCard
      glow={tile.accent === "yellow" ? "yellow" : "ua"}
      feature={tile.accent === "yellow"}
      shimmer={tile.accent === "yellow"}
      enterIndex={Math.min(8, index + 1)}
      className="flex h-full flex-col gap-4 p-5"
      data-testid={`ai-tile-${tile.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
          style={{
            background: tint,
            color: accent,
            boxShadow: `0 0 12px color-mix(in oklab, ${accent} 30%, transparent)`,
          }}
        >
          {tile.kind === "anomaly" ? (
            <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
          ) : tile.kind === "spark" ? (
            <TrendingDown className="h-4 w-4 rotate-180" strokeWidth={2.25} />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={2.25} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Why I&rsquo;m showing this
          </p>
          <p className="mt-1 font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
            {tile.why}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {tile.kind === "kpi" && (
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                {tile.label}
              </span>
              <span
                className="font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums"
                style={{
                  color: tile.accent === "yellow" ? accent : "var(--text-primary)",
                  textShadow:
                    tile.accent === "yellow" ? "var(--shadow-yellow)" : undefined,
                }}
              >
                {tile.value}
              </span>
            </div>
            {typeof tile.delta === "number" && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-xs font-semibold tabular-nums"
                style={{
                  background: tint,
                  color: accent,
                }}
              >
                {tile.delta >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />
                )}
                {Math.abs(tile.delta).toFixed(1)}%{" "}
                {tile.deltaLabel ? <span className="ml-1 text-[10px] font-normal text-[color:var(--text-muted)]">{tile.deltaLabel}</span> : null}
              </span>
            )}
          </div>
        )}

        {tile.kind === "spark" && (
          <div>
            <p className="font-display text-md font-bold leading-tight text-cloud-white">
              {tile.title}
            </p>
            <div className="mt-2 h-16 w-full">
              <ResponsiveContainer>
                <AreaChart
                  data={tile.data}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id={`spark-${tile.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={accent}
                    strokeWidth={2}
                    fill={`url(#spark-${tile.id})`}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tile.kind === "bars" && (
          <div>
            <p className="font-display text-md font-bold leading-tight text-cloud-white">
              {tile.title}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {tile.data.map((row) => {
                const max = Math.max(...tile.data.map((d) => d.value), 1);
                const pct = (row.value / max) * 100;
                const isTop = row.label === tile.highlightLabel;
                return (
                  <li key={row.label} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between font-body text-xs">
                      <span className="font-medium text-cloud-white">{row.label}</span>
                      <span className="tabular-nums text-[color:var(--text-muted)]">
                        {fmt[tile.formatter](row.value)}
                      </span>
                    </div>
                    <div
                      className="relative h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--surface-track)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: isTop
                            ? `linear-gradient(90deg, ${accent}, var(--color-ua-glow))`
                            : accent,
                          boxShadow: isTop
                            ? `0 0 10px color-mix(in oklab, ${accent} 60%, transparent)`
                            : undefined,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tile.kind === "anomaly" && (
          <div className="flex flex-col gap-2">
            <p className="font-display text-md font-bold leading-tight text-cloud-white">
              {tile.title}
            </p>
            <p className="font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
              {tile.body}
            </p>
            <span
              className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: tint, color: accent }}
            >
              {tile.delta}
            </span>
          </div>
        )}

        {tile.cta && (
          <Link
            href={tile.cta.href}
            className="mt-1 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 font-body text-[11px] font-semibold uppercase tracking-wider transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            style={{ color: accent }}
          >
            {tile.cta.label}
            <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
          </Link>
        )}
      </div>
    </GlassCard>
  );
}
