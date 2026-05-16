import "server-only";

import { END, START, StateGraph } from "@langchain/langgraph";

import { analyze } from "./nodes/analyze";
import { atelier } from "./nodes/atelier";
import { parseIntent } from "./nodes/parse-intent";
import { quill } from "./nodes/quill";
import { reviewGate } from "./nodes/review-gate";
import {
  HermesStateAnnotation,
  type HermesState,
  type HermesStateUpdate,
} from "./state";

// Linear five-node Hermes graph. Conditional edges land in Phase 7
// (regenerate-section subgraph). For Phase 2 the topology is straight
// through. Each node is defined in its own file so the build agent and
// later reviewers can swap one node at a time without touching this.

export function buildHermesGraph() {
  return new StateGraph(HermesStateAnnotation)
    .addNode("parse_intent", parseIntent)
    .addNode("analyze", analyze)
    .addNode("quill", quill)
    .addNode("atelier", atelier)
    .addNode("review_gate", reviewGate)
    .addEdge(START, "parse_intent")
    .addEdge("parse_intent", "analyze")
    .addEdge("analyze", "quill")
    .addEdge("quill", "atelier")
    .addEdge("atelier", "review_gate")
    .addEdge("review_gate", END)
    .compile();
}

export const HERMES_NODE_ORDER = [
  "parse_intent",
  "analyze",
  "quill",
  "atelier",
  "review_gate",
] as const;

export type HermesNodeName = (typeof HERMES_NODE_ORDER)[number];

export type HermesGraphInput = Pick<HermesState, "email_text" | "run_id">;

// Convenience wrapper that pushes LangSmith metadata onto each
// graph.invoke() call so a run is findable in the LangSmith UI by
// runId / client / platform / channel. When LANGSMITH_TRACING is
// unset the config is harmless: LangChain just ignores it.
//
// The Promise resolves to the full final HermesState (same as a raw
// graph.invoke). Pass through any LangGraph config option (recursion
// limit, etc.) via the extra arg.

export type HermesInvokeContext = {
  /** Optional override of the runName visible in LangSmith. Defaults
   *  to `hermes-<runId>` when input.run_id is set. */
  runName?: string;
  /** Additional metadata to merge into the trace (intent fields land
   *  here from the route handlers once the graph has parsed them; the
   *  start-of-run only has email_text and run_id). */
  metadata?: Record<string, unknown>;
  /** Extra tags merged with the default ["agent:hermes", "env:..."]. */
  tags?: string[];
};

const DEFAULT_TAGS: string[] = [
  "agent:hermes",
  `env:${process.env.NODE_ENV ?? "unknown"}`,
];

export async function invokeHermesGraph(
  input: Partial<HermesState> & Pick<HermesState, "email_text">,
  ctx: HermesInvokeContext = {},
): Promise<HermesState> {
  const graph = buildHermesGraph();
  const runName =
    ctx.runName ??
    (input.run_id ? `hermes-${input.run_id}` : "hermes-anonymous");
  const config = {
    runName,
    tags: [...DEFAULT_TAGS, ...(ctx.tags ?? [])],
    metadata: {
      run_id: input.run_id ?? null,
      user_id: input.user_id ?? null,
      ...(ctx.metadata ?? {}),
    },
  };
  const final = (await graph.invoke(input, config)) as HermesState;
  return final;
}

// Module-load LangSmith status line so operators see a single info
// log per process saying tracing is on or off. Quiet in tests.
let _loggedLangSmithStatus = false;
export function logLangSmithStatusOnce(): void {
  if (_loggedLangSmithStatus) return;
  _loggedLangSmithStatus = true;
  const enabled =
    process.env.LANGSMITH_TRACING === "true" &&
    Boolean(process.env.LANGSMITH_API_KEY);
  if (enabled) {
    console.info(
      `[hermes] LangSmith tracing enabled (project=${process.env.LANGSMITH_PROJECT ?? "default"})`,
    );
  } else {
    console.info(
      "[hermes] LangSmith tracing disabled (set LANGSMITH_TRACING=true + LANGSMITH_API_KEY to enable)",
    );
  }
}

// HermesStateUpdate exported as a re-export so importers downstream do
// not need a second import line.
export type { HermesStateUpdate };
