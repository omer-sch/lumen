import type { KpiDirection } from "@/types/dashboard";

/**
 * Map a period-over-period delta to a UI signal that reflects business
 * direction, not the numeric sign. A 4% rise on a `lower-better` metric
 * (cost going up) is a *bad* signal even though the number went up.
 *
 *   higher-better + positive  → good (mint, arrow up)
 *   higher-better + negative  → bad  (coral, arrow down)
 *   lower-better  + positive  → bad  (coral, arrow up)
 *   lower-better  + negative  → good (mint, arrow down)
 *   any           + zero/null → neutral (muted, em-dash placeholder)
 *
 * Zero is treated as "no signal" rather than a positive — when nothing
 * changed there is nothing to celebrate or warn about.
 */
export type DeltaSignal = "good" | "bad" | "neutral";

export function deltaSignal(
  delta: number | null | undefined,
  direction: KpiDirection,
): DeltaSignal {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return "neutral";
  const wentUp = delta > 0;
  if (direction === "higher-better") return wentUp ? "good" : "bad";
  return wentUp ? "bad" : "good";
}
