"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

type ChannelMixProps = {
  data: { channel: string; spend: number; pct: number }[];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
};

export function ChannelMix({ data, enterIndex }: ChannelMixProps) {
  const showSpend = data.some((d) => d.spend > 0);

  // Bars grow from 0 → pct on mount with brand easing.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimated(true);
      return;
    }
    const t = window.setTimeout(() => setAnimated(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className="flex flex-col gap-3 p-4"
    >
      <div>
        <h2 className="font-display text-md font-bold leading-none text-cloud-white">
          Channel mix
        </h2>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Share of {showSpend ? "spend" : "activity"} across sources.
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {data.map((row, i) => {
          const isTop = i === 0;
          const target = Math.min(Math.max(row.pct, 0), 100);
          return (
            <li key={row.channel} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-body text-sm">
                <span className="font-medium text-cloud-white">{row.channel}</span>
                <span className="tabular-nums text-[color:var(--text-muted)]">
                  {showSpend && `$${(row.spend / 1000).toFixed(1)}k · `}
                  {row.pct.toFixed(1)}%
                </span>
              </div>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-track)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-transform duration-1000 ease-out-quart"
                  style={{
                    width: `${target}%`,
                    transformOrigin: "left center",
                    transform: `scaleX(${animated ? 1 : 0})`,
                    transitionDelay: `${i * 90}ms`,
                    background: isTop
                      ? "linear-gradient(90deg, var(--color-ua), var(--color-ua-glow))"
                      : "var(--color-ua)",
                    boxShadow: isTop
                      ? "0 0 14px color-mix(in oklab, var(--color-ua-glow) 65%, transparent)"
                      : "0 0 8px color-mix(in oklab, var(--color-ua) 40%, transparent)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
