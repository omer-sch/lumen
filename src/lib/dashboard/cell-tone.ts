/**
 * Color-coded tone for a numeric cell in the Network Breakdown
 * scorecard (WS7.C). The "good / warn / bad" verdict is derived from
 * a per-network previous-period baseline, with thresholds that flip
 * polarity for cost vs volume metrics.
 *
 * The same helper is reusable by any future cadence / cohort table
 * that wants the same visual treatment, so keep it framework-free.
 */

export type CellTone = "good" | "warn" | "bad" | "neutral";

export type ToneThresholds = {
  /** Default thresholds: anything <= goodAt or >= badAt is colored;
   *  values between badAt and warnAt earn the amber warn tone; everything
   *  else stays neutral. */
  goodAt: number; // multiplier vs baseline that earns "good"
  warnAt: number; // multiplier where the cell starts to drift
  badAt: number; // multiplier that earns "bad"
};

export const DEFAULT_LOWER_BETTER_THRESHOLDS: ToneThresholds = {
  goodAt: 0.9, // 10% drop or more vs baseline
  warnAt: 1.05, // 5% rise drifts toward warn
  badAt: 1.2, // 20%+ rise is bad
};

export const DEFAULT_HIGHER_BETTER_THRESHOLDS: ToneThresholds = {
  goodAt: 1.1, // 10% rise or more vs baseline
  warnAt: 0.95, // 5% drop drifts toward warn
  badAt: 0.8, // 20%+ drop is bad
};

/**
 * Resolve the tone for a value against its baseline.
 *
 *   - `lower-better` (cost metrics: CPI, CPA, CP Sub Start): a drop is good,
 *     a rise is bad. Multiplier = value / baseline; <= goodAt is good,
 *     between warnAt and badAt is warn, >= badAt is bad.
 *   - `higher-better` (volume / return metrics: Sub D7, ROI D7, install CVR):
 *     polarity flipped.
 *
 * Returns "neutral" when either side is missing / zero so the renderer
 * paints nothing instead of fabricating a verdict.
 */
export function cellTone(
  value: number | null | undefined,
  baseline: number | null | undefined,
  direction: "lower-better" | "higher-better",
  thresholds?: ToneThresholds,
): CellTone {
  if (value == null || baseline == null || !Number.isFinite(value) || !Number.isFinite(baseline)) {
    return "neutral";
  }
  if (baseline === 0) return "neutral";
  const ratio = value / baseline;
  if (direction === "lower-better") {
    const t = thresholds ?? DEFAULT_LOWER_BETTER_THRESHOLDS;
    if (ratio <= t.goodAt) return "good";
    if (ratio >= t.badAt) return "bad";
    if (ratio >= t.warnAt) return "warn";
    return "neutral";
  }
  const t = thresholds ?? DEFAULT_HIGHER_BETTER_THRESHOLDS;
  if (ratio >= t.goodAt) return "good";
  if (ratio <= t.badAt) return "bad";
  if (ratio <= t.warnAt) return "warn";
  return "neutral";
}

/**
 * Brand-color CSS variable name for a given tone. Surface code reads
 * these as `var(--color-ua)` etc. so dark-mode theming is consistent.
 */
export function toneColorVar(tone: CellTone): string {
  switch (tone) {
    case "good":
      return "var(--color-ua)";
    case "warn":
      return "var(--color-yellow)";
    case "bad":
      return "var(--color-creative)";
    default:
      return "var(--text-muted)";
  }
}

/**
 * One-sentence tooltip explaining the tone, suitable for an aria-label
 * or hover affordance. Returns null for neutral (no explanation needed).
 */
export function toneTooltip(
  value: number,
  baseline: number,
  direction: "lower-better" | "higher-better",
  metricLabel: string,
): string | null {
  if (baseline === 0) return null;
  const deltaPct = ((value - baseline) / baseline) * 100;
  const sign = deltaPct > 0 ? "above" : "below";
  const verb = direction === "lower-better" ? "current" : "current";
  const abs = Math.abs(deltaPct).toFixed(0);
  return `${metricLabel} ${verb} is ${abs}% ${sign} this network's previous-period average.`;
}
