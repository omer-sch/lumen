// Shared filter types for the global filter spine.
//
// `OsFilter` and `PlatformFilter` re-use the analyst-layer enums
// (`IntentPlatform`, `IntentChannel`) instead of inventing parallel
// vocabularies. That way Hermes, Smart Reports, the dashboard, and the
// BQ query layer all speak the same language; a future enum drift fails
// loudly at typecheck rather than silently flowing through the runtime.

import type { IntentChannel, IntentPlatform } from "@/lib/analyst";

/**
 * Headline OS filter. `"total"` means "all OS" (no filter applied);
 * anything else narrows to that platform. Mirrors the dashboard's
 * segmented control: Total / iOS / Android / Web.
 *
 * Web is a first-class value because the Subscriber Lifecycle frame
 * (WS7.D) reads `dwh_total_subs_globalcomix`, which carries Web rows.
 * Most other surfaces have no Web data; sources that lack Web read as
 * zero when filtered to `web`, which is the honest answer.
 */
export type OsFilter = IntentPlatform | "total";

/**
 * Platform / channel filter. Empty array means "all platforms" (no
 * filter); a non-empty array narrows to that subset. Matches the
 * IntentChannel vocabulary so the dashboard, Hermes intent, and the
 * BQ query layer agree on names.
 */
export type PlatformFilter = IntentChannel;

export const ALL_OS: readonly OsFilter[] = ["total", "ios", "android", "web"];

export const ALL_PLATFORMS: readonly PlatformFilter[] = [
  "meta",
  "google",
  "tiktok",
  "apple_search_ads",
  "applovin",
];

/**
 * Type predicate for the OS query-string parser. Reject unknown values
 * so a URL like `?os=desktop` doesn't silently land in the SQL builder.
 */
export function isOsFilter(value: unknown): value is OsFilter {
  return (
    value === "total" ||
    value === "ios" ||
    value === "android" ||
    value === "web"
  );
}

export function isPlatformFilter(value: unknown): value is PlatformFilter {
  return (
    value === "meta" ||
    value === "google" ||
    value === "tiktok" ||
    value === "apple_search_ads" ||
    value === "applovin"
  );
}

/**
 * Dashboard sub-page tab. Three scopes, three URLs:
 *   - "performance"  Acquisition. KPI strip + trend + per-channel + cadence.
 *   - "lifecycle"    Subscriber state. Subs / churn / net sub over time.
 *   - "attribution"  Trust + coverage. BCAC, paid-vs-organic, attribution
 *                    validation, data freshness.
 *
 * Each tab has its own filter-relevance semantics (OS / Platform don't
 * apply on Lifecycle, for example) - TopBar conditionally renders the
 * chips per active tab.
 */
export type DashboardTab = "performance" | "lifecycle" | "attribution";

/**
 * Performance-tab cadence selector. Drives the CadenceTable's bucket
 * grain (Daily / Weekly / Monthly) and persists as `?cadence=`. Default
 * "weekly". Only relevant on the Performance tab today; a future
 * iteration will lift this to the TrendChart so both stay in agreement
 * via the same URL state.
 */
export type DashboardCadence = "daily" | "weekly" | "monthly";

export function isDashboardCadence(value: unknown): value is DashboardCadence {
  return value === "daily" || value === "weekly" || value === "monthly";
}

export const ALL_DASHBOARD_TABS: readonly DashboardTab[] = [
  "performance",
  "lifecycle",
  "attribution",
];

export function isDashboardTab(value: unknown): value is DashboardTab {
  return (
    value === "performance" ||
    value === "lifecycle" ||
    value === "attribution"
  );
}
