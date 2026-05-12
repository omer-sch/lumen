/** Brand-formatted KPI display helpers. */

const withCommas = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${withCommas(n)}` : `$${n.toFixed(2)}`;

const fmtCount = (n: number) => withCommas(n);

export const formatKpi = {
  money: fmtMoney,
  count: fmtCount,
  ratio: (n: number) => `${n.toFixed(2)}x`,
  cpi: (n: number) => `$${n.toFixed(2)}`,
};
