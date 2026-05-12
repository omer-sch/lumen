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
  },
  {
    slug: "playw3",
    name: "Playw3",
    vertical: "Gaming",
    networks: ["Meta", "Twitter"],
  },
  {
    slug: "100play",
    name: "100play",
    vertical: "Gaming",
    networks: ["Meta"],
    apiBase: "/api/bq/100play",
  },
];

export const findClient = (slug: string): Client =>
  CLIENTS.find((c) => c.slug === slug) ?? CLIENTS[0];

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
  /** Footnote rendered below the KPI strip when the spend total is partial. */
  coverageNote?: string;
};

const COVERAGE: Record<string, ClientCoverage> = {
  globalcomix: { hasInstalls: true, hasCpi: true },
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
