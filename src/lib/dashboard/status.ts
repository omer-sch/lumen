/**
 * Status pill computation for the network table.
 *
 * Compares the current-period CPA D7 against the trailing-30-day
 * average for the same network and buckets the result into a discrete
 * pill state. Thresholds match the deck convention:
 *
 *   ≤ 1.2× baseline → "On track" (mint)
 *   ≤ 1.5× baseline → "Getting expensive" (yellow)
 *   > 1.5× baseline → "Above threshold" (coral)
 *
 * `trailingAvg <= 0` is a stand-in for "no baseline available" (the
 * network had no matured D7 cohort in the trailing window) — we pill
 * as "warn" so the analyst sees the row but treats the number with
 * skepticism, rather than coloring it "on track" by accident.
 */
export type CpaStatus = "ok" | "warn" | "bad";

export function statusFromCpaD7(
  curr: number,
  trailingAvg: number,
): CpaStatus {
  if (trailingAvg <= 0) return "warn";
  if (curr <= 0) return "warn"; // no current cohort yet — same conservatism
  const ratio = curr / trailingAvg;
  if (ratio <= 1.2) return "ok";
  if (ratio <= 1.5) return "warn";
  return "bad";
}

export const STATUS_LABEL: Record<CpaStatus, string> = {
  ok: "On track",
  warn: "Getting expensive",
  bad: "Above threshold",
};

/** CSS custom-property name carrying the status's brand color. The
 *  consumer wires these to background / border in JSX. */
export const STATUS_COLOR_VAR: Record<CpaStatus, string> = {
  ok: "var(--color-ua)",
  warn: "var(--color-yellow)",
  bad: "var(--color-creative)",
};
