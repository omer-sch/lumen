// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/hermes/nodes/atelier.ts. Writes to a real tmp dir so
// we can validate the .pptx survives round-trip; pptxgenjs is the real
// dep (we want to know it built a structurally valid file, not just
// the manifest counts).
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildHermesPptx } from "@/lib/agents/hermes/nodes/atelier";
import type { Bullet } from "@/lib/agents/hermes/state";

function bullet(over: Partial<Bullet> = {}): Bullet {
  return {
    claim: "Meta CPA D7 rose 18%.",
    columns_used: ["cpa_d7"],
    source_query_id: "network_breakdown",
    delta_value: 0.18,
    action_item: null,
    citations: [{ source_path: "vault/x.md", chunk_id: "abc-0" }],
    slide_target: "channel_weekly",
    ...over,
  };
}

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "hermes-atelier-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("buildHermesPptx", () => {
  it("writes a non-empty .pptx file at the expected path", async () => {
    const result = await buildHermesPptx({
      run_id: "run-test-1",
      client: "globalcomix",
      period_label: "last week",
      finding_count: 3,
      bullets: [
        bullet({ slide_target: "platform_overall" }),
        bullet({ slide_target: "channel_weekly" }),
      ],
      outputDir: scratch,
    });
    const expectedPath = path.join(scratch, "run-test-1.pptx");
    expect(result.pptx_path).toBe(expectedPath);
    const s = await stat(expectedPath);
    expect(s.size).toBeGreaterThan(5000);
    // Sanity: .pptx is a zip, magic bytes "PK\x03\x04".
    const head = await readFile(expectedPath);
    expect(head[0]).toBe(0x50); // P
    expect(head[1]).toBe(0x4b); // K
  });

  it("paginates bullets past the per-slide cap into continuation slides", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      bullet({ claim: `Bullet #${i}`, slide_target: "channel_weekly" }),
    );
    const result = await buildHermesPptx({
      run_id: "run-test-2",
      client: "globalcomix",
      period_label: "last week",
      finding_count: 0,
      bullets: many,
      outputDir: scratch,
    });
    // cover + 12/5 = 3 slides for channel_weekly + 0 for other empty
    // targets + closing.
    const channelSlides = result.slides.filter(
      (s) => s.layout === "channel_weekly",
    );
    expect(channelSlides).toHaveLength(3);
    expect(channelSlides[1].title).toMatch(/\(cont\.\)/);
  });

  it("includes cover and closing slides in every output", async () => {
    const result = await buildHermesPptx({
      run_id: "run-test-3",
      client: "globalcomix",
      period_label: "last week",
      finding_count: 1,
      bullets: [bullet({ slide_target: "platform_overall" })],
      outputDir: scratch,
    });
    expect(result.slides[0].layout).toBe("cover");
    expect(result.slides[result.slides.length - 1].layout).toBe("closing");
  });

  it("handles zero bullets gracefully", async () => {
    const result = await buildHermesPptx({
      run_id: "run-test-4",
      client: "globalcomix",
      period_label: "last week",
      finding_count: 0,
      bullets: [],
      outputDir: scratch,
    });
    // cover + one empty page per target (3) + closing.
    expect(result.slides.length).toBeGreaterThanOrEqual(2);
  });
});
