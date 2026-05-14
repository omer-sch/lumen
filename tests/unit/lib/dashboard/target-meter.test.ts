// Layer 2 (frontend lib unit). File under test:
// src/lib/dashboard/target-meter.ts. Priority: P1.
//
// Phase 1 does not set a target on any KPI, but the meter math is wired
// so a future config drop can light it up. These tests pin the threshold
// edges (zero, exact match, overshoot) and the lower-better inversion so
// the meter renders truthfully when it eventually mounts.
import { describe, expect, it } from "vitest";

import { targetMeterFill } from "@/lib/dashboard/target-meter";

describe("targetMeterFill", () => {
  describe("higher-better metrics (default)", () => {
    it("renders 0% fill when current is 0", () => {
      expect(targetMeterFill(0, 1.3)).toBe(0);
    });

    it("renders the linear ratio between 0 and target", () => {
      expect(targetMeterFill(0.5, 1)).toBe(0.5);
      expect(targetMeterFill(0.3, 1.3)).toBeCloseTo(0.230, 2);
    });

    it("renders 100% fill when current equals target", () => {
      expect(targetMeterFill(1.3, 1.3)).toBe(1);
    });

    it("clamps to 100% on overshoot — no >1 fill", () => {
      expect(targetMeterFill(2.5, 1.3)).toBe(1);
      expect(targetMeterFill(99, 1)).toBe(1);
    });
  });

  describe("lower-better metrics (CPA / CPI)", () => {
    it("renders 100% fill when current is at or below target (we beat the budget)", () => {
      expect(targetMeterFill(0.5, 1, "lower-better")).toBe(1);
      expect(targetMeterFill(1, 1, "lower-better")).toBe(1);
    });

    it("renders <100% fill when current is above target", () => {
      // current=2, target=1 → ratio 1/2 = 0.5 fill ("half the way to budget")
      expect(targetMeterFill(2, 1, "lower-better")).toBe(0.5);
      expect(targetMeterFill(4, 1, "lower-better")).toBe(0.25);
    });
  });

  describe("edge cases", () => {
    it("returns 0 when target is 0 or negative", () => {
      expect(targetMeterFill(0.5, 0)).toBe(0);
      expect(targetMeterFill(0.5, -1)).toBe(0);
    });

    it("returns 0 when current is negative", () => {
      expect(targetMeterFill(-0.5, 1)).toBe(0);
    });

    it("returns 0 when either input is NaN / Infinity", () => {
      expect(targetMeterFill(NaN, 1)).toBe(0);
      expect(targetMeterFill(0.5, Infinity)).toBe(0);
    });
  });
});
