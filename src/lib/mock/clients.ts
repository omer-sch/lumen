import type { KpiId } from "@/types/dashboard";

export type Vertical = "Gaming" | "eCommerce" | "Fintech" | "Health & Fitness";

export type Client = {
  slug: string;
  name: string;
  vertical: Vertical;
  /** Networks that actually exist for this client (UI hint only). */
  networks?: string[];
  /**
   * Base path used by the dashboard hook to reach this client's data routes.
   * Defaults to `/api/bq` (the agent-layer routes). Lumen-union clients set
   * this to their own subpath, e.g. `/api/bq/100play`, where the per-client
   * query module is wired.
   */
  apiBase?: string;
  /**
   * True when a per-client query module (BQ networks/campaigns/trend)
   * exists for this client. Only GlobalComix is wired today; playw3 +
   * 100play return data through other routes but lack the per-client
   * query module the Reports surface needs to assemble a deck. The
   * Reports builder gates on this so we never produce a fixture-only
   * deck and label it real.
   */
  hasRealData: boolean;
};

/**
 * Live BQ-backed client roster. Every entry must match an `ALLOWED_CLIENTS`
 * entry (env-driven, see `bq-security.ts`) and either a `CLIENT_TO_TABLE`
 * mapping (agent strategy) or a per-client query module (lumen-union).
 */
export const CLIENTS: Client[] = [
  {
    slug: "globalcomix",
    name: "GlobalComix",
    vertical: "Gaming",
    networks: ["Meta", "TikTok", "Google", "AppsFlyer"],
    hasRealData: true,
  },
  {
    slug: "playw3",
    name: "Playw3",
    vertical: "Gaming",
    networks: ["Meta", "Twitter"],
    hasRealData: false,
  },
  {
    slug: "100play",
    name: "100play",
    vertical: "Gaming",
    networks: ["Meta"],
    apiBase: "/api/bq/100play",
    hasRealData: false,
  },
];

export const findClient = (slug: string): Client =>
  CLIENTS.find((c) => c.slug === slug) ?? CLIENTS[0];

/** True when the Reports builder can assemble a real-data deck for
 *  this client. Other surfaces (dashboard, campaigns, ask) are not
 *  gated by this flag. */
export function clientHasReportData(slug: string): boolean {
  return Boolean(CLIENTS.find((c) => c.slug === slug)?.hasRealData);
}

/** Subset of CLIENTS the Reports builder picker should show. */
export function clientsWithReportData(): Client[] {
  return CLIENTS.filter((c) => c.hasRealData);
}

/** Where the dashboard hook should fetch this client's data from. */
export function getClientApiBase(slug: string): string {
  return findClient(slug).apiBase ?? "/api/bq";
}

/**
 * What metrics each client actually has data for. Used by the dashboard to
 * hide tiles / swap options that would render as a misleading zero.
 *
 *  - GlobalComix has the full agent dataset → all four KPIs.
 *  - Playw3 has agent data but installs are 100% NULL upstream (Twitter +
 *    Meta-without-AppsFlyer) → hide Installs / CPI.
 *  - 100play is spend-only Meta data — no installs, no usable revenue → hide
 *    Installs / CPI; ROAS will read as ~0 until revenue lands.
 */
export type ClientCoverage = {
  hasInstalls: boolean;
  hasCpi: boolean;
  /**
   * Subset of KPI ids the client's source data can populate. Used to gate
   * the swap dropdown + tile presence so we never offer the user a
   * "Retention D7" tile that would just read 0%. When undefined, falls
   * back to the legacy four (spend/installs/cpi/roas) — see
   * `getSupportedKpis()`.
   */
  supportedKpis?: KpiId[];
  /** Muted footnote rendered below the KPI strip when the spend total is
   *  partial (e.g. only a subset of networks contributing). Read as scope
   *  metadata: "you're seeing X but not Y". */
  coverageNote?: string;
  /**
   * Data-quality caveat rendered as a proper info callout (yellow accent,
   * info icon, dismissable). Used when something the *user trusts* about
   * the numbers isn't true — e.g. an attribution gap that would make a
   * specific computation misleading without context.
   */
  qualityCallout?: {
    title: string;
    body: string;
    /** Stable key used by the callout to persist the user's dismissal. */
    dismissKey: string;
  };
};

// Default tile set for agent-strategy clients (only the four core
// metrics are guaranteed to populate). Multi-source clients override
// this with the full extended set.
const LEGACY_KPIS: KpiId[] = ["spend", "installs", "cpi", "roas"];

// Everything the multi-source `dwh_*_globalcomix_adjust` + cohort path
// can fill in. Order matches the analyst's mental sequence — the deck
// reads the funnel left-to-right (spend → volume → conversions → unit
// cost → payback / detail), so the swap dropdown offers them in that
// reading order.
const MULTI_SOURCE_KPIS: KpiId[] = [
  // Hero + funnel volume
  "cpaD7",
  "spend",
  "installs",
  "subStart",
  "subD0",
  "subD7",
  // Unit cost — the deck's primary lens for week-over-week comparisons
  "cpi",
  "cpSubStart",
  "cpaD0",
  // Engagement + click economics
  "clicks",
  "impressions",
  "ctr",
  "cpm",
  "cpc",
  // Retention / revenue / ROAS (Detail group — present but de-emphasized
  // in the chart tab strip)
  "retD7",
  "revD7",
  "revD30",
  "roas",
  "roasD14",
  "roasD30",
  "roasD90",
  "payersD7",
  "ftdD7",
];

const COVERAGE: Record<string, ClientCoverage> = {
  globalcomix: {
    hasInstalls: true,
    hasCpi: true,
    supportedKpis: MULTI_SOURCE_KPIS,
    // The Google iOS attribution gap (raw CPIs in the $4k-$29k range
    // are Adjust artifacts) is surfaced as a proper info callout, not a
    // footnote — analysts should *see* the caveat the first time they
    // look at the dashboard, and confirm Lumen knows about it.
    qualityCallout: {
      title: "Google iOS install attribution is unavailable.",
      body: "CPI and ROAS figures exclude Google iOS campaigns. Spend totals are unaffected.",
      dismissKey: "lumen.notice.globalcomix.google-ios-attribution",
    },
  },
  playw3: {
    hasInstalls: false,
    hasCpi: false,
    coverageNote: "Spend reflects Meta and Twitter only for this client.",
  },
  "100play": {
    hasInstalls: false,
    hasCpi: false,
    coverageNote: "Spend reflects Meta only for this client.",
  },
};

export function getClientCoverage(slug: string): ClientCoverage {
  return COVERAGE[slug] ?? { hasInstalls: true, hasCpi: true };
}

/**
 * KPI ids the dashboard should offer for a client. Falls back to the
 * legacy four when the client config doesn't list any. The DashboardView
 * filters its tile + swap options through this.
 */
export function getSupportedKpis(slug: string): KpiId[] {
  return getClientCoverage(slug).supportedKpis ?? LEGACY_KPIS;
}
