// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/mock/clients.ts.
// The Reports builder gates on hasRealData so we never produce a
// fixture-only deck and label it real.

import { describe, expect, it } from "vitest";

import {
  CLIENTS,
  clientHasReportData,
  clientsWithReportData,
} from "@/lib/mock/clients";

describe("clientHasReportData / clientsWithReportData", () => {
  it("returns true only for clients with a per-client BQ query module today (globalcomix)", () => {
    expect(clientHasReportData("globalcomix")).toBe(true);
    expect(clientHasReportData("playw3")).toBe(false);
    expect(clientHasReportData("100play")).toBe(false);
  });

  it("returns false for unknown slugs (no fixture fallback)", () => {
    expect(clientHasReportData("no-such-client")).toBe(false);
  });

  it("clientsWithReportData filters the picker to real-data clients only", () => {
    const picker = clientsWithReportData();
    expect(picker.map((c) => c.slug)).toEqual(["globalcomix"]);
  });

  it("the underlying CLIENTS constant still carries all three entries (other surfaces depend on it)", () => {
    expect(CLIENTS.map((c) => c.slug).sort()).toEqual([
      "100play",
      "globalcomix",
      "playw3",
    ]);
  });
});
