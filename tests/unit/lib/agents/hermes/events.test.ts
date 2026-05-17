// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/hermes/events.ts.

import { describe, expect, it } from "vitest";

import {
  feedCardForEvent,
  labelForEvent,
  serializeEvent,
  historyWeekCount,
  type HermesEvent,
} from "@/lib/agents/hermes/events";
import type { ReadyData, Intent } from "@/lib/analyst/types";

const intent: Intent = {
  client: "globalcomix",
  platforms: ["ios"],
  channels: ["meta"],
  period: { label: "last 7 days", iso_start: "2026-05-09", iso_end: "2026-05-15" },
  focus: null,
  confidence: 0.92,
  doubts: [],
};

describe("labelForEvent", () => {
  it("maps node names to friendly labels", () => {
    expect(
      labelForEvent({
        type: "node_started",
        node: "parse_intent",
        at: "2026-05-17T00:00:00Z",
      }),
    ).toBe("Reading your email");

    expect(
      labelForEvent({
        type: "node_finished",
        node: "atelier",
        notes: "wrote report rpt_xyz",
        at: "2026-05-17T00:00:00Z",
      }),
    ).toBe("Drafting the deck");
  });

  it("returns 'Done' on deck_ready and 'Run failed' on error", () => {
    expect(
      labelForEvent({
        type: "deck_ready",
        reportId: "rpt_xyz",
        at: "2026-05-17T00:00:00Z",
      }),
    ).toBe("Done");
    expect(
      labelForEvent({
        type: "error",
        message: "boom",
        at: "2026-05-17T00:00:00Z",
      }),
    ).toBe("Run failed");
  });
});

describe("feedCardForEvent", () => {
  it("renders a parse_intent card from the intent payload", () => {
    const card = feedCardForEvent({
      type: "node_finished",
      node: "parse_intent",
      notes: "ok",
      at: "now",
      data: { kind: "parse_intent", intent },
    });
    expect(card).toMatch(/globalcomix/);
    expect(card).toMatch(/ios/);
    expect(card).toMatch(/meta/);
    expect(card).toMatch(/Confidence 92%/);
  });

  it("renders an analyze card with anomaly count and history weeks", () => {
    const card = feedCardForEvent({
      type: "node_finished",
      node: "analyze",
      notes: "ok",
      at: "now",
      data: { kind: "analyze", anomalyCount: 9, historyWeeks: 4 },
    });
    expect(card).toMatch(/4 weeks/);
    expect(card).toMatch(/9 anomalies/);
  });

  it("handles zero anomalies gracefully", () => {
    const card = feedCardForEvent({
      type: "node_finished",
      node: "analyze",
      notes: "ok",
      at: "now",
      data: { kind: "analyze", anomalyCount: 0, historyWeeks: 0 },
    });
    expect(card).toMatch(/No anomalies/);
  });

  it("returns null for nodes without a surfaceable signal", () => {
    expect(
      feedCardForEvent({
        type: "node_finished",
        node: "quill",
        notes: "ok",
        at: "now",
      }),
    ).toBeNull();
  });
});

describe("serializeEvent", () => {
  it("emits a single SSE data frame ending in two newlines", () => {
    const frame = serializeEvent({
      type: "run_started",
      runId: "run-1",
      at: "2026-05-17T00:00:00Z",
    } satisfies HermesEvent);
    expect(frame.startsWith("data: ")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
    const parsed = JSON.parse(frame.slice("data: ".length).trim());
    expect(parsed.type).toBe("run_started");
    expect(parsed.runId).toBe("run-1");
  });
});

describe("historyWeekCount", () => {
  it("divides trailing rows by unique-network count", () => {
    const ready = {
      history: {
        networks: [
          { network: "Meta", weekIsoStart: "a" },
          { network: "Meta", weekIsoStart: "b" },
          { network: "Meta", weekIsoStart: "c" },
          { network: "Google", weekIsoStart: "a" },
          { network: "Google", weekIsoStart: "b" },
          { network: "Google", weekIsoStart: "c" },
        ],
      },
    } as unknown as ReadyData;
    expect(historyWeekCount(ready)).toBe(3);
  });

  it("returns 0 for an empty history", () => {
    const ready = { history: { networks: [] } } as unknown as ReadyData;
    expect(historyWeekCount(ready)).toBe(0);
  });
});
