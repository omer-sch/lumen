import type { Intent, ReadyData } from "@/lib/analyst/types";

// Server-Sent Events vocabulary for the Hermes run lifecycle. The
// stream route writes one frame per HermesEvent; the modal UI reads
// them in order. Node-level granularity today; per-writer events are
// a future extension (see WS2 "Option B" in the spec).
//
// `at` is an ISO-8601 timestamp so the UI can render relative
// "just now" badges and the trace replay can re-order under jitter.

export type HermesNodeName =
  | "parse_intent"
  | "analyze"
  | "quill"
  | "atelier"
  | "review_gate";

export type HermesEvent =
  | { type: "run_started"; runId: string; at: string }
  | { type: "node_started"; node: HermesNodeName; at: string }
  | {
      type: "node_finished";
      node: HermesNodeName;
      notes: string;
      at: string;
      /** Lightweight summary of the node's output, used by the
       *  findings feed to render friendly cards without re-parsing
       *  the raw notes string. Optional and node-shaped. */
      data?: NodeFinishedData;
    }
  | { type: "deck_ready"; reportId: string; at: string }
  | { type: "error"; message: string; at: string };

export type NodeFinishedData =
  | { kind: "parse_intent"; intent: Intent }
  | {
      kind: "analyze";
      anomalyCount: number;
      historyWeeks: number;
    }
  | {
      kind: "atelier";
      reportId: string;
      sections: number;
      proseBlocks: number;
    }
  | { kind: "other" };

// ── User-facing labels for the status tape ────────────────────────────

const NODE_LABELS: Record<HermesNodeName, string> = {
  parse_intent: "Reading your email",
  analyze: "Pulling BigQuery rows and looking for anomalies",
  quill: "Drafting bullets",
  atelier: "Drafting the deck",
  review_gate: "Saving the draft",
};

export function labelForEvent(event: HermesEvent): string | null {
  switch (event.type) {
    case "run_started":
      return "Starting up";
    case "node_started":
    case "node_finished":
      return NODE_LABELS[event.node];
    case "deck_ready":
      return "Done";
    case "error":
      return "Run failed";
  }
}

// ── Card text for the findings feed ───────────────────────────────────

/** Turn a node_finished event into a short human-readable summary
 *  suitable for a feed card. Returns null when the node has no
 *  surfaceable signal (e.g. review_gate). */
export function feedCardForEvent(event: HermesEvent): string | null {
  if (event.type !== "node_finished") return null;
  const data = event.data;
  switch (event.node) {
    case "parse_intent": {
      if (!data || data.kind !== "parse_intent") return null;
      const i = data.intent;
      const platforms = i.platforms.join(" + ");
      const channels = i.channels.join(" + ");
      const confPct = Math.round((i.confidence ?? 0) * 100);
      return `Parsed your email: ${i.client}, ${platforms}, ${channels}, ${i.period.label}. Confidence ${confPct}%.`;
    }
    case "analyze": {
      if (!data || data.kind !== "analyze") return null;
      const weeks = data.historyWeeks > 0
        ? `Pulled ${data.historyWeeks} ${data.historyWeeks === 1 ? "week" : "weeks"} of trailing history`
        : "Pulled the latest BigQuery rows";
      const anomalies =
        data.anomalyCount > 0
          ? `Detected ${data.anomalyCount} ${data.anomalyCount === 1 ? "anomaly" : "anomalies"}`
          : "No anomalies flagged";
      return `${weeks}. ${anomalies}.`;
    }
    case "atelier": {
      if (!data || data.kind !== "atelier") return null;
      return `Drafted the deck (${data.sections} sections, ${data.proseBlocks} prose blocks).`;
    }
    case "quill":
      return null;
    case "review_gate":
      return "Saved the draft. Opening it now.";
  }
}

// ── Server helpers (SSE frame format + node-data builders) ────────────

/** Serialize an event as a single SSE frame including the trailing
 *  blank line. */
export function serializeEvent(event: HermesEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Approximate the trailing-week count from ReadyData.history. The
 *  history rows are one-per-(network, week) so we divide by the
 *  unique-network count when available. */
export function historyWeekCount(ready: ReadyData): number {
  const rows = ready.history?.networks ?? [];
  if (rows.length === 0) return 0;
  const uniqueNetworks = new Set(rows.map((r) => r.network)).size;
  if (uniqueNetworks === 0) return 0;
  return Math.round(rows.length / uniqueNetworks);
}
