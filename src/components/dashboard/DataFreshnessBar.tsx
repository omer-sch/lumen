"use client";

import { useEffect, useState } from "react";
import type { FreshnessData } from "@/types/dashboard";

/**
 * Thin bar that surfaces the most recent Rivery sync timestamp from
 * `/api/bq/freshness`. Three buckets:
 *   < 12h → green dot
 *   < 24h → yellow dot
 *   ≥ 24h → coral dot
 *   −1 (unreadable) → gray dot, "freshness unavailable"
 */
export function DataFreshnessBar() {
  const [state, setState] = useState<FreshnessData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/bq/freshness", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: FreshnessData) => setState(d))
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setErrored(true);
      });
    return () => ctrl.abort();
  }, []);

  const tone = pickTone(state, errored);
  const label = pickLabel(state, errored);

  return (
    <div
      data-testid="data-freshness-bar"
      className="flex items-center gap-2 px-4 py-1.5 font-body text-[11px] leading-none tracking-wide text-[color:var(--text-muted)] sm:px-6"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone.dot, boxShadow: tone.glow }}
      />
      <span data-testid="data-freshness-label">{label}</span>
    </div>
  );
}

function pickTone(state: FreshnessData | null, errored: boolean) {
  if (errored || state == null || state.hoursAgo < 0) {
    return { dot: "rgba(255,255,255,0.3)", glow: "none" };
  }
  if (state.hoursAgo < 12)
    return {
      dot: "var(--color-ua)",
      glow: "0 0 6px color-mix(in oklab, var(--color-ua) 50%, transparent)",
    };
  if (state.hoursAgo < 24)
    return {
      dot: "var(--color-yellow)",
      glow: "0 0 6px color-mix(in oklab, var(--color-yellow) 50%, transparent)",
    };
  return {
    dot: "var(--color-creative)",
    glow: "0 0 6px color-mix(in oklab, var(--color-creative) 50%, transparent)",
  };
}

function pickLabel(state: FreshnessData | null, errored: boolean): string {
  if (errored) return "Data freshness unavailable";
  if (state == null) return "Checking data freshness…";
  if (state.hoursAgo < 0) return "Data freshness unavailable";
  if (state.hoursAgo === 0) return "Data last updated less than an hour ago";
  const unit = state.hoursAgo === 1 ? "hour" : "hours";
  return `Data last updated ${state.hoursAgo} ${unit} ago`;
}
