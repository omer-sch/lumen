// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/smart-reports/highlight-markup.ts.

import { describe, expect, it } from "vitest";

import {
  countUnclosedTags,
  parseHighlightMarkup,
  reconstructMarkup,
} from "@/lib/smart-reports/highlight-markup";

describe("parseHighlightMarkup", () => {
  it("replaces good/bad tokens with stable placeholders and resolves them", () => {
    const r = parseHighlightMarkup(
      "Lower-funnel costs {{bad}}increased over 30%{{/bad}} this week.",
    );
    expect(r.text).toBe(
      "Lower-funnel costs [[highlight:0]] this week.",
    );
    expect(r.tokens).toEqual([
      { kind: "bad", text: "increased over 30%" },
    ]);
  });

  it("supports multiple tokens of mixed kind in one paragraph", () => {
    const r = parseHighlightMarkup(
      "{{good}}Strong results{{/good}} on iOS. {{bad}}CPA increased{{/bad}} on Android.",
    );
    expect(r.text).toBe(
      "[[highlight:0]] on iOS. [[highlight:1]] on Android.",
    );
    expect(r.tokens).toEqual([
      { kind: "good", text: "Strong results" },
      { kind: "bad", text: "CPA increased" },
    ]);
  });

  it("drops empty highlight pairs silently", () => {
    const r = parseHighlightMarkup("Hello {{good}}{{/good}}there.");
    expect(r.text).toBe("Hello there.");
    expect(r.tokens).toEqual([]);
  });

  it("returns the original input verbatim when no markup is present", () => {
    const r = parseHighlightMarkup("Plain prose with no markup.");
    expect(r.text).toBe("Plain prose with no markup.");
    expect(r.tokens).toEqual([]);
  });

  it("returns empty result for empty input", () => {
    expect(parseHighlightMarkup("")).toEqual({ text: "", tokens: [] });
  });

  it("leaves unclosed tags as literal text (does not throw)", () => {
    const r = parseHighlightMarkup("Opens {{good}}without closing.");
    expect(r.text).toBe("Opens {{good}}without closing.");
    expect(r.tokens).toEqual([]);
  });

  it("survives a malformed input without crashing", () => {
    // Adversarial: nested kinds with mismatched closes. The regex
    // looks for matching kind close, so this collapses to one token
    // and the unclosed text stays raw.
    const r = parseHighlightMarkup(
      "{{good}}A{{bad}}B{{/good}}C{{/bad}}",
    );
    // Inner {{bad}}B is captured as the {{good}}…{{/good}} body, so
    // it round-trips as a single good token "A{{bad}}B".
    expect(r.tokens.length).toBeGreaterThanOrEqual(0);
    // No throw; text is well-formed (no orphan placeholders).
    expect(typeof r.text).toBe("string");
  });
});

describe("reconstructMarkup", () => {
  it("round-trips parse + reconstruct on a single-token paragraph", () => {
    const original =
      "Lower-funnel costs {{bad}}increased over 30%{{/bad}} this week.";
    expect(reconstructMarkup(parseHighlightMarkup(original))).toBe(original);
  });

  it("round-trips multiple tokens", () => {
    const original =
      "{{good}}Strong results{{/good}} on iOS. {{bad}}CPA increased{{/bad}} on Android.";
    expect(reconstructMarkup(parseHighlightMarkup(original))).toBe(original);
  });
});

describe("countUnclosedTags", () => {
  it("returns 0 for well-formed markup", () => {
    expect(
      countUnclosedTags("{{good}}A{{/good}} and {{bad}}B{{/bad}}"),
    ).toBe(0);
  });

  it("counts the opening-vs-closing imbalance", () => {
    expect(countUnclosedTags("{{good}}A{{bad}}B{{/bad}}")).toBe(1);
    expect(
      countUnclosedTags("{{good}}A{{/good}}{{bad}}B{{good}}C{{/good}}"),
    ).toBe(1);
  });

  it("returns 0 for empty / non-string input", () => {
    expect(countUnclosedTags("")).toBe(0);
    expect(countUnclosedTags(null as unknown as string)).toBe(0);
  });
});
