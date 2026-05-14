/**
 * Canonical color per ad network, used wherever the chart, the table,
 * or a pin draws a line / pill for a network. The four colors map onto
 * the brand's mint / violet / coral / neutral palette so each network
 * carries a consistent visual identity across the dashboard.
 *
 * Apple Search Ads gets the neutral gray + a dashed stroke convention
 * because (a) Apple's brand color clashes with the dark canvas and
 * (b) its volume on GlobalComix is structurally lower than the other
 * three; the dashed treatment signals "support cast" without making
 * the line invisible.
 */
export const NETWORK_COLORS = {
  Google: "#54F0A3",
  Meta: "#926FDE",
  TikTok: "#F88673",
  "Apple Search Ads": "#9CA9C5",
} as const;

export type CanonicalNetwork = keyof typeof NETWORK_COLORS;

/** Fallback for unrecognized network names (defensive — the SQL
 *  layer only emits one of the four). */
const FALLBACK = "#9CA9C5";

export function networkColor(network: string): string {
  return (NETWORK_COLORS as Record<string, string>)[network] ?? FALLBACK;
}

/** Whether this network's line should render dashed. Apple Search Ads
 *  alone, today; centralized here so a future treatment change is
 *  one edit. */
export function networkLineDashed(network: string): boolean {
  return network === "Apple Search Ads";
}
