// Layer 2 (frontend lib unit). File under test: src/lib/dashboard/delta-signal.ts.
// Priority: P0. Every KPI tile reads this; a regression mis-colors the
// dashboard's headline signal (cost up shown as mint = wrong).
import { describe, expect, it } from "vitest";

import { deltaSignal } from "@/lib/dashboard/delta-signal";

describe("deltaSignal — business-direction-aware chip routing", () => {
  // 4-quadrant matrix: direction × delta sign. The spec table from the
  // GlobalComix polish prompt is the source of truth.
  it("higher-better + positive delta → good (mint)", () => {
    expect(deltaSignal(4.2, "higher-better")).toBe("good");
    expect(deltaSignal(0.1, "higher-better")).toBe("good");
  });

  it("higher-better + negative delta → bad (coral)", () => {
    expect(deltaSignal(-4.2, "higher-better")).toBe("bad");
    expect(deltaSignal(-0.1, "higher-better")).toBe("bad");
  });

  it("lower-better + positive delta → bad (coral, the 'cost went up' case)", () => {
    expect(deltaSignal(4.2, "lower-better")).toBe("bad");
    expect(deltaSignal(0.1, "lower-better")).toBe("bad");
  });

  it("lower-better + negative delta → good (mint, the 'cost went down' case)", () => {
    expect(deltaSignal(-4.2, "lower-better")).toBe("good");
    expect(deltaSignal(-0.1, "lower-better")).toBe("good");
  });

  // Neutral cases. Zero is "no signal" rather than a tied positive — when
  // nothing changed there's nothing to celebrate or warn about.
  it("zero delta on either direction → neutral", () => {
    expect(deltaSignal(0, "higher-better")).toBe("neutral");
    expect(deltaSignal(0, "lower-better")).toBe("neutral");
    expect(deltaSignal(-0, "higher-better")).toBe("neutral");
  });

  it("null / undefined delta → neutral (no prior baseline)", () => {
    expect(deltaSignal(null, "higher-better")).toBe("neutral");
    expect(deltaSignal(null, "lower-better")).toBe("neutral");
    expect(deltaSignal(undefined, "higher-better")).toBe("neutral");
  });

  it("non-finite delta → neutral (defensive)", () => {
    expect(deltaSignal(Number.NaN, "higher-better")).toBe("neutral");
    expect(deltaSignal(Number.POSITIVE_INFINITY, "lower-better")).toBe(
      "neutral",
    );
  });
});
