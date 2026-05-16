// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/smart-reports/citation-validator.ts.

import { describe, expect, it } from "vitest";

import {
  extractCitations,
  summarizeCitationCoverage,
  validateCitations,
} from "@/lib/smart-reports/citation-validator";
import type {
  ProseBlock,
  ProseCitation,
} from "@/lib/smart-reports/types";
import type { ReadyData } from "@/lib/analyst/types";

function readyData(over: Partial<ReadyData> = {}): ReadyData {
  return {
    intent: {
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: {
        label: "last 7 days",
        iso_start: "2026-05-01",
        iso_end: "2026-05-07",
      },
      focus: null,
      confidence: 1,
      doubts: [],
    },
    clientLabel: "GlobalComix",
    period: {
      label: "last 7 days",
      isoStart: "2026-05-01",
      isoEnd: "2026-05-07",
    },
    networks: [],
    campaigns: [],
    trend: [],
    history: { networks: [] },
    anomalies: [],
    rankings: {
      topCampaignsBySpend: { rows: [], requestedN: 5, actualN: 0, partial: true },
    },
    comparisons: { cpaD7PoP: [] },
    knowledgeChunks: [],
    provenance: {
      queryIds: ["network-breakdown", "campaigns", "trend"],
      cacheKey: "lumen:cache:v1:globalcomix:analyst-ready-data:abcd",
      fetchedAt: "2026-05-16T12:00:00.000Z",
      bqCacheAgeSeconds: 100,
    },
    ...over,
  };
}

describe("extractCitations", () => {
  it("pulls [cite:queryId] tokens out of prose and returns clean text", () => {
    const { text, citations } = extractCitations(
      "Costs increased 30% week over week. [cite:network-breakdown]",
    );
    expect(text).toBe("Costs increased 30% week over week.");
    expect(citations).toEqual([{ queryId: "network-breakdown" }]);
  });

  it("handles multiple citations and preserves order", () => {
    const { text, citations } = extractCitations(
      "Spend rose [cite:network-breakdown], driven by Meta [cite:campaigns].",
    );
    expect(text).toBe("Spend rose, driven by Meta.");
    expect(citations.map((c) => c.queryId)).toEqual([
      "network-breakdown",
      "campaigns",
    ]);
  });

  it("supports an optional excerpt after the queryId", () => {
    const { citations } = extractCitations(
      "Costs rose. [cite:campaigns:WW-Top]",
    );
    expect(citations[0]).toEqual({
      queryId: "campaigns",
      excerpt: "WW-Top",
    });
  });

  it("returns empty citations and untouched text when none are present", () => {
    const r = extractCitations("Plain prose.");
    expect(r.text).toBe("Plain prose.");
    expect(r.citations).toEqual([]);
  });

  it("lowercases the queryId", () => {
    const { citations } = extractCitations(
      "X [cite:Network-BreakDown]",
    );
    expect(citations[0].queryId).toBe("network-breakdown");
  });
});

describe("validateCitations", () => {
  function block(text: string): ProseBlock {
    return { text, highlights: [] };
  }
  const ready = readyData();

  it("passes when every citation matches a provenance queryId", () => {
    const verdict = validateCitations(
      [block("a"), block("b")],
      ready,
      [
        [{ queryId: "network-breakdown" }],
        [{ queryId: "campaigns" }, { queryId: "trend" }],
      ],
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.citationCount).toBe(3);
    }
  });

  it("fails with the offending block index and queryId when one is unknown", () => {
    const verdict = validateCitations(
      [block("a"), block("b")],
      ready,
      [
        [{ queryId: "network-breakdown" }],
        [{ queryId: "made-up-query" }],
      ],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.offender).toEqual({
        blockIndex: 1,
        queryId: "made-up-query",
      });
      expect(verdict.error).toContain("made-up-query");
    }
  });

  it("passes with zero blocks (empty input is not a failure)", () => {
    const verdict = validateCitations([], ready, []);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.citationCount).toBe(0);
    }
  });

  it("passes when a block has no citations (pure tone paragraphs allowed)", () => {
    const verdict = validateCitations(
      [block("x")],
      ready,
      [[]],
    );
    expect(verdict.ok).toBe(true);
  });
});

describe("summarizeCitationCoverage", () => {
  it("counts cited vs uncited blocks", () => {
    const all: ProseCitation[][] = [
      [{ queryId: "network-breakdown" }],
      [],
      [{ queryId: "campaigns" }],
      [],
    ];
    expect(summarizeCitationCoverage(all)).toEqual({ cited: 2, uncited: 2 });
  });

  it("handles the empty input", () => {
    expect(summarizeCitationCoverage([])).toEqual({ cited: 0, uncited: 0 });
  });
});
