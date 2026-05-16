import "server-only";

import { supabaseAdmin } from "@/lib/db/client";

// Recent Hermes runs for a given user. agent_runs has no first-class
// user_id column; v0.5-B chunk B2 stamps user_id into agent_runs.input
// at startRun time. The Postgres `input->>user_id` JSON arrow filter
// scopes the list per-user. Legacy runs (pre-stamp) are not returned
// for any user; that's intentional, the profile is "your runs", not
// "the agent's history."

export type HermesRunRow = {
  id: string;
  status: string;
  client: string | null;
  startedAt: string;
  completedAt: string | null;
  step: string | null;
  /** Hydrated from agent_runs.output (Atelier writes this). Drives the
   *  "open report" link on the table row. */
  reportId: string | null;
};

type AgentRunRow = {
  id: string;
  status: string;
  client: string | null;
  started_at: string;
  completed_at: string | null;
  step: string | null;
  output: Record<string, unknown> | null;
};

export async function listRecentHermesRunsForUser(
  userId: string,
  limit = 10,
): Promise<HermesRunRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_runs")
    .select(
      "id, status, client, started_at, completed_at, step, output, input",
    )
    .eq("agent_id", "hermes")
    .filter("input->>user_id", "eq", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`listRecentHermesRunsForUser: ${error.message}`);
  }
  return (data ?? []).map((row) => {
    const r = row as unknown as AgentRunRow;
    const output = r.output ?? {};
    const deck = (output as { deck?: { report_id?: string | null } }).deck;
    return {
      id: r.id,
      status: r.status,
      client: r.client,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      step: r.step,
      reportId: deck?.report_id ?? null,
    };
  });
}
