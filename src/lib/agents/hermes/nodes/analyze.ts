import "server-only";

import type {
  Finding,
  HermesState,
  HermesStateUpdate,
} from "../state";

// Phase 2 stub. Phase 4 replaces with: cached BQ fetch -> Anomstack
// deterministic detectors -> Sonnet rank + frame with parallel
// Knowledge + History retrieve. Output schema is final so the
// downstream graph can be wired today; only the body changes.

export async function analyze(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();

  const intent = state.intent;
  const placeholder: Finding[] = intent
    ? [
        {
          kind: "info",
          claim_template:
            "Placeholder finding for {client} on {channels}. Phase 4 replaces this with real BQ-derived anomalies.",
          source_query_id: "stub:phase-2",
          citations: [],
          severity: "low",
        },
      ]
    : [];

  return {
    findings: placeholder,
    history: [
      {
        node: "analyze",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: "STUB · phase 2",
      },
    ],
  };
}
