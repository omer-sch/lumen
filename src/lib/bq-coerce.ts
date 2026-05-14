import "server-only";

import type { DataBounds } from "@/types/dashboard";

/**
 * Coerce a BQ row's `{earliest, latest}` columns to plain string|null.
 * BigQuery's STRING columns come back as `string`; `FORMAT_DATE` results
 * also come back as `string`. Kept defensive in case the SDK changes
 * shape (legacy paths used to wrap dates in `{ value: "..." }`).
 *
 * Lives in its own module so both the generic agent-strategy queries in
 * `bq-queries.ts` and the multi-source `globalcomix-queries.ts` can share
 * it without setting up a circular import.
 */
export function toBounds(r: Record<string, unknown> | undefined): DataBounds {
  const coerce = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v && "value" in v) {
      const val = (v as { value: unknown }).value;
      return typeof val === "string" ? val : null;
    }
    return null;
  };
  return {
    earliest: coerce(r?.earliest),
    latest: coerce(r?.latest),
  };
}
