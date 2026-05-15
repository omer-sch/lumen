// STUB(phase-2): replaced in Phase 7.
import "server-only";

import type { HermesState, HermesStateUpdate } from "../state";

// Phase 2 stub. Phase 7 replaces with: Lior reviews in the Reports
// surface, edits bullets inline, optionally regenerates a section
// (subgraph re-runs Quill for one slide_target), then approves.
// Approve writes final bullets into the History corpus and surfaces
// the .pptx download.
//
// In Phase 2 the graph runs straight through without human input; this
// node returns immediately with approval=false so the run completes in
// a deterministic state for testing.

export async function reviewGate(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();
  return {
    history: [
      {
        node: "review_gate",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: "STUB · phase 2 · auto-completes without human approval",
      },
    ],
  };
}
