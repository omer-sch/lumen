// Layer 2 (lib unit). File under test: src/lib/bq-coerce.ts. Priority: P1.
// Coercion helper shared between the agent-strategy and multi-source query
// paths. BigQuery's SDK returns plain strings for FORMAT_DATE / STRING
// columns today, but legacy code paths wrap dates in { value: "..." }; the
// helper must accept both shapes and surface anything weird as null.
import { describe, expect, it } from "vitest";

import { toBounds } from "@/lib/bq-coerce";

describe("toBounds", () => {
  it("passes through plain ISO date strings", () => {
    expect(toBounds({ earliest: "2024-01-01", latest: "2026-05-12" })).toEqual({
      earliest: "2024-01-01",
      latest: "2026-05-12",
    });
  });

  it("unwraps the BQ { value: 'YYYY-MM-DD' } object shape", () => {
    expect(
      toBounds({
        earliest: { value: "2024-01-01" },
        latest: { value: "2026-05-12" },
      }),
    ).toEqual({ earliest: "2024-01-01", latest: "2026-05-12" });
  });

  it("returns { earliest: null, latest: null } when the row is undefined", () => {
    expect(toBounds(undefined)).toEqual({ earliest: null, latest: null });
  });

  it("returns nulls when the row is empty", () => {
    expect(toBounds({})).toEqual({ earliest: null, latest: null });
  });

  it("returns null for individual missing columns", () => {
    expect(toBounds({ earliest: "2024-01-01" })).toEqual({
      earliest: "2024-01-01",
      latest: null,
    });
    expect(toBounds({ latest: "2026-05-12" })).toEqual({
      earliest: null,
      latest: "2026-05-12",
    });
  });

  it("coerces explicit null/undefined column values to null", () => {
    expect(toBounds({ earliest: null, latest: null })).toEqual({
      earliest: null,
      latest: null,
    });
    expect(toBounds({ earliest: undefined, latest: undefined })).toEqual({
      earliest: null,
      latest: null,
    });
  });

  it("returns null for wrong-shape values (number, boolean, etc)", () => {
    expect(toBounds({ earliest: 123, latest: true })).toEqual({
      earliest: null,
      latest: null,
    });
  });

  it("returns null when { value: ... } wraps a non-string", () => {
    expect(
      toBounds({
        earliest: { value: 123 },
        latest: { value: null },
      }),
    ).toEqual({ earliest: null, latest: null });
  });

  it("handles mixed shapes in one row", () => {
    expect(
      toBounds({
        earliest: "2024-01-01",
        latest: { value: "2026-05-12" },
      }),
    ).toEqual({ earliest: "2024-01-01", latest: "2026-05-12" });
  });

  it("returns empty string as-is (caller decides what's valid)", () => {
    // The coerce contract is shape-correctness, not value validation. An
    // empty string is a string so it passes through.
    expect(toBounds({ earliest: "", latest: "" })).toEqual({
      earliest: "",
      latest: "",
    });
  });
});
