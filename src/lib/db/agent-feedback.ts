import "server-only";

import { supabaseAdmin } from "./client";
import type { AgentId } from "@/lib/agents/identity";

/** Shape consumed by AgentDetailPanel's "Your saved feedback" list.
 *  Preserved verbatim so the panel keeps working without changes when
 *  the route swaps from file-based JSON to Postgres. */
export type SavedMemoryEntry = {
  runId: string;
  thumbs: "up" | "down" | null;
  note: string;
  score: number;
  date: string;
  savedAt: string;
};

/** Payload posted by the panel — same shape the legacy file route
 *  accepted. We just route it to Postgres now. */
export type IncomingFeedback = {
  runId: string;
  thumbs: "up" | "down" | null;
  note: string;
  score: number;
  date: string;
};

/**
 * Return saved feedback for an agent, in the order the panel renders
 * (newest first). Joins agent_feedback to agent_runs so we only return
 * rows tied to the requested agent — agentId is the join filter.
 */
export async function listFeedbackForAgent(
  agentId: AgentId,
  userId: string,
): Promise<SavedMemoryEntry[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("agent_feedback")
    .select(
      // Inner join — only return feedback whose run belongs to this agent.
      "id, run_id, kind, text, rating, created_at, agent_runs!inner(agent_id, started_at)",
    )
    .eq("user_id", userId)
    .eq("agent_runs.agent_id", agentId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`[db/agent-feedback] list: ${error.message}`);

  return (data ?? []).map((row) => {
    // The PostgREST embedded shape: agent_runs is an object (inner join).
    const run = row.agent_runs as unknown as { started_at: string } | null;
    const startedAt = run?.started_at ?? row.created_at;
    return {
      runId: row.run_id,
      thumbs: kindToThumbs(row.kind),
      note: row.text ?? "",
      score: row.rating ?? 0,
      // "May 09" — matches the date format the legacy route surfaced.
      date: new Date(startedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
      }),
      savedAt: row.created_at,
    } satisfies SavedMemoryEntry;
  });
}

/** Max length of the free-text `note` field. The UI textarea allows
 *  far less than this; the cap exists so a hostile API caller can't
 *  flood the table with multi-MB rows. Mirrored at the DB level by
 *  migration 0003. */
export const MAX_FEEDBACK_TEXT_LENGTH = 2000;

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

export class FeedbackForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackForbiddenError";
  }
}

/**
 * Persist a feedback save from the panel. Maps the UI's combined-save
 * shape onto an agent_feedback row.
 *
 * Verifies the supplied `runId` actually belongs to `agentId` before
 * inserting — without this check, an authenticated user could write
 * feedback against any other user's run id (the FK only enforces "the
 * run exists"). The check runs through the service-role client, which
 * is fine because we're only reading the agent_id column.
 */
export async function addFeedback(
  incoming: IncomingFeedback,
  userId: string,
  agentId: AgentId,
): Promise<void> {
  if (typeof incoming.note !== "string") {
    throw new FeedbackValidationError("note must be a string");
  }
  if (incoming.note.length > MAX_FEEDBACK_TEXT_LENGTH) {
    throw new FeedbackValidationError(
      `note exceeds ${MAX_FEEDBACK_TEXT_LENGTH} chars`,
    );
  }

  const sb = supabaseAdmin();

  const { data: runRow, error: runErr } = await sb
    .from("agent_runs")
    .select("agent_id")
    .eq("id", incoming.runId)
    .maybeSingle();

  if (runErr) throw new Error(`[db/agent-feedback] verify run: ${runErr.message}`);
  if (!runRow) throw new FeedbackForbiddenError("run not found");
  if (runRow.agent_id !== agentId) {
    throw new FeedbackForbiddenError("run does not belong to agent");
  }

  const kind = thumbsToKind(incoming.thumbs, incoming.note);

  const { error } = await sb.from("agent_feedback").insert({
    run_id: incoming.runId,
    user_id: userId,
    kind,
    text: incoming.note || null,
    rating: incoming.score,
  });

  if (error) throw new Error(`[db/agent-feedback] add: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────
// kind <-> thumbs mapping
// ─────────────────────────────────────────────────────────────────────

function kindToThumbs(kind: string): "up" | "down" | null {
  if (kind === "thumbs_up") return "up";
  if (kind === "thumbs_down") return "down";
  return null;
}

function thumbsToKind(
  thumbs: "up" | "down" | null,
  note: string,
): "thumbs_up" | "thumbs_down" | "note" | "rating" {
  if (thumbs === "up") return "thumbs_up";
  if (thumbs === "down") return "thumbs_down";
  if (note.trim()) return "note";
  return "rating";
}
