import "server-only";

import { END, START, StateGraph } from "@langchain/langgraph";

import { analyze } from "./nodes/analyze";
import { atelier } from "./nodes/atelier";
import { parseIntent } from "./nodes/parse-intent";
import { quill } from "./nodes/quill";
import { reviewGate } from "./nodes/review-gate";
import { HermesStateAnnotation, type HermesState } from "./state";

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
