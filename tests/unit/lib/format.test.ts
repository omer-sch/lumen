// Layer 2 (backend lib unit). File under test: src/lib/format.ts. Priority: P1.
// Every KPI tile, channel row, and report KPI passes through these. Edge
// cases (zero, negative, NaN, Infinity, very large) must render as something
// useful instead of "NaN" or "Infinityx".
import { describe, expect, it } from "vitest";

import { formatKpi } from "@/lib/format";

describe("formatKpi.currency (five magnitude bands)", () => {
  // Band 1: < $100 → two-decimal precision so partial-day spend and
  //   sub-dollar costs read honestly.
  it("< $100: two decimals", () => {
    expect(formatKpi.currency(0)).toBe("$0.00");
    expect(formatKpi.currency(0.42)).toBe("$0.42");
    expect(formatKpi.currency(12.345)).toBe("$12.35");
    expect(formatKpi.currency(99.99)).toBe("$99.99");
  });

  // Band 2: $100 - $999 → no cents, no separators needed.
  it("$100 - $999: integer, no cents", () => {
    expect(formatKpi.currency(100)).toBe("$100");
    expect(formatKpi.currency(344)).toBe("$344");
    expect(formatKpi.currency(999)).toBe("$999");
  });

  // Band 3: $1,000 - $9,999 → comma-separated integer, no abbreviation.
  it("$1k - $9,999: comma integer", () => {
    expect(formatKpi.currency(1_000)).toBe("$1,000");
    expect(formatKpi.currency(1_316)).toBe("$1,316");
    expect(formatKpi.currency(9_999)).toBe("$9,999");
  });

  // Band 4: $10k - $999k → abbreviated, one decimal, trailing zero trimmed.
  it("$10k - $999,999: '$X.Xk' / '$XXXk'", () => {
    expect(formatKpi.currency(10_000)).toBe("$10k");
    expect(formatKpi.currency(14_928.79)).toBe("$14.9k");
    expect(formatKpi.currency(284_920)).toBe("$284.9k");
    expect(formatKpi.currency(296_895)).toBe("$296.9k");
    expect(formatKpi.currency(299_000)).toBe("$299k");
    expect(formatKpi.currency(999_499)).toBe("$999.5k");
  });

  // Band 5: >= $1M → abbreviated, two decimals.
  it(">= $1M: '$X.XXM'", () => {
    expect(formatKpi.currency(1_000_000)).toBe("$1.00M");
    expect(formatKpi.currency(1_316_000)).toBe("$1.32M");
    expect(formatKpi.currency(1_234_567)).toBe("$1.23M");
  });

  it("handles negative values without dropping the sign", () => {
    expect(formatKpi.currency(-12.5)).toBe("-$12.50");
    expect(formatKpi.currency(-1_234)).toBe("-$1,234");
    expect(formatKpi.currency(-14_900)).toBe("-$14.9k");
    expect(formatKpi.currency(-2_500_000)).toBe("-$2.50M");
  });

  it("non-finite inputs render as em-dash placeholder", () => {
    expect(formatKpi.currency(Number.NaN)).toBe("—");
    expect(formatKpi.currency(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formatKpi.money aliases formatKpi.currency", () => {
    expect(formatKpi.money(1_316)).toBe("$1,316");
    expect(formatKpi.money(14_928.79)).toBe("$14.9k");
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
  // cpi shares the currency bands so big CPAs read as "$14.9k" instead
  // of "$14,928.79". Sub-$100 still keeps two decimals.
  it.each([
    [0, "$0.00"],
    [1.49, "$1.49"],
    [1.5, "$1.50"],
    [12.345, "$12.35"],
    [99.99, "$99.99"],
    [344, "$344"],
    [1_316, "$1,316"],
    [14_928.79, "$14.9k"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatKpi.cpi(input)).toBe(expected);
  });
});
