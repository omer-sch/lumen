import { NextResponse } from "next/server";

import {
  addFeedback,
  FeedbackForbiddenError,
  FeedbackValidationError,
  listFeedbackForAgent,
  MAX_FEEDBACK_TEXT_LENGTH,
  type IncomingFeedback,
} from "@/lib/db/agent-feedback";
import { getUserId } from "@/lib/db/user";
import { isSupabaseConfigured } from "@/lib/env.server";
import type { AgentId } from "@/lib/agents/identity";

type RouteContext = { params: Promise<{ agentId: string }> };

const KNOWN: readonly AgentId[] = ["aria", "max", "nova"];

function isKnownAgent(id: string): id is AgentId {
  return (KNOWN as readonly string[]).includes(id);
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { agentId } = await ctx.params;
  if (!isKnownAgent(agentId)) {
    return NextResponse.json({ entries: [] });
  }
  // Preview-only design checkouts run without Supabase env. Return an
  // empty list so the panel renders the static memory chips without
  // surfacing a backend error.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ entries: [] });
  }

  const userId = await getUserId();
  const entries = await listFeedbackForAgent(agentId, userId);
  return NextResponse.json({ entries });
}

export async function POST(req: Request, ctx: RouteContext) {
  const { agentId } = await ctx.params;
  if (!isKnownAgent(agentId)) {
    return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  }

  let incoming: IncomingFeedback;
  try {
    incoming = (await req.json()) as IncomingFeedback;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!incoming?.runId || typeof incoming.runId !== "string") {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }
  if (typeof incoming.note !== "string") {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });
  }
  if (incoming.note.length > MAX_FEEDBACK_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `note exceeds ${MAX_FEEDBACK_TEXT_LENGTH} chars` },
      { status: 400 },
    );
  }
  // No DB in preview — accept the save so the panel can show its
  // "Saved" affordance, but don't persist.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const userId = await getUserId();
  try {
    await addFeedback(incoming, userId, agentId);
  } catch (err) {
    if (err instanceof FeedbackForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof FeedbackValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true, persisted: true });
}
