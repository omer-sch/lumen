/**
 * Canonical color per ad network. Every surface that paints a network
 * (TrendChart line, PlatformFilter chip, Campaigns table pill) reads
 * from this file so the same network reads the same color everywhere.
 *
 * The mapping is grounded in the brand palette:
 *   Google           → mint (UA token)
 *   Meta             → violet (Organic token)
 *   TikTok           → coral (Creative token)
 *   AppLovin         → yellow (brand accent)
 *   Apple Search Ads → neutral gray + dashed line
 *
 * Apple Search Ads gets the neutral gray + dashed stroke convention
 * because (a) Apple's brand color clashes with the dark canvas and
 * (b) its volume on GlobalComix is structurally lower than the other
 * channels; the dashed treatment signals "support cast" without
 * making the line invisible.
 *
 * Three helpers cover the two render shapes downstream needs:
 *   networkColor      → solid (line, dot, accent stripe)
 *   networkTint       → soft background (pill, row tint)
 *   networkForeground → on-tint foreground (pill text)
 *
 * No raw hex in this file. Tokens defined in src/app/globals.css are
 * the single source of truth; this file just maps networks onto them.
 */

export const CANONICAL_NETWORKS = [
  "Google",
  "Meta",
  "TikTok",
  "AppLovin",
  "Apple Search Ads",
] as const;

export type CanonicalNetwork = (typeof CANONICAL_NETWORKS)[number];

type NetworkTokens = {
  color: string;
  tint: string;
  foreground: string;
};

const NETWORK_TOKENS: Record<CanonicalNetwork, NetworkTokens> = {
  Google:             { color: "var(--color-ua)",       tint: "var(--tint-ua-soft)",       foreground: "var(--color-ua)" },
  Meta:               { color: "var(--color-organic)",  tint: "var(--tint-organic-soft)",  foreground: "var(--color-organic)" },
  TikTok:             { color: "var(--color-creative)", tint: "var(--tint-creative-soft)", foreground: "var(--color-creative)" },
  AppLovin:           { color: "var(--color-yellow)",   tint: "var(--tint-yellow-soft)",   foreground: "var(--color-yellow)" },
  "Apple Search Ads": { color: "var(--text-muted)",     tint: "var(--surface-hover)",     foreground: "var(--text-secondary)" },
};

/**
 * Aliases the warehouse / classifier surface in addition to the
 * canonical labels. Normalized before lookup so "Facebook" and
 * "Meta" can never resolve to different colors.
 */
const NETWORK_ALIASES: Record<string, CanonicalNetwork> = {
  Facebook: "Meta",
  "Google Ads": "Google",
  Apple: "Apple Search Ads",
};

/** Apple-equivalent fallback for unrecognized network names. Same
 *  treatment as Apple Search Ads on purpose: the unknown network
 *  reads as "support cast" rather than competing for attention. */
const FALLBACK: NetworkTokens = {
  color: "var(--text-muted)",
  tint: "var(--surface-hover)",
  foreground: "var(--text-secondary)",
};

function lookup(network: string): NetworkTokens {
  if (network in NETWORK_TOKENS) {
    return NETWORK_TOKENS[network as CanonicalNetwork];
  }
  const aliased = NETWORK_ALIASES[network];
  if (aliased) return NETWORK_TOKENS[aliased];
  return FALLBACK;
}

/** Solid color: lines, dots, accent stripes, dot legends. */
export function networkColor(network: string): string {
  return lookup(network).color;
}

/** Soft tint: pill backgrounds, row tints, hover fills. */
export function networkTint(network: string): string {
  return lookup(network).tint;
}

/** Foreground on the tint: pill text, on-tint label color. */
export function networkForeground(network: string): string {
  return lookup(network).foreground;
}

/** Whether this network's line should render dashed. Apple Search Ads
 *  alone today; centralized so a future treatment change is one edit. */
export function networkLineDashed(network: string): boolean {
  if (network === "Apple Search Ads") return true;
  return NETWORK_ALIASES[network] === "Apple Search Ads";
}
