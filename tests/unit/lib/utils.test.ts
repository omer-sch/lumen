// Layer 2 (lib unit). File under test: src/lib/utils.ts. Priority: P2.
// cn() is the conditional classname helper every component touches. Test the
// tailwind-merge + clsx integration so a regression in either dependency shows
// up here, not in a screenshot diff.
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins string fragments with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values without crashing", () => {
    expect(cn("a", false, undefined, null, "", "b")).toBe("a b");
  });

  it("supports the clsx conditional-object form", () => {
    expect(cn("a", { b: true, c: false, d: true })).toBe("a b d");
  });

  it("flattens nested arrays", () => {
    expect(cn(["a", ["b", "c"]], "d")).toBe("a b c d");
  });

  it("dedupes conflicting tailwind classes (last one wins)", () => {
    // tailwind-merge: px-2 + px-4 -> px-4 (later token resolves).
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("preserves non-conflicting tailwind tokens", () => {
    const out = cn("px-2", "py-4", "text-sm");
    expect(out).toContain("px-2");
    expect(out).toContain("py-4");
    expect(out).toContain("text-sm");
  });

  it("returns an empty string when nothing was passed", () => {
    expect(cn()).toBe("");
    expect(cn(undefined, null, false)).toBe("");
  });

  it("treats numbers as classnames (clsx-compatible)", () => {
    // clsx coerces numbers to their string form; tailwind-merge passes through.
    expect(cn("a", 0, "b")).toBe("a b"); // 0 is falsy, dropped
    expect(cn("a", 1)).toBe("a 1");
  });
});
