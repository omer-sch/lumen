import "server-only";

import { END, START, StateGraph } from "@langchain/langgraph";

import { quill } from "./nodes/quill";
import { HermesStateAnnotation, type Bullet, type SlideTarget } from "./state";

// Per-section regenerate. Today this is a single-node sub-graph
// (Quill); the StateGraph shape is intentional so the trace surfaces
// identically to a full run in LangSmith once that lands in workstream
// D, and so future regen targets (e.g. a sweep node before Quill that
// scopes findings to one slide) can be added without rewriting
// callers.
//
// Quill itself does not take a slide_target parameter; it produces
// bullets for every target in one Sonnet call. The endpoint that
// wraps this filters the result back down to the requested target.
// That wastes some output tokens; the cost trade-off is documented
// in the v0.5-A session note, and the alternative (a prompt-level
// scoping) is queued for the regenerate v1.1.
export function buildQuillRegenerateGraph() {
  return new StateGraph(HermesStateAnnotation)
    .addNode("quill", quill)
    .addEdge(START, "quill")
    .addEdge("quill", END)
    .compile();
}

export type RegenerateTarget = Exclude<SlideTarget, "closing">;

export function filterBulletsToTarget(
  bullets: Bullet[],
  target: RegenerateTarget,
): Bullet[] {
  return bullets.filter((b) => b.slide_target === target);
}
