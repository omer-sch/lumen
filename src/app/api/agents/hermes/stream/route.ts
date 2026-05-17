import "server-only";

import { NextRequest } from "next/server";

import { requireAgentAuth } from "@/lib/agents/_scaffold/auth";
import { completeRun, failRun, startRun } from "@/lib/agents/_scaffold/run";
import {
  buildHermesGraph,
  logLangSmithStatusOnce,
} from "@/lib/agents/hermes/graph";
import {
  historyWeekCount,
  serializeEvent,
  type HermesEvent,
  type HermesNodeName,
  type NodeFinishedData,
} from "@/lib/agents/hermes/events";
import {
  GenerateRequestSchema,
  type HermesState,
} from "@/lib/agents/hermes/state";
import { serverEnv } from "@/lib/env.server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Streaming Hermes generate endpoint. Returns text/event-stream;
// emits one SSE frame per HermesEvent so the modal UI can paint the
// status tape, findings feed, and skeleton deck in real time.
//
// Today we stream at node granularity using LangGraph's
// `streamMode: "updates"`. Per-writer events (the inner Sonnet calls
// inside atelier) are a follow-up; the spec's "Option B" path will
// thread an emit callback through prose-writer.ts.

export async function POST(req: NextRequest) {
  // Same rate-limit budget as the sync /generate route.
  const authResult = await requireAgentAuth("hermes", {
    maxPerWindow: 10,
    windowMs: 5 * 60 * 1000,
  });
  if (!authResult.ok) {
    const headers: Record<string, string> = {};
    if (authResult.status === 429) {
      headers["Retry-After"] = String(authResult.retryAfterSeconds);
    }
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = GenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid body", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const run = await startRun({
    agentId: "hermes",
    input: {
      email_text: parsed.data.email_text,
      user_id: authResult.userId,
    },
  });

  const encoder = new TextEncoder();
  const start = Date.now();
  logLangSmithStatusOnce();

  // The graph's static node order. With the conditional edge from
  // analyze we either go directly to atelier (smart-reports live) or
  // through quill first. We synthesize node_started events between
  // node_finished frames using this list so the status tape moves
  // proactively rather than always one beat behind.
  const orderedNodes: HermesNodeName[] =
    serverEnv.USE_SMART_REPORTS === "live"
      ? ["parse_intent", "analyze", "atelier", "review_gate"]
      : ["parse_intent", "analyze", "quill", "atelier", "review_gate"];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HermesEvent) => {
        controller.enqueue(encoder.encode(serializeEvent(event)));
      };
      const now = () => new Date().toISOString();

      try {
        send({ type: "run_started", runId: run.id, at: now() });
        send({ type: "node_started", node: orderedNodes[0], at: now() });

        const graph = buildHermesGraph();
        const langgraphStream = await graph.stream(
          {
            email_text: parsed.data.email_text,
            action_notes: parsed.data.action_notes ?? null,
            run_id: run.id,
            user_id: authResult.userId,
          },
          {
            streamMode: "updates",
            runName: `hermes-stream-${run.id}`,
            tags: ["agent:hermes", "source:stream"],
            metadata: { trigger: "stream_modal", run_id: run.id },
          },
        );

        // The final accumulated state is reconstructed by tracking
        // each update; we only need a few fields (intent, deck) to
        // emit deck_ready and finalize the run.
        let intent: HermesState["intent"] | undefined;
        let deck: HermesState["deck"] | undefined;
        let findings: HermesState["findings"] = [];
        let bullets: HermesState["bullets"] = [];
        let approval: HermesState["approval"] | undefined;
        let history: HermesState["history"] = [];
        let lastEmittedIdx = 0;

        for await (const chunk of langgraphStream) {
          // streamMode:"updates" yields { [nodeName]: stateUpdate }
          // per completed node. Iterate the keys so we don't miss
          // anything if the graph fans out into parallel updates
          // (it doesn't today, but the loop is robust to it).
          for (const [nodeName, update] of Object.entries(chunk) as [
            HermesNodeName,
            Partial<HermesState>,
          ][]) {
            // Merge the partial state into our running snapshot so we
            // can build the deck_ready payload after the loop.
            if (update.intent !== undefined) intent = update.intent;
            if (update.deck !== undefined) deck = update.deck;
            if (update.findings !== undefined) findings = update.findings;
            if (update.bullets !== undefined) bullets = update.bullets;
            if (update.approval !== undefined) approval = update.approval;
            if (update.history !== undefined) {
              history = [...history, ...update.history];
            }

            const notes = lastHistoryNote(update.history, nodeName);
            const data = buildNodeData(nodeName, update);
            send({
              type: "node_finished",
              node: nodeName,
              notes,
              at: now(),
              ...(data ? { data } : {}),
            });

            // Synthesize a node_started for the NEXT node so the
            // status tape moves proactively.
            const idx = orderedNodes.indexOf(nodeName);
            if (idx >= 0) lastEmittedIdx = idx;
            const next = orderedNodes[lastEmittedIdx + 1];
            if (next) {
              send({ type: "node_started", node: next, at: now() });
            }
          }
        }

        // Finalize the run in agent_runs (same payload shape the
        // sync route persists).
        await completeRun(run.id, {
          intent,
          findings,
          bullets,
          deck,
          approval,
          history,
        });

        const reportId = deck?.report_id ?? null;
        if (reportId) {
          send({ type: "deck_ready", reportId, at: now() });
        } else {
          send({
            type: "error",
            message: "Hermes finished without a report id",
            at: now(),
          });
        }

        console.info({
          event: "agent.hermes.stream",
          principal: authResult.userId,
          run_id: run.id,
          intent_client: intent?.client ?? null,
          intent_confidence: intent?.confidence ?? null,
          bullets_count: bullets.length,
          report_id: reportId,
          latencyMs: Date.now() - start,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await failRun(run.id, message).catch(() => {});
        console.error({
          event: "agent.hermes.stream.failed",
          principal: authResult.userId,
          run_id: run.id,
          error: message,
        });
        controller.enqueue(
          encoder.encode(
            serializeEvent({
              type: "error",
              message,
              at: new Date().toISOString(),
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables Nginx/Cloudfront buffering when proxied.
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Pull the most recent history-note string out of a partial state
 *  update, falling back to a friendly default per node when the
 *  graph node didn't append a note. */
function lastHistoryNote(
  history: HermesState["history"] | undefined,
  node: HermesNodeName,
): string {
  if (history && history.length > 0) {
    const last = history[history.length - 1];
    if (typeof last.notes === "string") return last.notes;
  }
  return `${node} completed`;
}

/** Build a small typed summary of the node's output for the feed
 *  card. Mostly mirrors the fields the existing /generate route
 *  surfaces; per-node and best-effort. */
function buildNodeData(
  node: HermesNodeName,
  update: Partial<HermesState>,
): NodeFinishedData | undefined {
  if (node === "parse_intent" && update.intent) {
    return { kind: "parse_intent", intent: update.intent };
  }
  if (node === "analyze") {
    const ready = (update as { readyData?: unknown }).readyData;
    const anomalies = update.findings?.length ?? 0;
    const weeks =
      ready && typeof ready === "object" && ready !== null
        ? historyWeekCount(ready as Parameters<typeof historyWeekCount>[0])
        : 0;
    return { kind: "analyze", anomalyCount: anomalies, historyWeeks: weeks };
  }
  if (node === "atelier" && update.deck) {
    const reportId = update.deck.report_id ?? "";
    const sections = update.deck.slides?.length ?? 0;
    // proseBlocks lives on the composed report's diagnostics, but
    // the deck shape only carries slides. Use slides as a proxy.
    return {
      kind: "atelier",
      reportId,
      sections,
      proseBlocks: sections,
    };
  }
  return undefined;
}
