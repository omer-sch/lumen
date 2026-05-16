import { redirect } from "next/navigation";

import { ReportsView } from "@/components/reports/ReportsView";

export const metadata = { title: "Reports · Lumen" };

// Soft redirect: links shared before v0.5-A use /reports?id=<id>, the
// canonical URL is now /reports/<id>. Keep them working forever by
// rewriting at the server.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (id) redirect(`/reports/${encodeURIComponent(id)}`);
  return <ReportsView />;
}
