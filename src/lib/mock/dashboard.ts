import { CLIENTS, type Vertical } from "@/lib/mock/clients";

export type KpiDirection = "higher-better" | "lower-better";

export type KpiId = "spend" | "installs" | "cpi" | "roas";

export type Kpi = {
  id: KpiId;
  label: string;
  value: string;
  delta: number;
  direction: KpiDirection;
  hint: string;
};

export type TrendPoint = {
  date: string;
  spend: number;
  installs: number;
  cpi: number;
  roas: number;
};

export type Channel = "Meta" | "TikTok" | "Google" | "AppsFlyer";

export type DashboardData = {
  kpis: Kpi[];
  /** Multi-metric daily series — the TrendChart picks one metric to plot. */
  trend: TrendPoint[];
  channelMix: { channel: Channel; spend: number; pct: number }[];
};

export type DashboardFilters = {
  /** Inclusive window (UTC). */
  from: Date;
  to: Date;
  /** Client slug — "all" means the agency-wide roll-up. */
  client: string;
};

const TODAY = new Date("2026-04-30T00:00:00Z");

/** Per-client multipliers — stand-ins for the real account-shape variance.
 *  Gaming clients spend more; Health clients have higher ROAS; etc. */
const CLIENT_PROFILE: Record<
  string,
  { spendMul: number; cpiMul: number; roasMul: number; installsMul: number }
> = {
  "all":         { spendMul: 1.00, cpiMul: 1.00, roasMul: 1.00, installsMul: 1.00 },
  "lumi-runner": { spendMul: 0.42, cpiMul: 0.92, roasMul: 1.06, installsMul: 0.46 },
  "starforge":   { spendMul: 0.31, cpiMul: 1.12, roasMul: 0.88, installsMul: 0.28 },
  "kindle-pay":  { spendMul: 0.18, cpiMul: 1.40, roasMul: 1.32, installsMul: 0.13 },
  "altura":      { spendMul: 0.22, cpiMul: 1.05, roasMul: 1.18, installsMul: 0.21 },
  "everstride":  { spendMul: 0.09, cpiMul: 0.95, roasMul: 1.24, installsMul: 0.09 },
};

const VERTICAL_TILT: Record<Vertical, { roasMul: number }> = {
  Gaming:              { roasMul: 0.96 },
  eCommerce:           { roasMul: 1.10 },
  Fintech:             { roasMul: 1.32 },
  "Health & Fitness":  { roasMul: 1.15 },
};

const profile = (slug: string) =>
  CLIENT_PROFILE[slug] ?? CLIENT_PROFILE["all"];

const verticalMul = (slug: string) => {
  const c = CLIENTS.find((x) => x.slug === slug);
  return c ? VERTICAL_TILT[c.vertical].roasMul : 1;
};

const dayCount = (from: Date, to: Date) =>
  Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );

const buildTrend = (
  from: Date,
  to: Date,
  spendMul: number,
  installsMul: number,
  cpiMul: number,
  roasMul: number,
): TrendPoint[] => {
  const days = dayCount(from, to);
  const out: TrendPoint[] = [];
  const baseSpend = 9500;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(to);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.getUTCDay();
    const weekendFactor = day === 0 || day === 6 ? 0.78 : 1;
    const wave = 1 + Math.sin(i / 4) * 0.12;
    const noise = 1 + ((i * 37) % 11) / 100 - 0.05;
    const spend = Math.round(baseSpend * spendMul * weekendFactor * wave * noise);
    const cpi = +(4.56 * cpiMul * (0.94 + ((i * 13) % 7) / 100)).toFixed(2);
    const installs = Math.max(1, Math.round(spend / cpi) * installsMul);
    const roas = +(1.42 * roasMul * (0.92 + Math.sin(i / 3) * 0.05) * wave).toFixed(2);
    out.push({
      date: d.toISOString().slice(5, 10),
      spend,
      installs: Math.round(installs),
      cpi,
      roas,
    });
  }
  return out;
};

const sumWindow = (rows: TrendPoint[]) => {
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const installs = rows.reduce((a, r) => a + r.installs, 0);
  const cpi = installs > 0 ? spend / installs : 0;
  const roas =
    rows.reduce((a, r) => a + r.roas * r.spend, 0) / Math.max(1, spend);
  return { spend, installs, cpi, roas };
};

const withCommas = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtMoney = (n: number) =>
  n >= 1000 ? `$${withCommas(n)}` : `$${n.toFixed(2)}`;
const fmtCount = (n: number) => withCommas(n);

const BASE_CHANNEL_MIX: { channel: Channel; share: number }[] = [
  { channel: "Meta",      share: 0.435 },
  { channel: "TikTok",    share: 0.275 },
  { channel: "Google",    share: 0.204 },
  { channel: "AppsFlyer", share: 0.086 },
];

/** Default filters — used by server-rendered first paint before the URL
 *  hook hydrates. Matches the "30d / All clients" preset. */
export const DEFAULT_FILTERS: DashboardFilters = {
  from: new Date("2026-04-01T00:00:00Z"),
  to: TODAY,
  client: "all",
};

/**
 * Filter-aware dashboard data. Same call shape on server and client; pass
 * the URL-resolved filter from `useGlobalFilters` and the dashboard reacts
 * across KPIs, trend series, and channel mix simultaneously.
 */
export function getDashboardData(
  filters: Partial<DashboardFilters> = {},
): DashboardData {
  const f: DashboardFilters = {
    from: filters.from ?? DEFAULT_FILTERS.from,
    to:   filters.to   ?? DEFAULT_FILTERS.to,
    client: filters.client ?? "all",
  };

  const p = profile(f.client);
  const v = verticalMul(f.client);

  const trend = buildTrend(
    f.from,
    f.to,
    p.spendMul,
    p.installsMul,
    p.cpiMul,
    p.roasMul * v,
  );
  const totals = sumWindow(trend);

  const days = dayCount(f.from, f.to);
  const periodLabel = `vs prev ${days}d`;
  const ROAS_TARGET = 1.3;

  const totalSpend = trend.reduce((a, r) => a + r.spend, 0);
  const channelMix = BASE_CHANNEL_MIX.map((m) => ({
    channel: m.channel,
    spend: Math.round(totalSpend * m.share),
    pct: m.share * 100,
  }));

  return {
    kpis: [
      {
        id: "spend",
        label: "Spend",
        value: fmtMoney(totals.spend),
        delta: 8.4,
        direction: "higher-better",
        hint: periodLabel,
      },
      {
        id: "installs",
        label: "Installs",
        value: fmtCount(totals.installs),
        delta: 12.1,
        direction: "higher-better",
        hint: periodLabel,
      },
      {
        id: "cpi",
        label: "CPI",
        value: `$${totals.cpi.toFixed(2)}`,
        delta: -3.2,
        direction: "lower-better",
        hint: "lower is better",
      },
      {
        id: "roas",
        label: "ROAS (D7)",
        value: `${totals.roas.toFixed(2)}x`,
        delta: 5.7,
        direction: "higher-better",
        hint: `vs target ${ROAS_TARGET.toFixed(2)}x`,
      },
    ],
    trend,
    channelMix,
  };
}

/** Format helpers exported for component use. */
export const formatKpi = {
  money: fmtMoney,
  count: fmtCount,
  ratio: (n: number) => `${n.toFixed(2)}x`,
  cpi:   (n: number) => `$${n.toFixed(2)}`,
};
