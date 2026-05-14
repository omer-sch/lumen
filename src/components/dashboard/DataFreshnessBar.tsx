"use client";

import { Suspense, useEffect, useState } from "react";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import type { FreshnessData } from "@/types/dashboard";

/**
 * Thin bar that surfaces both:
 *   1. The Rivery loader heartbeat as a colored dot (<12h green, <24h
 *      yellow, ≥24h coral, gray when unreadable).
 *   2. The "Data as of [Month D, YYYY]" date for the active client —
 *      sourced from MAX(date) across that client's per-network warehouse
 *      tables, which is what an analyst trusts to interpret the numbers
 *      below.
 *
 * The dot signals operational health (did the pipeline run?); the date
 * signals data currency (when does the data series end?). Both are
 * useful, and they answer different questions.
 */
export function DataFreshnessBar() {
  // useGlobalFilters reads search params which can suspend on first
  // render — wrap so the bar mounts even before the filter URL is parsed.
  return (
    <Suspense fallback={<FreshnessShell tone={GRAY_TONE} label="Checking data freshness" />}>
      <DataFreshnessBarInner />
    </Suspense>
  );
}

function DataFreshnessBarInner() {
  const { client } = useGlobalFilters();
  const [state, setState] = useState<FreshnessData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    // Reset state on client change so the bar shows the loading shell
    // until the new client's freshness fetch resolves.
    setState(null);
    setErrored(false);
    const qs = new URLSearchParams({ client });
    fetch(`/api/bq/freshness?${qs.toString()}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: FreshnessData) => setState(d))
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setErrored(true);
      });
    return () => ctrl.abort();
  }, [client]);

  const tone = pickTone(state, errored);
  const label = pickLabel(state, errored);

  return <FreshnessShell tone={tone} label={label} />;
}

const GRAY_TONE = { dot: "rgba(255,255,255,0.3)", glow: "none" } as const;

type Tone = { dot: string; glow: string };

function FreshnessShell({ tone, label }: { tone: Tone; label: string }) {
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

function pickTone(state: FreshnessData | null, errored: boolean): Tone {
  if (errored || state == null || state.hoursAgo < 0) return GRAY_TONE;
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

/**
 * "Data as of Month D, YYYY" is the primary line the user reads. The
 * legacy "X hours ago" string is folded in as a low-volume secondary cue
 * so the operational signal (did the loader stall?) is still visible.
 */
function pickLabel(state: FreshnessData | null, errored: boolean): string {
  if (errored) return "Data freshness unavailable";
  if (state == null) return "Checking data freshness";

  const asOf = state.dataAsOf ? formatDataAsOf(state.dataAsOf) : null;
  if (asOf == null && state.hoursAgo < 0) return "Data freshness unavailable";

  const head = asOf ? `Data as of ${asOf}` : "Data freshness available";
  if (state.hoursAgo < 0) return head;
  if (state.hoursAgo === 0) return `${head} · synced under an hour ago`;
  const unit = state.hoursAgo === 1 ? "hour" : "hours";
  return `${head} · synced ${state.hoursAgo} ${unit} ago`;
}

/**
 * Format `YYYY-MM-DD` as `Month D, YYYY` (e.g. "May 13, 2026") in UTC so
 * the date doesn't shift across timezones for users in IL vs NY.
 */
function formatDataAsOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
