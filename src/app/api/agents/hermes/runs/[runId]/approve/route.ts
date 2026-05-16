import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getRun } from "@/lib/agents/_scaffold/run";
import { supabaseAdmin } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

export const runtime = "nodejs";

// Approve a Hermes draft. Stamps approval into agent_runs.output so
// downstream code can distinguish a reviewed-by-human run from an
// auto-completed one. Does NOT re-trigger the history-index pg_net
// trigger (which only fires on the status=completed transition, not on
// subsequent updates).
//
// Phase 7 v0 contract: this is the minimum-viable approval — record
// the click. Inline bullet editing + per-section regenerate land in a
// follow-up polish phase, since both require a persistent edit-state
// shape that isn't worth specing today.

function normalizedRunId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId: rawRunId } = await params;
  const runId = normalizedRunId(rawRunId);
  if (!runId) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (run.agentId !== "hermes") {
    return NextResponse.json({ error: "Not a Hermes run" }, { status: 404 });
  }
  if (run.status !== "completed") {
    return NextResponse.json(
      { error: "Run not yet complete" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const existingOutput = (run.output ?? {}) as Record<string, unknown>;
  const existingApproval =
    (existingOutput.approval as
      | { approved: boolean; approved_by: string | null; approved_at: string | null }
      | undefined) ?? {
      approved: false,
      approved_by: null,
      approved_at: null,
      edits: [],
    };
  const nextApproval = {
    ...existingApproval,
    approved: true,
    approved_by: userId,
    approved_at: now,
  };
  const nextOutput: Record<string, unknown> = {
    ...existingOutput,
    approval: nextApproval,
  };

  const { error } = await supabaseAdmin()
    .from("agent_runs")
    .update({ output: nextOutput as Json })
    .eq("id", runId);
  if (error) {
    return NextResponse.json(
      { error: "Failed to record approval" },
      { status: 500 },
    );
  }

  console.info({
    event: "hermes.approve",
    user_id: userId,
    run_id: runId,
    timestamp: now,
  });

  return NextResponse.json({
    run_id: runId,
    approved: true,
    approved_by: userId,
    approved_at: now,
  });
}
