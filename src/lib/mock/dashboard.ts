export type KpiDirection = "higher-better" | "lower-better";

export type Kpi = {
  id: string;
  label: string;
  value: string;
  delta: number;
  direction: KpiDirection;
  hint: string;
};

export type TrendPoint = { date: string; primary: number };
export type TrendFormatter = "money" | "count";

export type DashboardData = {
  kpis: Kpi[];
  trend: {
    title: string;
    subtitle: string;
    metricLabel: string;
    formatter: TrendFormatter;
    data: TrendPoint[];
  };
  channelMix: { channel: string; spend: number; pct: number }[];
};

const last30Days = (seed: number): TrendPoint[] => {
  const out: TrendPoint[] = [];
  const today = new Date("2026-04-30T00:00:00Z");
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.getUTCDay();
    const weekendFactor = day === 0 || day === 6 ? 0.78 : 1;
    const wave = 1 + Math.sin(i / 4) * 0.12;
    const noise = 1 + ((i * 37) % 11) / 100 - 0.05;
    out.push({
      date: d.toISOString().slice(5, 10),
      primary: Math.round(seed * weekendFactor * wave * noise),
    });
  }
  return out;
};

const DATA: DashboardData = {
  kpis: [
    { id: "spend", label: "Spend", value: "$284,920", delta: 8.4, direction: "higher-better", hint: "vs prev 30d" },
    { id: "installs", label: "Installs", value: "62,418", delta: 12.1, direction: "higher-better", hint: "vs prev 30d" },
    { id: "cpi", label: "CPI", value: "$4.56", delta: -3.2, direction: "lower-better", hint: "lower is better" },
    { id: "roas", label: "ROAS (D7)", value: "1.42x", delta: 5.7, direction: "higher-better", hint: "vs target 1.30x" },
  ],
  trend: {
    title: "Spend over time",
    subtitle: "Daily, last 30 days",
    metricLabel: "Spend",
    formatter: "money",
    data: last30Days(9500),
  },
  channelMix: [
    { channel: "Meta", spend: 124000, pct: 43.5 },
    { channel: "TikTok", spend: 78400, pct: 27.5 },
    { channel: "Google", spend: 58200, pct: 20.4 },
    { channel: "AppsFlyer", spend: 24320, pct: 8.6 },
  ],
};

export function getDashboardData(): DashboardData {
  return DATA;
}
