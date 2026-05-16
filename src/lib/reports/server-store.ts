import "server-only";

import { supabaseAdmin } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";

import type { Report, ReportSection } from "./types";
import type { AgentId } from "@/lib/agents/identity";

type ReportInsert = Database["public"]["Tables"]["reports"]["Insert"];

// Server-of-truth accessors for the reports table (migration 0012).
// All ownership checks happen here so the API routes can stay thin.
// supabaseAdmin() uses the service-role key (bypasses RLS); these
// helpers enforce ownership manually so a careless caller cannot leak
// another user's reports.

type ReportRow = {
  id: string;
  owner_user_id: string;
  client: string;
  client_label: string;
  title: string;
  prompt: string | null;
  period: string;
  filter_range: string | null;
  period_start: string | null;
  period_end: string | null;
  cover: Json;
  sections: Json;
  closing: Json;
  authored_by: string;
  status: string;
  source: string;
  agent_run_id: string | null;
  shared_with: Json;
  audit: Json;
  created_at: string;
  updated_at: string;
};

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    userId: row.owner_user_id,
    client: row.client,
    clientLabel: row.client_label,
    title: row.title,
    prompt: row.prompt ?? "",
    period: row.period,
    filterRange: row.filter_range ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    authoredBy: (row.authored_by as AgentId) ?? undefined,
    source: row.source === "hermes" ? "hermes" : "manual",
    agentRunId: row.agent_run_id ?? null,
    // sections is jsonb. The renderer guards on section.id, so a row
    // with a bad shape falls into ReportDocument's legacy fallback
    // rather than throwing here.
    sections: (row.sections as unknown as ReportSection[]) ?? [],
  };
}

function reportToInsert(
  report: Report,
  ownerUserId: string,
): ReportInsert {
  return {
    id: report.id,
    owner_user_id: ownerUserId,
    client: report.client,
    client_label: report.clientLabel,
    title: report.title,
    prompt: report.prompt || null,
    period: report.period,
    filter_range: report.filterRange ?? null,
    sections: report.sections as unknown as Json,
    authored_by: report.authoredBy ?? "nova",
    source: report.source ?? "manual",
    agent_run_id: report.agentRunId ?? null,
  };
}

export async function listReportsForOwner(
  ownerUserId: string,
): Promise<Report[]> {
  const { data, error } = await supabaseAdmin()
    .from("reports")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`listReportsForOwner: ${error.message}`);
  }
  return (data ?? []).map((row) => rowToReport(row as ReportRow));
}

export async function getReportForUser(
  id: string,
  callerUserId: string,
): Promise<Report | null> {
  const { data, error } = await supabaseAdmin()
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`getReportForUser: ${error.message}`);
  }
  if (!data) return null;
  const row = data as ReportRow;
  const sharedWith = Array.isArray(row.shared_with)
    ? (row.shared_with as unknown as string[])
    : [];
  const allowed =
    row.owner_user_id === callerUserId || sharedWith.includes(callerUserId);
  if (!allowed) return null;
  return rowToReport(row);
}

export async function upsertReport(
  report: Report,
  ownerUserId: string,
): Promise<Report> {
  // Ownership check on update: if a row already exists for this id,
  // owner_user_id must match. Prevents an attacker who guesses an id
  // from overwriting someone else's report through the upsert path.
  const { data: existing, error: lookupErr } = await supabaseAdmin()
    .from("reports")
    .select("owner_user_id")
    .eq("id", report.id)
    .maybeSingle();
  if (lookupErr) {
    throw new Error(`upsertReport.lookup: ${lookupErr.message}`);
  }
  if (existing && existing.owner_user_id !== ownerUserId) {
    throw new Error("upsertReport: forbidden (not owner)");
  }

  const insert = reportToInsert(report, ownerUserId);
  const { data, error } = await supabaseAdmin()
    .from("reports")
    .upsert(insert, { onConflict: "id" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`upsertReport: ${error?.message ?? "no row"}`);
  }
  return rowToReport(data as ReportRow);
}

export async function deleteReport(
  id: string,
  ownerUserId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("reports")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", ownerUserId);
  if (error) {
    throw new Error(`deleteReport: ${error.message}`);
  }
}
