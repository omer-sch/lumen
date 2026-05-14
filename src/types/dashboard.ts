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

/**
 * Every metric the dashboard can plot or pin to a tile. The set grew when
 * GlobalComix moved to the per-network warehouse tables — those tables
 * carry clicks/impressions and the cohort table carries multi-window
 * revenue + retention + payer counts. Agent-strategy clients (Playw3,
 * 100play) only populate the original four; the others read as 0 / null.
 */
export type KpiId =
  | "spend"
  | "installs"
  | "clicks"
  | "impressions"
  | "cpi"
  | "roas"
  | "ctr"
  | "cpm"
  | "cpc"
  | "revD7"
  | "revD30"
  | "roasD14"
  | "roasD30"
  | "roasD90"
  | "retD7"
  | "payersD7"
  | "ftdD7"
  // ── Subscription-funnel vocabulary (GlobalComix, multi-source) ──
  // The deck yellowHEAD ships to GlobalComix talks about a free → paid
  // subscription funnel: install → sub start → sub D0 → sub D7. These
  // IDs surface that funnel in the dashboard. Agent-strategy clients
  // (Playw3, 100play) still populate the gaming-vocab IDs above; nothing
  // else changes for them.
  | "subStart"
  | "subD0"
  | "subD7"
  | "cpSubStart"
  | "cpaD0"
  | "cpaD7";

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
  /**
   * Optional numeric goal for this metric. When present, the hero KPI tile
   * renders a small progress meter under the value showing distance to
   * target. Phase 1 leaves this unset for every metric — there is no
   * agreed CPA D7 target per client yet — but the field is wired so a
   * future iteration can drop one in without a KpiCard signature change.
   */
  target?: number;
};

export type TrendPoint = {
  date: string;
  spend: number;
  installs: number;
  cpi: number;
  roas: number;
  // Optional fields — populated for multi-source clients (globalcomix);
  // agent-strategy clients leave these as 0 so the chart renders flat.
  clicks?: number;
  impressions?: number;
  ftdD7?: number;
  ctr?: number;
  cpm?: number;
  cpc?: number;
  revD7?: number;
  revD30?: number;
  roasD14?: number;
  roasD30?: number;
  roasD90?: number;
  retD7?: number;
  payersD7?: number;
  // ── Subscription funnel (multi-source) ──
  // `subStart` is the spend-side count of first-payment events (`num_ftd7`
  // in the warehouse). `subD0`/`subD7` come from the cohort's
  // `_0D_Paying_Users` / `_7D_Paying_Users`. `cpSubStart`/`cpaD0`/`cpaD7`
  // are derived at the period level (spend ÷ count) so a day with spend
  // but no matured subscribers reads as 0, not Infinity.
  subStart?: number;
  subD0?: number;
  subD7?: number;
  cpSubStart?: number;
  cpaD0?: number;
  cpaD7?: number;
};

/** Canonical channel labels. Real-data networks (e.g. "Twitter") flow
 *  through as free-form strings on `DashboardData.channelMix.channel`. */
export type Channel = "Meta" | "TikTok" | "Google" | "AppsFlyer";

export type DashboardData = {
  kpis: Kpi[];
  /** Multi-metric daily series — the TrendChart picks one metric to plot.
   *  For multi-source clients this is the aggregate across networks (kept
   *  for backward-compatible consumers); the per-network split lives on
   *  `trendByNetwork` below. */
  trend: TrendPoint[];
  /** Per-network daily series. Populated only for multi-source clients
   *  (GlobalComix). The TrendChart prefers this when present so it can
   *  render one colored line per ad network. Empty for agent-strategy
   *  clients — the legacy single-line shape stays the rendering path
   *  there. */
  trendByNetwork: { network: string; points: TrendPoint[] }[];
  /** `channel` is a free-form network label so real-data networks like
   *  "Twitter" / "AppLovin" round-trip without a type error. */
  channelMix: { channel: string; spend: number; pct: number }[];
  /** Per-network full performance table. Empty array when the active
   *  client doesn't have multi-source data. Each row carries its own
   *  `trailingCpaD7Avg` (the 30-day baseline) so the status pill has
   *  everything it needs without a separate fetch. */
  networkBreakdown: NetworkRow[];
  /** Cohort payback curve (D0 → D90). Empty when not applicable. */
  payback: PaybackPoint[];
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
  // ── Extended dwh-table metrics (multi-source clients) ──
  /** Raw click volume across all networks. */
  clicks?: number;
  /** Raw impression volume across all networks. */
  impressions?: number;
  /** First-time deposits at D7 (paying conversion proxy, summed across
   *  the per-network `num_ftd7` columns). */
  ftdD7?: number;
  /** Click-through rate (0..1). 0 if impressions are missing. */
  ctr?: number;
  /** Cost per mille — dollars per 1,000 impressions. */
  cpm?: number;
  /** Cost per click — dollars per click. */
  cpc?: number;
  /** Cohort-attributed revenue at D7 / D30 (raw dollars; the ROAS tiles
   *  are these divided by spend). */
  revD7?: number;
  revD30?: number;
  /** Cohort-attributed ROAS at D14 / D30 / D90 (D7 is on the main `roas`). */
  roasD14?: number;
  roasD30?: number;
  roasD90?: number;
  /** D7 retention rate (0..1). */
  retD7?: number;
  /** Distinct paying users in the cohort by D7. */
  payersD7?: number;
  // ── Subscription funnel (multi-source) ──
  /** First-payment events from the spend tables (`num_ftd7`). Aliased
   *  `subStart` so the UI vocabulary matches the subscription deck. */
  subStart?: number;
  /** Distinct paying users in the cohort by D0 (`_0D_Paying_Users`). */
  subD0?: number;
  /** Distinct paying users in the cohort by D7 (`_7D_Paying_Users`).
   *  Same value as `payersD7` — surfaced under the subscription label
   *  for the new vocabulary; the gaming-vocab alias stays available. */
  subD7?: number;
  /** Cost per sub-start event = spend / sub_start. */
  cpSubStart?: number;
  /** Cost per acquired subscriber at D0 = spend / sub_d0. */
  cpaD0?: number;
  /** Cost per acquired subscriber at D7 = spend / sub_d7. */
  cpaD7?: number;
  /** Optional deltas for the extended metrics. Missing entries render
   *  as "—" the same way the headline deltas do. */
  clicksDelta?: number | null;
  impressionsDelta?: number | null;
  ftdD7Delta?: number | null;
  ctrDelta?: number | null;
  cpmDelta?: number | null;
  cpcDelta?: number | null;
  revD7Delta?: number | null;
  revD30Delta?: number | null;
  roasD14Delta?: number | null;
  roasD30Delta?: number | null;
  roasD90Delta?: number | null;
  retD7Delta?: number | null;
  payersD7Delta?: number | null;
  subStartDelta?: number | null;
  subD0Delta?: number | null;
  subD7Delta?: number | null;
  cpSubStartDelta?: number | null;
  cpaD0Delta?: number | null;
  cpaD7Delta?: number | null;
};

export type BQTrendPoint = {
  /** ISO date 'YYYY-MM-DD'. */
  date: string;
  spend: number;
  installs: number;
  cpi: number;
  roas: number;
  // ── Extended dwh-table metrics (multi-source clients) ──
  clicks?: number;
  impressions?: number;
  ftdD7?: number;
  ctr?: number;
  cpm?: number;
  cpc?: number;
  revD7?: number;
  revD30?: number;
  roasD14?: number;
  roasD30?: number;
  roasD90?: number;
  retD7?: number;
  payersD7?: number;
  // ── Subscription funnel (multi-source) ──
  subStart?: number;
  subD0?: number;
  subD7?: number;
  cpSubStart?: number;
  cpaD0?: number;
  cpaD7?: number;
};

/**
 * Per-(date, network) trend row. The multi-source trend query returns
 * one of these per day per network so the chart can draw one line per
 * ad network instead of an aggregate. Agent-strategy clients keep
 * returning the legacy `BQTrendPoint[]` (no `network` field).
 */
export type BQTrendPointByNetwork = BQTrendPoint & { network: string };

/**
 * Per-network row for the dashboard's "Network performance" table. Each
 * field maps to a column in the UI — keep the shape narrow because adding
 * a field means widening the table.
 */
export type NetworkRow = {
  network: string;
  spend: number;
  /** Share of total spend (0..1) — keeps the leading row's progress bar. */
  share: number;
  installs: number;
  /** Raw click + impression counts. The KPI strip shows the period totals;
   *  these are the per-network split for the same period. */
  clicks: number;
  impressions: number;
  cpi: number;
  /** Click-through rate (0..1). 0 when impressions are 0. */
  ctr: number;
  cpm: number;
  cpc: number;
  /** D7 / D14 / D30 / D90 ROAS for this network (cohort-attributed). */
  roasD7: number;
  roasD14: number;
  roasD30: number;
  roasD90: number;
  /** First-time deposits at D7 (proxy for paying conversions in the spend
   *  table) and the cohort-side D7 payer / retention counts. */
  ftdD7: number;
  payersD7: number;
  retD7: number;
  // ── Subscription funnel (multi-source) ──
  /** Sub starts (aliased from `num_ftd7` on the spend tables). */
  subStart: number;
  /** Sub D0 — `_0D_Paying_Users` from the cohort. */
  subD0: number;
  /** Sub D7 — `_7D_Paying_Users` from the cohort (same value as
   *  `payersD7`; surfaced under the subscription vocabulary). */
  subD7: number;
  /** Unit costs against the subscription funnel. Computed at the period
   *  level from the network's spend and the matching count. */
  cpSubStart: number;
  cpaD0: number;
  cpaD7: number;
  /**
   * Average CPA D7 over the 30 days immediately preceding the active
   * filter window. Used by the dashboard's status pill (current
   * `cpaD7` vs this baseline). `0` when the trailing window had no
   * matured subscribers — the UI treats that as a "no baseline" state
   * and pills as "Getting expensive".
   */
  trailingCpaD7Avg: number;
};

/**
 * One point on the payback curve. `day` is the cohort window
 * (0/7/14/30/90); `roas` is cohort revenue / period spend.
 */
export type PaybackPoint = {
  day: number;
  roas: number;
  revenue: number;
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
  /**
   * Most recent date (YYYY-MM-DD) with non-NULL data across the per-network
   * warehouse tables that back the active client. This is the date users
   * read on the dashboard ("Data as of May 13, 2026"). Stays `null` when
   * the freshness query can be answered by Rivery telemetry but the
   * per-client query failed (rare; surfaces as a missing label).
   */
  dataAsOf: string | null;
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
