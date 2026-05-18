import { CreativeBreakdownView } from "@/components/campaigns/CreativeBreakdownView";

export const metadata = { title: "Creative Breakdown — Lumen" };

/**
 * Per-ad drilldown route — sibling to /campaigns/[id]. The Creative
 * Breakdown view sits under Campaigns so analysts navigating from
 * the index can pivot between per-campaign and per-creative views
 * without losing the global filter context.
 */
export default function CreativeBreakdownPage() {
  return <CreativeBreakdownView />;
}
