/**
 * Shapes used across the dashboard data layer.
 *
 *  - The UI runtime shapes (`Kpi`, `TrendPoint`, `DashboardData`, …) are
 *    what `KpiCard`, `TrendChart`, and `ChannelMix` consume on the page.
 *  - The BQ wire shapes (`KPIData`, `BQTrendPoint`, `ChannelBreakdown`)
 *    are the raw response bodies served by `/api/bq/*`. The dashboard hook
 *    translates BQ → UI in one place.
 */

export type ClientSlug = "globalcomix" | "playw3";

export type DateRange = {
  /** ISO date 'YYYY-MM-DD'. */
  from: string;
  to: string;
};

// ── UI runtime shapes ─────────────────────────────────────────────────────

export type KpiDirection = "higher-better" | "lower-better";

export type KpiId = "spend" | "installs" | "cpi" | "roas";

export type Kpi = {
  id: KpiId;
  label: string;
  /** Pre-formatted display string ("$284,920", "1.42x", …). */
  value: string;
  /** Period-over-period change as a percent (12.4 = +12.4%). `null` means
   *  the previous period had no data — UI should render "—", not "0.0%". */
  delta: number | null;
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

/** Canonical channel labels. Real-data networks (e.g. "Twitter") flow
 *  through as free-form strings on `DashboardData.channelMix.channel`. */
export type Channel = "Meta" | "TikTok" | "Google" | "AppsFlyer";

export type DashboardData = {
  kpis: Kpi[];
  /** Multi-metric daily series — the TrendChart picks one metric to plot. */
  trend: TrendPoint[];
  /** `channel` is a free-form network label so real-data networks like
   *  "Twitter" / "AppLovin" round-trip without a type error. */
  channelMix: { channel: string; spend: number; pct: number }[];
};

// ── BQ wire shapes ────────────────────────────────────────────────────────

export type KPIData = {
  spend: number;
  installs: number;
  cpi: number;
  /** Headline ROAS = roas_d7. */
  roas: number;
  /** Period-over-period deltas as fractions (0.12 = +12%). `null` means
   *  the previous period had a zero denominator (new spend / new client /
   *  paused last period) — the UI should render "—", not "+0.0%". */
  spendDelta: number | null;
  installsDelta: number | null;
  cpiDelta: number | null;
  roasDelta: number | null;
};

export type BQTrendPoint = {
  /** ISO date 'YYYY-MM-DD'. */
  date: string;
  spend: number;
  installs: number;
  cpi: number;
  roas: number;
};

export type ChannelBreakdown = {
  network: string;
  spend: number;
  /** 0..1. */
  share: number;
};

export type CampaignRow = {
  campaign_id: string;
  campaign_name: string;
  network: string;
  spend: number;
  installs: number;
  cpi: number;
  roas: number;
  /** `null` for campaigns that didn't exist in the previous period. */
  spendDelta: number | null;
};

export type FreshnessData = {
  /** ISO timestamp of the most recent successful Rivery run. */
  lastUpdated: string;
  /** Hours since `lastUpdated`. `-1` signals an unreadable freshness source. */
  hoursAgo: number;
};

/**
 * The date range over which a client actually has data with non-null spend.
 * Used by the dashboard to auto-snap the global date filter when the user's
 * current window falls entirely outside the available data (most often when
 * switching to a client whose data is in a different era).
 *
 * Both fields are `null` when the client has no spend rows at all.
 */
export type DataBounds = {
  /** YYYY-MM-DD or null. */
  earliest: string | null;
  latest: string | null;
};
