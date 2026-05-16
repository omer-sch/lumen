import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { requireAgentAuth } from "@/lib/agents/_scaffold/auth";
import { completeRun, failRun, startRun } from "@/lib/agents/_scaffold/run";
import {
  invokeHermesGraph,
  logLangSmithStatusOnce,
} from "@/lib/agents/hermes/graph";
import { GenerateRequestSchema } from "@/lib/agents/hermes/state";

export const runtime = "nodejs";
export const maxDuration = 300;

// Synchronous endpoint for Phase 2. Streaming variant arrives in
// Phase 8 (paste-to-draft entry point + SSE). Today this runs the
// graph end to end and returns the final state.

export async function POST(req: NextRequest) {
  // Hermes runs are expensive (Haiku + multi-LLM by phase 6). Tighter
  // than the scaffold default (30 / 5 min). Recommended by Security
  // squad in the Phase 2 review.
  const authResult = await requireAgentAuth("hermes", {
    maxPerWindow: 10,
    windowMs: 5 * 60 * 1000,
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
  const parsed = GenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const start = Date.now();

  const run = await startRun({
    agentId: "hermes",
    // user_id stamped into input so the /agents/hermes profile page
    // can scope its Recent Runs table per-user (agent_runs has no
    // first-class user_id column today).
    input: { email_text: parsed.data.email_text, user_id: authResult.userId },
  });

  try {
    logLangSmithStatusOnce();
    const finalState = await invokeHermesGraph(
      {
        email_text: parsed.data.email_text,
        run_id: run.id,
        user_id: authResult.userId,
      },
      {
        tags: ["source:paste"],
        metadata: { trigger: "paste_modal" },
      },
    );

    await completeRun(run.id, {
      intent: finalState.intent,
      findings: finalState.findings,
      bullets: finalState.bullets,
      deck: finalState.deck,
      approval: finalState.approval,
      history: finalState.history,
    });

    console.info({
      event: "agent.hermes.generate",
      principal: authResult.userId,
      run_id: run.id,
      intent_client: finalState.intent?.client ?? null,
      intent_confidence: finalState.intent?.confidence ?? null,
      bullets_count: finalState.bullets.length,
      report_id: finalState.deck?.report_id ?? null,
      latencyMs: Date.now() - start,
    });

    return NextResponse.json({
      run_id: run.id,
      report_id: finalState.deck?.report_id ?? null,
      intent: finalState.intent,
      findings: finalState.findings,
      bullets: finalState.bullets,
      deck: finalState.deck,
      approval: finalState.approval,
      history: finalState.history,
      latency_ms: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(run.id, message).catch(() => {});
    console.error({
      event: "agent.hermes.generate.failed",
      principal: authResult.userId,
      run_id: run.id,
      error: message,
    });
    return NextResponse.json(
      { error: "Hermes run failed", run_id: run.id },
      { status: 500 },
    );
  }
}
