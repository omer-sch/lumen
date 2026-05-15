// Layer 2 (lib unit). File under test: src/lib/agents/hermes/state.ts.
// We pin the Zod boundary schemas (IntentSchema, GenerateRequestSchema)
// since they're the ones a malformed LLM response or bad request body
// hits.
import { describe, expect, it } from "vitest";

import {
  GenerateRequestSchema,
  IntentSchema,
} from "@/lib/agents/hermes/state";

describe("IntentSchema", () => {
  const valid = {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta", "google"],
    period: {
      label: "last week",
      iso_start: "2026-05-04",
      iso_end: "2026-05-10",
    },
    focus: "iOS CPI drop",
    confidence: 0.92,
    doubts: [],
  };

  it("accepts a well-formed intent", () => {
    expect(() => IntentSchema.parse(valid)).not.toThrow();
  });

  it("requires at least one platform", () => {
    expect(() =>
      IntentSchema.parse({ ...valid, platforms: [] }),
    ).toThrow();
  });

  it("requires at least one channel", () => {
    expect(() =>
      IntentSchema.parse({ ...valid, channels: [] }),
    ).toThrow();
  });

  it("rejects an unknown platform value", () => {
    expect(() =>
      IntentSchema.parse({ ...valid, platforms: ["fire-tv"] }),
    ).toThrow();
  });

  it("rejects an unknown channel value", () => {
    expect(() =>
      IntentSchema.parse({ ...valid, channels: ["snap"] }),
    ).toThrow();
  });

  it("clamps confidence to [0, 1]", () => {
    expect(() =>
      IntentSchema.parse({ ...valid, confidence: 1.5 }),
    ).toThrow();
    expect(() =>
      IntentSchema.parse({ ...valid, confidence: -0.1 }),
    ).toThrow();
  });

  it("defaults doubts to empty array", () => {
    const { doubts, ...without } = valid;
    void doubts;
    const parsed = IntentSchema.parse(without);
    expect(parsed.doubts).toEqual([]);
  });

  it("allows null focus", () => {
    expect(() =>
      IntentSchema.parse({ ...valid, focus: null }),
    ).not.toThrow();
  });
});

describe("GenerateRequestSchema", () => {
  it("requires email_text >= 30 chars (avoid pasting test strings)", () => {
    expect(() =>
      GenerateRequestSchema.parse({ email_text: "too short" }),
    ).toThrow();
  });

  it("rejects email_text > 20k chars (sanity bound)", () => {
    expect(() =>
      GenerateRequestSchema.parse({
        email_text: "x".repeat(20_001),
      }),
    ).toThrow();
  });

  it("accepts a normal-length email", () => {
    const ok = GenerateRequestSchema.parse({
      email_text: "Hi team, please send me a weekly review for GlobalComix.",
    });
    expect(ok.email_text).toMatch(/GlobalComix/);
  });
});
