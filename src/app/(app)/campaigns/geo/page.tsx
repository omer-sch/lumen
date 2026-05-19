import { GeoBreakdownView } from "@/components/campaigns/GeoBreakdownView";

export const metadata = { title: "Geo Breakdown — Lumen" };

/**
 * Client-wide Geo drilldown at /campaigns/geo. Sibling to
 * /campaigns/creatives — both sit under the Campaigns top-level page
 * so the global filter (date / OS / platform / client) flows in as
 * context. Looker's per-network Geo pages collapse into this single
 * route since "TikTok GEO" is the same page with TikTok selected in
 * the Channels chip.
 */
export default function GeoBreakdownPage() {
  return <GeoBreakdownView />;
}
