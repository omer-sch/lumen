import "server-only";

import { upsertReport } from "@/lib/reports/server-store";

import { assembleHermesReport } from "../assemble";
import type {
  Deck,
  HermesState,
  HermesStateUpdate,
} from "../state";

// Atelier · v0.5-A chunk 4.
//
// The v0 Atelier wrote a server-side .pptx via pptxgenjs and pointed
// the review surface at a custom /agents/hermes/runs/<id> page. v0.5-A
// replaces that with: assemble a Report from the snapshot + Quill
// bullets, insert it into the reports table as a draft, hand the
// caller back the report_id. The /reports/<id> surface (chunk 3) then
// renders it via the same components a manually-built report uses;
// the export-pptx.ts renderer fires client-side from Lior's Export
// button, so there is one renderer for both flows.
//
// Skips:
//  - missing intent / snapshot / user_id: returns a Deck with a null
//    report_id and a notes breadcrumb. The caller treats that as a
//    failed assemble (no report opens, run still completes).

export async function atelier(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();

  const skip = (notes: string): HermesStateUpdate => ({
    deck: { pptx_path: null, slides: [], report_id: null },
    history: [
      {
        node: "atelier",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes,
      },
    ],
  });

  if (!state.intent) return skip("skipped: missing intent");
  if (!state.snapshot) return skip("skipped: missing snapshot");
  if (!state.run_id) return skip("skipped: missing run_id");
  if (!state.user_id) return skip("skipped: missing user_id");

  const report = assembleHermesReport({
    intent: state.intent,
    snapshot: state.snapshot,
    bullets: state.bullets,
    runId: state.run_id,
    ownerUserId: state.user_id,
  });

  const saved = await upsertReport(report, state.user_id);

  const deck: Deck = {
    pptx_path: null,
    slides: report.sections.map((s, idx) => ({
      index: idx,
      layout: s.id,
      title: s.id,
    })),
    report_id: saved.id,
  };

  return {
    deck,
    history: [
      {
        node: "atelier",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: `wrote report ${saved.id} (${report.sections.length} sections, ${state.bullets.length} bullets)`,
      },
    ],
  };
}
