/**
 * Brand-formatted KPI display helpers.
 *
 * Format rules (locked by the dashboard spec — every tile uses these so
 * the page reads as one number system, not four):
 *
 *   money — under $1M shows "$XXXk", at $1M and above shows "$X.XM".
 *           Always carries a leading `$`. Falls back to "$X.XX" only when
 *           the value is under one dollar (analytics edge cases — partial
 *           spend on the freshness boundary).
 *
 *   count — under 1,000 is the integer with no separators, 1k-999k shows
 *           "XXXk", 1M+ shows "X.XM".
 *
 *   cpi   — "$X.XX" always.
 *
 *   ratio — "X.XXx" with a lowercase `x` suffix.
 *
 * `Math.abs` is taken before the unit chooser so negative values still
 * route through the same bucket (negative spend can appear in the deltas
 * pipeline but isn't expected to reach these formatters — defensive).
 */

const ONE_K = 1_000;
const ONE_M = 1_000_000;

function fmtCompact(n: number, withSign: string): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= ONE_M) {
    // "$1.2M" / "1.2M". Trim a trailing ".0" so flat millions read as "1M"
    // not "1.0M" — same convention Looker uses.
    return `${sign}${withSign}${trimZero((abs / ONE_M).toFixed(1))}M`;
  }
  if (abs >= ONE_K) {
    // "$342k" / "342k". Whole-thousand precision — the analyst spends
    // their attention budget on the bigger story, not the last $40 spent.
    return `${sign}${withSign}${Math.round(abs / ONE_K)}k`;
  }
  // Sub-thousand falls back to integer (count) or two-decimal dollars
  // (money), depending on which branch called us.
  return ""; // sentinel — caller branches on the empty string
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

const fmtMoney = (n: number): string => {
  const compact = fmtCompact(n, "$");
  if (compact) return compact;
  // Sub-$1k: two decimals so partial-day spend reads as "$0.42" not "$0".
  // Negative passes through `toFixed`, which keeps the sign.
  return `$${n.toFixed(2)}`;
};

const fmtCount = (n: number): string => {
  const compact = fmtCompact(n, "");
  if (compact) return compact;
  // Sub-1k: plain integer, no separators. Round halves to nearest int so
  // float-y inputs (rare) don't render as "12.3 installs".
  return `${Math.round(n)}`;
};

export const formatKpi = {
  money: fmtMoney,
  count: fmtCount,
  ratio: (n: number) => `${n.toFixed(2)}x`,
  cpi: (n: number) => `$${n.toFixed(2)}`,
  /** Percent rate (input is a fraction 0..1). One decimal, trailing %. */
  percent: (n: number) => `${(n * 100).toFixed(1)}%`,
  /** Money with two-decimal cents (CPC / CPM where sub-dollar matters). */
  moneyCents: (n: number) => `$${n.toFixed(2)}`,
};
