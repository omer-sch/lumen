/**
 * Brand-formatted KPI display helpers.
 *
 * Currency rules (one number system across hero tiles, table cells, and
 * chart tooltips):
 *
 *   < $100              → two-decimal precision ($24.83)
 *   $100 - $999         → no cents, separator if needed ($344)
 *   $1,000 - $9,999     → no cents, comma separator ($1,316)
 *   $10,000 - $999,999  → abbreviated, one decimal ($14.9k, $299k)
 *   >= $1,000,000       → abbreviated, two decimals ($1.32M)
 *
 *   count — under 1,000 is the integer with no separators, 1k-999k shows
 *           "XXXk", 1M+ shows "X.XM".
 *
 *   ratio — "X.XXx" with a lowercase `x` suffix.
 *
 * Negative values keep their sign and flow through the same band logic
 * (negative spend can appear in the deltas pipeline; defensive coverage).
 */

const ONE_K = 1_000;
const TEN_K = 10_000;
const ONE_M = 1_000_000;

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Canonical currency formatter. Five magnitude bands — see file header. */
function fmtCurrency(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= ONE_M) {
    return `${sign}$${(abs / ONE_M).toFixed(2)}M`;
  }
  if (abs >= TEN_K) {
    // $10k-$999k → one decimal, trim trailing zero ($299k not $299.0k).
    return `${sign}$${trimZero((abs / ONE_K).toFixed(1))}k`;
  }
  if (abs >= ONE_K) {
    // $1k-$9,999 → comma-separated integer.
    return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
  }
  if (abs >= 100) {
    return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
  }
  // Sub-$100: two decimals so partial spend / sub-dollar costs read
  // honestly ($24.83, $0.42).
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtCompactCount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= ONE_M) {
    return `${sign}${trimZero((abs / ONE_M).toFixed(1))}M`;
  }
  if (abs >= ONE_K) {
    return `${sign}${Math.round(abs / ONE_K)}k`;
  }
  return `${sign}${Math.round(abs)}`;
}

export const formatKpi = {
  /** Canonical currency formatter — five magnitude bands. */
  currency: fmtCurrency,
  /** Alias for currency (legacy callers; same band logic). */
  money: fmtCurrency,
  /** Cost-per-X uses the same band logic so big CPAs read as "$14.9k"
   *  instead of "$14,928.79". Sub-$100 still gets two decimals. */
  cpi: fmtCurrency,
  count: fmtCompactCount,
  ratio: (n: number) => `${n.toFixed(2)}x`,
  /** Percent rate (input is a fraction 0..1). One decimal, trailing %. */
  percent: (n: number) => `${(n * 100).toFixed(1)}%`,
  /** Money with always-two-decimal cents — only for contexts where
   *  sub-dollar precision matters (CPC, CPM under $10). */
  moneyCents: (n: number) => `$${n.toFixed(2)}`,
};
