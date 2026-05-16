import "server-only";

import { getReadyData } from "@/lib/analyst";
import { serverEnv } from "@/lib/env.server";
import { upsertReport } from "@/lib/reports/server-store";
import { composeReport } from "@/lib/smart-reports";

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

  // Smart Reports cutover (Phase 1, gated). When USE_SMART_REPORTS=live,
  // atelier delegates to composeReport: the prose-writer reads
  // ReadyData directly and emits a Report with prose blocks; quill's
  // bullet output is ignored. Off / shadow keep the legacy
  // bullets + assembleHermesReport path.
  let report;
  let assembleMode: "legacy" | "smart-reports";
  if (serverEnv.USE_SMART_REPORTS === "live") {
    // Re-fetch ReadyData. In USE_SHARED_ANALYST=live mode this is a
    // cache hit (analyze.ts already called getReadyData in the same
    // run and the analyst-layer cache holds the result for 5 minutes).
    // In shadow / off mode we pay one extra getReadyData but it's
    // still a cache hit at the per-query BQ layer.
    const ready = await getReadyData(state.intent);
    const composed = await composeReport({
      readyData: ready,
      intent: state.intent,
      ownerUserId: state.user_id,
      options: { template: "single-channel-weekly" },
      runId: state.run_id,
      contactName: state.contact?.name ?? null,
    });
    report = composed.report;
    assembleMode = "smart-reports";
  } else {
    report = assembleHermesReport({
      intent: state.intent,
      snapshot: state.snapshot,
      bullets: state.bullets,
      runId: state.run_id,
      ownerUserId: state.user_id,
      contactName: state.contact?.name ?? null,
    });
    assembleMode = "legacy";
  }

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
        notes: `wrote report ${saved.id} via ${assembleMode} (${report.sections.length} sections, ${state.bullets.length} bullets)`,
      },
    ],
  };
}
