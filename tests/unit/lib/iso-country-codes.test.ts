// Layer 2 (lib unit). File under test: src/lib/iso-country-codes.ts.
// Static mapping between cohort full names and spend-side ISO-2 codes.

import { describe, expect, it } from "vitest";

import {
  ALL_ISO_COUNTRIES,
  isoCodeFromName,
  isoNameFromCode,
} from "@/lib/iso-country-codes";

describe("isoCodeFromName", () => {
  it("resolves common GlobalComix markets to their ISO-2 codes", () => {
    expect(isoCodeFromName("United States")).toBe("US");
    expect(isoCodeFromName("United Kingdom")).toBe("GB");
    expect(isoCodeFromName("Germany")).toBe("DE");
    expect(isoCodeFromName("Brazil")).toBe("BR");
    expect(isoCodeFromName("Japan")).toBe("JP");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(isoCodeFromName("  France  ")).toBe("FR");
  });

  it("returns null for unknown country names", () => {
    expect(isoCodeFromName("Atlantis")).toBeNull();
    expect(isoCodeFromName("")).toBeNull();
  });
});

describe("isoNameFromCode", () => {
  it("resolves ISO-2 codes to canonical names", () => {
    expect(isoNameFromCode("US")).toBe("United States");
    expect(isoNameFromCode("GB")).toBe("United Kingdom");
  });

  it("normalizes casing on the input code", () => {
    expect(isoNameFromCode("us")).toBe("United States");
    expect(isoNameFromCode(" Br ")).toBe("Brazil");
  });
});

describe("ALL_ISO_COUNTRIES", () => {
  it("has no duplicate codes or names", () => {
    const codes = ALL_ISO_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    const names = ALL_ISO_COUNTRIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses uppercase ISO-2 codes throughout", () => {
    for (const c of ALL_ISO_COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
    }
  });
});
