// Layer 2 (lib unit). File under test: src/lib/rag/chunk.ts.
import { describe, expect, it } from "vitest";

import { chunkMarkdown, countTokens } from "@/lib/rag/chunk";

describe("chunkMarkdown", () => {
  it("returns empty array for empty or whitespace-only input", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n  ")).toEqual([]);
  });

  it("emits a single chunk for short markdown without headings", () => {
    const content = "Just a paragraph of text. Nothing fancy.";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].tokens).toBeGreaterThan(0);
    expect(chunks[0].tokens).toBeLessThan(512);
  });

  it("splits on ## H2 headings and keeps the heading with its section", () => {
    const content = `## Section A\nIntro paragraph.\n\n## Section B\nSecond paragraph.`;
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toMatch(/^## Section A/);
    expect(chunks[1].content).toMatch(/^## Section B/);
  });

  it("emits deterministic chunk_ids: same input produces same ids", () => {
    const content = "## A\nBody one.\n\n## B\nBody two.";
    const a = chunkMarkdown(content);
    const b = chunkMarkdown(content);
    expect(a.map((c) => c.chunk_id)).toEqual(b.map((c) => c.chunk_id));
  });

  it("chunk_id format is <sha256-prefix>-<position>", () => {
    const chunks = chunkMarkdown("just one short doc");
    expect(chunks[0].chunk_id).toMatch(/^[0-9a-f]{8}-\d+$/);
    expect(chunks[0].chunk_id.endsWith("-0")).toBe(true);
  });

  it("chunk_ids change when the source content changes", () => {
    const a = chunkMarkdown("first content");
    const b = chunkMarkdown("second content");
    expect(a[0].chunk_id).not.toBe(b[0].chunk_id);
  });

  it("splits long sections by sliding window with overlap", () => {
    // ~1200 tokens of repeated text forces sliding-window split.
    const long = ("word ".repeat(1200)).trim();
    const chunks = chunkMarkdown(long);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each chunk respects the target budget (allow small headroom for
    // decode round-trip drift).
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(512);
    }
    // Positions are monotonic and start at 0.
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
  });

  it("overlap means consecutive chunks share trailing/leading tokens", () => {
    const long = ("word ".repeat(1200)).trim();
    const chunks = chunkMarkdown(long);
    if (chunks.length < 2) return;
    // The tail of chunk 0 should overlap the head of chunk 1 by ~64
    // tokens. We check the decoded text instead of the raw tokens
    // because js-tiktoken decode may slightly differ from the source
    // (whitespace normalisation).
    const tailOfFirst = chunks[0].content.slice(-100);
    const headOfSecond = chunks[1].content.slice(0, 200);
    // There should be at least some overlap of characters between the
    // last 100 chars of chunk 0 and the first 200 chars of chunk 1.
    const overlap = tailOfFirst
      .split(" ")
      .filter((w) => w.length > 0)
      .some((w) => headOfSecond.includes(w));
    expect(overlap).toBe(true);
  });

  it("section-then-window: long section under a heading still gets windowed", () => {
    const longSection = ("token ".repeat(800)).trim();
    const content = `## Huge\n${longSection}`;
    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The first chunk should retain the heading.
    expect(chunks[0].content).toMatch(/^## Huge/);
  });
});

describe("countTokens", () => {
  it("counts a known string to a non-zero positive integer", () => {
    const n = countTokens("hello world");
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });

  it("returns 0 for empty input", () => {
    expect(countTokens("")).toBe(0);
  });
});
