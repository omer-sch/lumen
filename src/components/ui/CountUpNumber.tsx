"use client";

import { useEffect, useState } from "react";

type CountUpNumberProps = {
  /** The final value to count up to. */
  value: number;
  /** Decimal places to keep. Defaults to inferred from `value`. */
  decimals?: number;
  /** Optional prefix (e.g. "$"). */
  prefix?: string;
  /** Optional suffix (e.g. "x", "%"). */
  suffix?: string;
  /** Format thousand separators (e.g. 62,418). Defaults to true. */
  thousands?: boolean;
  /** Animation duration in ms. */
  duration?: number;
  /** Delay before counting starts, e.g. for staggered cards. */
  delay?: number;
  className?: string;
};

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

const inferDecimals = (n: number) => {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(s.length - dot - 1, 2);
};

/**
 * Animated count-up. Renders the final value on the server and during the
 * first paint, then animates from 0 → value once the component mounts. The
 * brand calls for KPIs to feel alive on page load — this is that moment.
 *
 * Respects prefers-reduced-motion: if the user prefers reduced motion, the
 * final value is rendered immediately without animation.
 *
 * Why no `startedRef` guard: React StrictMode double-invokes effects in dev.
 * A "run once" guard makes the second mount bail out — but the first mount's
 * cleanup has already cancelled the rAF, so the value would stay stuck at 0.
 * Letting both mounts schedule their own animation works correctly: the first
 * is cancelled in cleanup, the second runs to completion.
 */
export function CountUpNumber({
  value,
  decimals,
  prefix,
  suffix,
  thousands = true,
  duration = 1100,
  delay = 0,
  className,
}: CountUpNumberProps) {
  const places = decimals ?? inferDecimals(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    let startedAt = 0;
    setDisplay(0);

    const tick = (ts: number) => {
      if (!startedAt) startedAt = ts;
      const t = Math.min(1, (ts - startedAt) / duration);
      const eased = easeOutQuart(t);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    const startTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(startTimer);
      if (raf) cancelAnimationFrame(raf);
      // Snap back to the final value on unmount so a strict-mode re-mount
      // (or any future remount) starts from a sensible baseline.
      setDisplay(value);
    };
  }, [value, duration, delay]);

  const formatted = formatNumber(display, places, thousands);

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

function formatNumber(n: number, places: number, thousands: boolean) {
  const fixed = n.toFixed(places);
  if (!thousands) return fixed;
  const [int, dec] = fixed.split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec === undefined ? withSep : `${withSep}.${dec}`;
}
