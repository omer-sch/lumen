// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/knowledge.ts.
// Two states: default (returns []) and "on" (delegates to retrieve()).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

import { lookupKnowledge } from "@/lib/analyst/knowledge";
import type { Intent } from "@/lib/analyst/types";

function intent(over: Partial<Intent> = {}): Intent {
  return {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: { label: "x", iso_start: "2026-05-01", iso_end: "2026-05-07" },
    focus: null,
    confidence: 1,
    doubts: [],
    ...over,
  };
}

beforeEach(() => {
  retrieveMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lookupKnowledge", () => {
  it("returns [] by default (USE_ANALYST_KNOWLEDGE unset)", async () => {
    vi.stubEnv("USE_ANALYST_KNOWLEDGE", "");
    const r = await lookupKnowledge({ intent: intent() });
    expect(r).toEqual([]);
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("returns [] when USE_ANALYST_KNOWLEDGE is 'off'", async () => {
    vi.stubEnv("USE_ANALYST_KNOWLEDGE", "off");
    const r = await lookupKnowledge({ intent: intent() });
    expect(r).toEqual([]);
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("delegates to retrieve() when USE_ANALYST_KNOWLEDGE is 'on'", async () => {
    vi.stubEnv("USE_ANALYST_KNOWLEDGE", "on");
    retrieveMock.mockResolvedValue({
      chunks: [
        {
          chunk_id: "c1",
          source_path: "docs/playbook.md",
          content: "...",
          similarity: 0.9,
          metadata: {},
        },
      ],
      citations: [],
      chunks_returned: 1,
      latency_ms: 5,
      query_embedding_cost_usd: 0,
    });
    const r = await lookupKnowledge({ intent: intent() });
    expect(retrieveMock).toHaveBeenCalledOnce();
    expect(r).toEqual([
      {
        chunk_id: "c1",
        source_path: "docs/playbook.md",
        content: "...",
        similarity: 0.9,
      },
    ]);
  });

  it("swallows retrieve() failures and returns []", async () => {
    vi.stubEnv("USE_ANALYST_KNOWLEDGE", "on");
    retrieveMock.mockRejectedValue(new Error("supabase offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await lookupKnowledge({ intent: intent() });
    expect(r).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
