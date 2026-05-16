import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/env.server";
import { diffSectionsForAudit } from "@/lib/reports/audit";
import {
  deleteReport,
  getReportForUser,
  upsertReport,
} from "@/lib/reports/server-store";
import { ReportPayloadSchema } from "@/lib/reports/wire";
import type { Report, ReportSection } from "@/lib/reports/types";

export const runtime = "nodejs";

function supabaseGate() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }
  return null;
}

// GET /api/reports/[id] fetches one report. Returns 404 for both
// "not found" and "found but not authorised" so the endpoint does not
// leak existence to a non-owner.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = supabaseGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const authResult = await requireUser({ scope: "reports.get" });
  if (!authResult.ok) {
    const headers: Record<string, string> = {};
    if (authResult.status === 429) {
      headers["Retry-After"] = String(authResult.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status, headers },
    );
  }
  try {
    const report = await getReportForUser(id, authResult.userId);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error({
      event: "reports.get.failed",
      userId: authResult.userId,
      report_id: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Get failed" }, { status: 500 });
  }
}

// PUT /api/reports/[id] upserts a report. Path id is canonical; body
// id is validated to match so an attacker cannot smuggle a different
// id in the payload.
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = supabaseGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const authResult = await requireUser({
    scope: "reports.upsert",
    maxPerWindow: 120,
  });
  if (!authResult.ok) {
    const headers: Record<string, string> = {};
    if (authResult.status === 429) {
      headers["Retry-After"] = String(authResult.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status, headers },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ReportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (parsed.data.id !== id) {
    return NextResponse.json(
      { error: "Path id and body id must match" },
      { status: 400 },
    );
  }

  // Diff the prior sections (if any) against the new ones so each
  // section the caller actually changed lands as one "edit" audit
  // entry. New reports skip this; the create path produces zero
  // entries. The lookup also doubles as a defensive ownership check
  // alongside upsertReport's own.
  const prior = await getReportForUser(parsed.data.id, authResult.userId);
  const newEntries =
    prior != null
      ? diffSectionsForAudit(
          prior.sections,
          parsed.data.sections as ReportSection[],
          authResult.userId,
        )
      : [];

  const report: Report = {
    id: parsed.data.id,
    userId: authResult.userId,
    client: parsed.data.client,
    clientLabel: parsed.data.clientLabel,
    title: parsed.data.title,
    prompt: parsed.data.prompt,
    period: parsed.data.period,
    filterRange: parsed.data.filterRange,
    authoredBy: parsed.data.authoredBy,
    source: parsed.data.source,
    agentRunId: parsed.data.agentRunId ?? null,
    sections: parsed.data.sections as ReportSection[],
    audit: [...(prior?.audit ?? []), ...newEntries],
    createdAt: parsed.data.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const saved = await upsertReport(report, authResult.userId);
    return NextResponse.json({ report: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error({
      event: "reports.upsert.failed",
      userId: authResult.userId,
      report_id: id,
      error: message,
    });
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }
}

// DELETE /api/reports/[id] removes the caller's report. No-op on a
// row that isn't theirs (the ownership predicate scopes the delete).
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = supabaseGate();
  if (gate) return gate;
  const { id } = await ctx.params;
  const authResult = await requireUser({ scope: "reports.delete" });
  if (!authResult.ok) {
    const headers: Record<string, string> = {};
    if (authResult.status === 429) {
      headers["Retry-After"] = String(authResult.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status, headers },
    );
  }
  try {
    await deleteReport(id, authResult.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error({
      event: "reports.delete.failed",
      userId: authResult.userId,
      report_id: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
