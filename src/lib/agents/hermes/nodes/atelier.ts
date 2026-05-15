// STUB(phase-2): replaced in Phase 6.
import "server-only";

import type { Deck, HermesState, HermesStateUpdate } from "../state";

// Phase 2 stub. Phase 6 replaces with: Sonnet layout decision -> typed
// SlideManifest -> deterministic call into src/lib/reports/export-pptx.ts
// using the existing slide-layout fix. Writes the .pptx under
// /tmp/hermes-runs/<run_id>.pptx and returns the file URL.

export async function atelier(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();

  const deck: Deck = {
    pptx_path: null,
    slides: [
      { index: 0, layout: "cover", title: "Hermes draft (stub)" },
      { index: 1, layout: "platform_overall", title: "Platform overall" },
      { index: 2, layout: "channel_weekly", title: "Channel weekly" },
      { index: 3, layout: "closing", title: "Closing" },
    ],
  };

  return {
    deck,
    history: [
      {
        node: "atelier",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: `STUB · phase 2 · ${deck.slides.length} slide placeholders, no .pptx written`,
      },
    ],
  };
}
