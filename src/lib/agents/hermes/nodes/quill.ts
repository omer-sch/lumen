import "server-only";

import type { Bullet, HermesState, HermesStateUpdate } from "../state";

// Phase 2 stub. Phase 5 replaces with: History tone retrieve -> Sonnet
// tool_use producing citation-bound bullets -> validator that fails
// the run on any un-cited bullet. The validator is load-bearing.

export async function quill(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();

  const placeholder: Bullet[] = state.findings.map((f, i) => ({
    claim: `Placeholder bullet ${i + 1} (${f.kind}): ${f.claim_template}`,
    columns_used: [],
    source_query_id: f.source_query_id,
    delta_value: f.delta ?? null,
    action_item: null,
    citations: f.citations,
    slide_target: "platform_overall",
  }));

  return {
    bullets: placeholder,
    history: [
      {
        node: "quill",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: `STUB · phase 2 · ${placeholder.length} placeholder bullets`,
      },
    ],
  };
}
