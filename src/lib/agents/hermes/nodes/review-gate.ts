// v0.5-A moves the review surface to /reports/<id> (chunk 3) so this
// node stays a deterministic passthrough that just records a history
// breadcrumb. Approval + edits flow happens out-of-graph on the
// reports row (chunk 7 audit log). The underscore-prefixed state
// param tells the linter we never read it.
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
        notes: "passthrough:approval flow lives out-of-graph (phase 7)",
      },
    ],
  };
}
