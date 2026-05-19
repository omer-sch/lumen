// Layer 2 (frontend lib unit). Files under test:
//   src/components/campaigns/geo/ChoroplethMap.tsx   (computeBuckets, bucketForValue)
//   src/components/campaigns/geo/GeoCountryTable.tsx (paidPct)
//   src/lib/geo/iso-numeric.ts                       (alpha2FromNumeric)
// Priority: P2.
//
// Pure helpers — exercised in isolation so the visual components can
// trust their inputs without needing a render cycle.

import { describe, expect, it } from "vitest";

import {
  computeBuckets,
  bucketForValue,
} from "@/components/campaigns/geo/ChoroplethMap";
import { paidPct } from "@/components/campaigns/geo/GeoCountryTable";
import { alpha2FromNumeric } from "@/lib/geo/iso-numeric";
import type { GeoRow } from "@/lib/globalcomix-queries";

const mkRow = (overrides: Partial<GeoRow>): GeoRow => ({
  country_code: "XX",
  country_name: "Test",
  spend: 0,
  installs: 0,
  sub_d7: 0,
  rev_d7: 0,
  cpa_d7: 0,
  roi_d7: 0,
  sub_paid: 0,
  sub_organic: 0,
  ...overrides,
});

describe("computeBuckets", () => {
  it("returns all-zero thresholds when no row has non-zero Sub D7", () => {
    const buckets = computeBuckets([mkRow({}), mkRow({})]);
    expect(buckets.thresholds).toEqual([0, 0, 0]);
    expect(buckets.max).toBe(0);
  });

  it("produces three quartile thresholds over the non-zero subset", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80];
    const rows = values.map((v) => mkRow({ sub_d7: v }));
    const buckets = computeBuckets(rows);
    expect(buckets.max).toBe(80);
    // Quartile cutoffs at indices floor(0.25*8)=2, floor(0.5*8)=4, floor(0.75*8)=6
    // → values 30, 50, 70.
    expect(buckets.thresholds).toEqual([30, 50, 70]);
  });

  it("ignores zero-valued rows when computing thresholds", () => {
    const rows = [
      mkRow({ sub_d7: 0 }),
      mkRow({ sub_d7: 0 }),
      mkRow({ sub_d7: 100 }),
    ];
    const buckets = computeBuckets(rows);
    expect(buckets.max).toBe(100);
    expect(buckets.thresholds).toEqual([100, 100, 100]);
  });
});

describe("bucketForValue", () => {
  const buckets = { thresholds: [30, 50, 70] as [number, number, number], max: 80 };

  it("returns 0 for zero / negative / non-finite values", () => {
    expect(bucketForValue(0, buckets)).toBe(0);
    expect(bucketForValue(-5, buckets)).toBe(0);
    expect(bucketForValue(Number.NaN, buckets)).toBe(0);
  });

  it("maps values into the four colored buckets by quartile", () => {
    expect(bucketForValue(10, buckets)).toBe(1);   // below t1
    expect(bucketForValue(30, buckets)).toBe(2);   // at t1 → next bucket
    expect(bucketForValue(50, buckets)).toBe(3);   // at t2
    expect(bucketForValue(70, buckets)).toBe(4);   // at t3 → top bucket
    expect(bucketForValue(1000, buckets)).toBe(4); // far above max
  });
});

describe("paidPct", () => {
  it("returns 0 when sub_d7 is zero (no division-by-zero hazard)", () => {
    expect(paidPct(mkRow({ sub_paid: 5, sub_d7: 0 }))).toBe(0);
  });

  it("computes paid share as a percentage", () => {
    expect(paidPct(mkRow({ sub_paid: 75, sub_d7: 100 }))).toBe(75);
    expect(paidPct(mkRow({ sub_paid: 1, sub_d7: 4 }))).toBe(25);
  });
});

describe("alpha2FromNumeric", () => {
  it("resolves the canonical ISO codes for the big markets", () => {
    expect(alpha2FromNumeric("840")).toBe("US");
    expect(alpha2FromNumeric("826")).toBe("GB");
    expect(alpha2FromNumeric("250")).toBe("FR");
    expect(alpha2FromNumeric("392")).toBe("JP");
  });

  it("zero-pads short numeric inputs", () => {
    expect(alpha2FromNumeric("4")).toBe("AF");
    expect(alpha2FromNumeric(8)).toBe("AL");
  });

  it("returns null for codes that aren't ISO countries (Antarctica, etc.)", () => {
    expect(alpha2FromNumeric("010")).toBeNull();   // Antarctica
    expect(alpha2FromNumeric("999")).toBeNull();   // not assigned
    expect(alpha2FromNumeric(null)).toBeNull();
    expect(alpha2FromNumeric(undefined)).toBeNull();
  });
});
