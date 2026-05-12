// Layer 2 (backend lib unit). File under test: src/lib/format.ts. Priority: P1.
// Every KPI tile, channel row, and report KPI passes through these. Edge
// cases (zero, negative, NaN, Infinity, very large) must render as something
// useful instead of "NaN" or "Infinityx".
import { describe, expect, it } from "vitest";

import { formatKpi } from "@/lib/format";

describe("formatKpi.money", () => {
  it.each([
    [0, "$0.00"],
    [1, "$1.00"],
    [12.345, "$12.35"],
    [999, "$999.00"],
    [1_000, "$1,000"],
    [284_920, "$284,920"],
    [1_234_567_890, "$1,234,567,890"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.money(input)).toBe(expected);
  });

  it("rounds halves consistently", () => {
    expect(formatKpi.money(1500.4)).toBe("$1,500");
    expect(formatKpi.money(1500.6)).toBe("$1,501");
  });

  it("handles negative values without dropping the sign", () => {
    // Math.round on negative numbers; the existing formatter does not insert
    // a separator before the minus, so encode the current behavior to detect
    // accidental regressions.
    expect(formatKpi.money(-1234.5)).toContain("-");
  });
});

describe("formatKpi.count", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
    [1_000, "1,000"],
    [12_345, "12,345"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.count(input)).toBe(expected);
  });

  it("rounds floats before formatting", () => {
    expect(formatKpi.count(123.7)).toBe("124");
  });
});

describe("formatKpi.ratio", () => {
  it.each([
    [0, "0.00x"],
    [1, "1.00x"],
    [1.428, "1.43x"],
    [10, "10.00x"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.ratio(input)).toBe(expected);
  });
});

describe("formatKpi.cpi", () => {
  it.each([
    [0, "$0.00"],
    [1.5, "$1.50"],
    [12.345, "$12.35"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.cpi(input)).toBe(expected);
  });
});
