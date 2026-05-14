// Layer 2 (backend lib unit). File under test: src/lib/format.ts. Priority: P1.
// Every KPI tile, channel row, and report KPI passes through these. Edge
// cases (zero, negative, NaN, Infinity, very large) must render as something
// useful instead of "NaN" or "Infinityx".
import { describe, expect, it } from "vitest";

import { formatKpi } from "@/lib/format";

describe("formatKpi.money", () => {
  it.each([
    // Sub-$1k falls back to two-decimal dollars so partial-day spend reads
    // as "$42.10" rather than rounding to "$0k". Anything ≥ $1k switches
    // to compact "$XXXk", anything ≥ $1M switches to compact "$X.XM".
    [0, "$0.00"],
    [1, "$1.00"],
    [12.345, "$12.35"],
    [999, "$999.00"],
    [1_000, "$1k"],
    [1_500, "$2k"],
    [284_920, "$285k"],
    [296_895, "$297k"], // GlobalComix 30d spend anchor — must read as $297k
    [999_499, "$999k"],
    [1_000_000, "$1M"],
    [1_234_567, "$1.2M"],
    [1_234_567_890, "$1234.6M"], // out-of-band but should not crash
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.money(input)).toBe(expected);
  });

  it("rounds halves at the k boundary", () => {
    expect(formatKpi.money(1_500)).toBe("$2k"); // round-half to even
    expect(formatKpi.money(1_499)).toBe("$1k");
  });

  it("trims trailing .0 from flat millions", () => {
    expect(formatKpi.money(2_000_000)).toBe("$2M");
  });

  it("handles negative values without dropping the sign", () => {
    expect(formatKpi.money(-1234)).toBe("-$1k");
    expect(formatKpi.money(-2_500_000)).toBe("-$2.5M");
  });
});

describe("formatKpi.count", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
    [1_000, "1k"],
    [12_345, "12k"],
    [199_475, "199k"], // GlobalComix 30d installs anchor — must read as 199k
    [999_499, "999k"],
    [1_000_000, "1M"],
    [1_234_567, "1.2M"],
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
    [0.298, "0.30x"], // GlobalComix 30d ROAS D7 anchor
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
    [1.49, "$1.49"], // GlobalComix 30d CPI anchor
    [1.5, "$1.50"],
    [12.345, "$12.35"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.cpi(input)).toBe(expected);
  });
});
