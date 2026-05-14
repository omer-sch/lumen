import type { KpiDirection } from "@/types/dashboard";

/**
 * Compute the KPI tile's progress-meter fill as a 0..1 ratio against
 * its target. Phase 1 doesn't ship a meter on any tile (no agreed
 * targets per client), but the math is wired so a future config drop
 * can light it up without touching the component.
 *
 * Direction matters: for "lower-better" metrics (CPA / CPI / CPM), a
 * current value at or below target reads as 100% fill ("we beat
 * budget"), and the fill shrinks as the current overshoots target.
 * For "higher-better" the fill grows linearly toward target and
 * clamps at 100% on overshoot.
 */
export function targetMeterFill(
  current: number,
  target: number,
  direction: KpiDirection = "higher-better",
): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(current) || current < 0) return 0;
  const ratio =
    direction === "lower-better"
      ? target / Math.max(current, target)
      : current / target;
  return Math.max(0, Math.min(1, ratio));
}
