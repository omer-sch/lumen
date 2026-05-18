// Maturity-gate constants for the shared analyst.
//
// The single source of truth for the thresholds that decide whether a
// metric is statistically mature enough to emit a finding or render a
// per-cohort value. Every detector (anomstack), every per-network table
// row (snapshot.ts), and every comparison module imports from here so
// the bar moves in one place when we tune it.
//
// All thresholds are starting values picked from the existing anomstack
// and snapshot behavior. Each constant carries a comment explaining the
// choice so a future tuner does not have to reverse-engineer it.

// Z-score detector needs at least this many networks with a non-zero
// metric value before computing a mean / stdev. Lower than 3 makes the
// stdev a noisy ratio over two data points; higher would silence the
// detector for clients running on a small number of networks (the
// agency average is 3-4). Was MIN_POPULATION in the pre-move file.
export const MIN_POPULATION = 3;

// Z-score threshold: |z| >= 2 is the "two sigma" outlier convention.
// Tuned conservatively for the dashboard population (4-6 networks per
// client per period); lowering this would surface day-to-day jitter
// that does not warrant a deck callout. Was Z_THRESHOLD pre-move.
export const Z_THRESHOLD = 2.0;

// Percent-delta detector threshold: a metric that moved >=25 percent
// vs its prior baseline gets flagged. Picked from the existing
// anomstack default; CSMs surveyed last quarter consistently called
// out 25 percent as "worth mentioning in a weekly review". Below this
// the move is usually within seasonal noise. Was PCT_DELTA_THRESHOLD.
export const PCT_DELTA_THRESHOLD = 0.25;

// Cohort-D7 maturity: any per-conversion cost metric (cpaD7, ROAS_d7,
// retention_d7) that divides by sub_d7 must have at least this many
// matured D7 conversions in the denominator. Below 10, a single
// subscriber makes the per-conversion cost a four-figure outlier that
// misleads readers. Lifted from src/lib/agents/hermes/snapshot.ts
// where it sat as COHORT_D7_MATURITY_THRESHOLD; promoting it here so
// snapshot.ts, anomstack.ts, and comparisons.ts all consult the same
// number.
export const COHORT_D7_MATURITY_THRESHOLD = 10;

// Generic minimum-denominator gate for any analyst comparison or
// finding that divides one quantity by another. Below this the rate's
// confidence interval is too wide to base a finding on. Matches the
// cohort threshold by coincidence; both are starting values.
export const MIN_DENOMINATOR = 10;

// Period-over-period gate: each side of a PoP comparison needs at
// least this many days of coverage before we emit the delta as a
// finding. A 2-day window vs a 30-day window has enough seasonality
// distortion to be misleading. 5 picks the lowest count where a
// weekday/weekend mix is plausible. Reserved for the true PoP path
// (a new BQ query); the existing 30-day trailing baseline is rate-
// based and does not need a day-count gate.
export const MIN_PERIOD_DAYS = 5;

// Baseline-window gate: how many days the prior baseline period must
// cover before we trust it for anomaly detection. 7 picks one full
// week so weekday distortions wash out. Used by anomaly detectors
// when they validate the trailing window the BQ query computed.
export const MIN_BASELINE_DAYS = 7;

// Z-score detector also wants a minimum sample of finite, non-zero
// observations once the metric is materialized; the previous
// MIN_POPULATION guards the row count, this guards the projection
// after filtering. They are equal today but kept separate so a
// future detector that pulls from a wider table (e.g. per-day rows)
// can tighten the sample without affecting the network-row gate.
export const MIN_SAMPLE_SIZE = 3;

/**
 * Predicate: is this cohort sample mature enough to compute a per-unit
 * cost without noise dominating?
 *
 * Tiny D7 cohorts (sub_d7 = 1, 2) produce CPAs that span four orders of
 * magnitude as one extra paying user lands or doesn't. Any per-unit cost
 * (CPA D7, ROI D7, retention rate) that divides by a `sub_d7`-shaped
 * denominator should gate on this before rendering or emitting a
 * finding — see `snapshot.ts`, `anomstack.ts`, and the WS3 dashboard
 * tables.
 *
 * Accepts null / undefined / 0 honestly: a missing cohort isn't mature.
 */
export function isMatureCohort(sub_d7: number | null | undefined): boolean {
  if (sub_d7 == null) return false;
  return sub_d7 >= COHORT_D7_MATURITY_THRESHOLD;
}
