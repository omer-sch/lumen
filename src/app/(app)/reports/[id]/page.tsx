import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { ReportsView } from "@/components/reports/ReportsView";
import { isSupabaseConfigured } from "@/lib/env.server";
import { getReportForUser } from "@/lib/reports/server-store";

export const metadata = { title: "Report · Lumen" };

const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

const PREVIEW_USER_ID = "preview-user";

// SSR shell for a saved report. Loaded with the caller's auth context
// so a non-owner who isn't in shared_with gets a 404 instead of the
// row. Falls back to the client-only ReportsView when Supabase isn't
// configured (preview / CI), where useReports() will hydrate from
// localStorage and find the report by id from the query param.

export default async function ReportByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    // No server-of-truth available. Forward the id as a query param so
    // ReportsInner's existing ?id= handler can pick it from localStorage.
    redirect(`/reports?id=${encodeURIComponent(id)}`);
  }

  const { userId: clerkUserId } = await auth();
  const userId = clerkUserId ?? (PREVIEW ? PREVIEW_USER_ID : null);
  if (!userId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/reports/${id}`)}`);
  }

  const report = await getReportForUser(id, userId);
  if (!report) notFound();

  return <ReportsView preloadedReport={report} />;
}
