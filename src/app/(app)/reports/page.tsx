import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Reports — Lumen" };

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6 py-6">
      <EmptyState
        title="Reports builder lands in Wave 3"
        description="Free-text → AI-structured document, editable sections, share link, PDF export. The global filter feeds in as default context."
        accent="yellow"
      />
    </div>
  );
}
