"use client";

import {
  CoverageWarningCard,
  type CoverageStatus,
} from "@/components/dashboard/attribution/CoverageWarningCard";

export type CoverageWarning = {
  title: string;
  status: CoverageStatus;
  impact: string;
  lastUpdated?: string;
};

type Props = {
  warnings?: CoverageWarning[];
};

/**
 * Default three-warning roster — the open BQ-investigation questions
 * we know about today. Static for now; a future iteration can drive
 * this from a /api/bq coverage manifest once the data team formalizes
 * one. Passing a custom `warnings` prop overrides the defaults (used
 * by tests).
 */
const DEFAULT_WARNINGS: CoverageWarning[] = [
  {
    title: "SKAdNetwork ingestion",
    status: "Stale",
    impact:
      "iOS attribution validation is incomplete. Adjust is still the headline source.",
    lastUpdated: "Stale since 2025-08-04",
  },
  {
    title: "Pubmint spend",
    status: "Missing",
    impact:
      "Pubmint cohort attribution exists in BQ but matching spend doesn't. Subs fall to the NULL bucket.",
  },
  {
    title: "event_date semantics",
    status: "Unverified",
    impact:
      "Sub event dates filtered to ≤ today as a safety. Confirming end-of-day vs UTC boundary with BI.",
  },
];

/**
 * Row of coverage warning cards — one per open data-source caveat.
 * Equal thirds on md+, stacked on sm. Surfaces every reason the
 * Attribution numbers above might be partial so the analyst sees the
 * caveats before reading the data.
 */
export function CoverageWarningsRow({ warnings = DEFAULT_WARNINGS }: Props) {
  if (warnings.length === 0) return null;

  return (
    <section
      className="grid grid-cols-1 gap-6 md:grid-cols-3"
      data-testid="attribution-coverage-warnings"
      aria-label="Coverage warnings"
    >
      {warnings.map((w, i) => (
        <CoverageWarningCard
          key={w.title}
          title={w.title}
          status={w.status}
          impact={w.impact}
          lastUpdated={w.lastUpdated}
          enterIndex={i + 1}
        />
      ))}
    </section>
  );
}
