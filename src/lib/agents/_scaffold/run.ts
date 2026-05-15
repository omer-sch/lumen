import "server-only";

import { supabaseAdmin } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

// Lifecycle wrapper around agent_runs. Every Lumen agent starts a run,
// optionally updates step/progress as it works, and finishes with
// completeRun (which trips the History RAG indexing trigger) or
// failRun. Phase 2+ will replace the bespoke Aria/Max/Nova lifecycle
// code with calls into this scaffold.

export type RunStatus = "running" | "completed" | "failed" | "scheduled";

export type StartRunArgs = {
  agentId: string;
  client?: string | null;
  input?: Record<string, unknown>;
};

export type RunRecord = {
  id: string;
  agentId: string;
  status: RunStatus;
  client: string | null;
  startedAt: string;
  completedAt: string | null;
  step: string | null;
  progress: number | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
};

function mapRow(row: {
  id: string;
  agent_id: string;
  status: string;
  client: string | null;
  started_at: string;
  completed_at: string | null;
  step: string | null;
  progress: number | null;
  input: Json | null;
  output: Json | null;
  error: string | null;
}): RunRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    status: row.status as RunStatus,
    client: row.client,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    step: row.step,
    progress: row.progress,
    input: (row.input as Record<string, unknown> | null) ?? null,
    output: (row.output as Record<string, unknown> | null) ?? null,
    error: row.error,
  };
}

export async function startRun(args: StartRunArgs): Promise<RunRecord> {
  const { data, error } = await supabaseAdmin()
    .from("agent_runs")
    .insert({
      agent_id: args.agentId,
      status: "running",
      client: args.client ?? null,
      input: (args.input ?? null) as Json | null,
    })
    .select(
      "id, agent_id, status, client, started_at, completed_at, step, progress, input, output, error",
    )
    .single();
  if (error || !data) {
    throw new Error(`startRun failed: ${error?.message ?? "no row returned"}`);
  }
  return mapRow(data);
}

export async function updateRunStep(
  runId: string,
  step: string,
  progress?: number,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("agent_runs")
    .update({
      step,
      progress: progress ?? null,
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`updateRunStep failed: ${error.message}`);
  }
}

export type CompleteRunOptions = {
  score?: number;
  note?: string;
};

export async function completeRun(
  runId: string,
  output: Record<string, unknown>,
  options: CompleteRunOptions = {},
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("agent_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      output: output as Json,
      score: options.score ?? null,
      note: options.note ?? null,
      progress: 100,
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`completeRun failed: ${error.message}`);
  }
}

export async function failRun(runId: string, message: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("agent_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: message,
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`failRun failed: ${error.message}`);
  }
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from("agent_runs")
    .select(
      "id, agent_id, status, client, started_at, completed_at, step, progress, input, output, error",
    )
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throw new Error(`getRun failed: ${error.message}`);
  }
  return data ? mapRow(data) : null;
}
