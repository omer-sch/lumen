import { NextResponse } from "next/server";

import {
  addFeedback,
  listFeedbackForAgent,
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

  const incoming = (await req.json()) as IncomingFeedback;
  if (!incoming?.runId || typeof incoming.runId !== "string") {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }
  // No DB in preview — accept the save so the panel can show its
  // "Saved" affordance, but don't persist.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const userId = await getUserId();
  await addFeedback(incoming, userId);

  return NextResponse.json({ ok: true, persisted: true });
}
