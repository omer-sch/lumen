import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Campaigns — Lumen" };

export default function CampaignsPage() {
  return (
    <div className="flex flex-col gap-6 py-6">
      <EmptyState
        title="Campaigns drill-down lands in Wave 2"
        description="The dashboard's KPI tiles will deep-link here for per-campaign breakdowns: sortable table, 7-day sparkline per row, channel filter — all driven by your global date range and client."
        accent="mint"
      />
    </div>
  );
}
