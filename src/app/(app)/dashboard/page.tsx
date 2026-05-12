import { DashboardView } from "@/components/dashboard/DashboardView";
import { DataFreshnessBar } from "@/components/dashboard/DataFreshnessBar";

export default function DashboardPage() {
  return (
    <div className="-mx-4 -my-5 flex flex-col sm:-mx-6 md:-mx-8 md:-my-6">
      <DataFreshnessBar />
      <div className="px-4 py-5 sm:px-6 md:px-8 md:py-6">
        <DashboardView />
      </div>
    </div>
  );
}
