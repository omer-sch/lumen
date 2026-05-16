// Phase 7 ships the review surface out-of-graph (a separate page +
// POST /api/agents/hermes/runs/[id]/approve), so the in-graph
// review_gate node stays as a deterministic passthrough that just
// records a history breadcrumb. It receives state only so the graph
// has a single shape for every node; the underscore-prefixed name
// tells the linter we never read it.
import "server-only";

import type { HermesState, HermesStateUpdate } from "../state";

export async function reviewGate(
  _state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();
  return {
    history: [
      {
        node: "review_gate",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: "passthrough — approval flow lives out-of-graph (phase 7)",
      },
    ],
  };
}
