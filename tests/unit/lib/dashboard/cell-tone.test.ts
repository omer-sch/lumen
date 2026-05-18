// Layer 2 (lib unit). File under test: src/lib/dashboard/cell-tone.ts.

import { describe, expect, it } from "vitest";

import {
  cellTone,
  DEFAULT_HIGHER_BETTER_THRESHOLDS,
  DEFAULT_LOWER_BETTER_THRESHOLDS,
} from "@/lib/dashboard/cell-tone";

describe("cellTone (lower-better metric: CPA, CPI)", () => {
  it("returns 'good' when value <= baseline * 0.9", () => {
    expect(cellTone(80, 100, "lower-better")).toBe("good");
    expect(cellTone(90, 100, "lower-better")).toBe("good");
  });

  it("returns 'bad' when value >= baseline * 1.2", () => {
    expect(cellTone(120, 100, "lower-better")).toBe("bad");
    expect(cellTone(150, 100, "lower-better")).toBe("bad");
  });

  it("returns 'warn' on a small unfavorable drift (5% to 20% above)", () => {
    expect(cellTone(110, 100, "lower-better")).toBe("warn");
  });

  it("returns 'neutral' for movements between the favorable and warn thresholds", () => {
    // 0.91 to 1.05 is the unmarked zone.
    expect(cellTone(95, 100, "lower-better")).toBe("neutral");
    expect(cellTone(100, 100, "lower-better")).toBe("neutral");
  });
});

describe("cellTone (higher-better metric: Sub D7, ROI D7)", () => {
  it("returns 'good' when value >= baseline * 1.1", () => {
    expect(cellTone(120, 100, "higher-better")).toBe("good");
    expect(cellTone(110, 100, "higher-better")).toBe("good");
  });

  it("returns 'bad' when value <= baseline * 0.8", () => {
    expect(cellTone(70, 100, "higher-better")).toBe("bad");
  });

  it("returns 'warn' on a small unfavorable drop (5% to 20% below)", () => {
    expect(cellTone(90, 100, "higher-better")).toBe("warn");
  });

  it("returns 'neutral' for movements between the favorable and warn thresholds", () => {
    expect(cellTone(105, 100, "higher-better")).toBe("neutral");
  });
});

describe("cellTone edge cases", () => {
  it("returns 'neutral' when baseline is 0 (no anchor)", () => {
    expect(cellTone(100, 0, "lower-better")).toBe("neutral");
  });

  it("returns 'neutral' when either side is null / NaN", () => {
    expect(cellTone(null, 100, "lower-better")).toBe("neutral");
    expect(cellTone(100, null, "lower-better")).toBe("neutral");
    expect(cellTone(NaN, 100, "lower-better")).toBe("neutral");
  });

  it("accepts custom thresholds (used by experimental views)", () => {
    expect(
      cellTone(150, 100, "lower-better", {
        goodAt: 0.5,
        warnAt: 1.5,
        badAt: 2.0,
      }),
    ).toBe("warn");
  });

  it("default-threshold constants are sane", () => {
    expect(DEFAULT_LOWER_BETTER_THRESHOLDS.goodAt).toBeLessThan(1);
    expect(DEFAULT_LOWER_BETTER_THRESHOLDS.badAt).toBeGreaterThan(1);
    expect(DEFAULT_HIGHER_BETTER_THRESHOLDS.goodAt).toBeGreaterThan(1);
    expect(DEFAULT_HIGHER_BETTER_THRESHOLDS.badAt).toBeLessThan(1);
  });
});
