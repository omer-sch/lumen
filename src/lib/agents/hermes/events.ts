import type { Intent, ReadyData } from "@/lib/analyst/types";
import type { ReportSection } from "@/lib/reports/types";

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

export type HermesSectionType =
  | "platform_overall"
  | "channel_weekly"
  | "channel_campaign"
  | "closer";

export type HermesPlatform = "android" | "ios" | "web";
export type HermesChannel = "meta" | "google" | "tiktok" | "asa";

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
  | {
      type: "writer_started";
      sectionId: string;
      sectionType: HermesSectionType;
      platform: HermesPlatform | null;
      channel: HermesChannel | null;
      at: string;
    }
  | {
      type: "writer_finished";
      sectionId: string;
      sectionType: HermesSectionType;
      platform: HermesPlatform | null;
      channel: HermesChannel | null;
      proseBlocks: number;
      highlights: number;
      at: string;
    }
  | {
      type: "section_ready";
      sectionId: string;
      section: ReportSection;
      at: string;
    }
  | { type: "deck_ready"; reportId: string; at: string }
  | { type: "error"; message: string; at: string };

/** Best-effort emit callback the SSE route hands down to the
 *  template + writers. When undefined, every fire site is a no-op
 *  and the sync API surface stays byte-identical. */
export type HermesEmitter = (event: HermesEvent) => void;

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
    case "writer_started":
    case "writer_finished":
      return writerLabel(event.sectionType, event.platform, event.channel);
    case "section_ready":
      return null;
    case "deck_ready":
      return "Done";
    case "error":
      return "Run failed";
  }
}

function writerLabel(
  sectionType: HermesSectionType,
  platform: HermesPlatform | null,
  channel: HermesChannel | null,
): string {
  const p = platform
    ? platform === "ios"
      ? "iOS"
      : platform[0].toUpperCase() + platform.slice(1)
    : "";
  const c = channel
    ? channel === "asa"
      ? "ASA"
      : channel[0].toUpperCase() + channel.slice(1)
    : "";
  switch (sectionType) {
    case "platform_overall":
      return p ? `Drafting the ${p} overview` : "Drafting the overview";
    case "channel_weekly":
      return `Drafting ${p} ${c} weekly breakdown`.replace(/\s+/g, " ").trim();
    case "channel_campaign":
      return `Drafting ${p} ${c} campaign breakdown`.replace(/\s+/g, " ").trim();
    case "closer":
      return "Wrapping up";
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
