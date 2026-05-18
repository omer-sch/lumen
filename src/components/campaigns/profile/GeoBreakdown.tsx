"use client";

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { ProfileGeoRow } from "@/types/dashboard";

/**
 * Top countries for this campaign by Sub D7. Cohort-only (no per-country
 * spend join yet — spend tables fan rows on the Country slice differently
 * than No Breakdown). Renders the Top 10 + a "Rest" rollup so the table
 * doesn't grow unbounded.
 */
export function GeoBreakdown({ geo }: { geo: ProfileGeoRow[] }) {
  const { top, rest } = useMemo(() => {
    const sorted = [...geo].sort((a, b) => b.sub_d7 - a.sub_d7);
    const top = sorted.slice(0, 10);
    const restRows = sorted.slice(10);
    if (restRows.length === 0) return { top, rest: null };
    return {
      top,
      rest: restRows.reduce(
        (acc, r) => ({
          sub_d7: acc.sub_d7 + r.sub_d7,
          rev_d7: acc.rev_d7 + r.rev_d7,
        }),
        { sub_d7: 0, rev_d7: 0 },
      ),
    };
  }, [geo]);

  return (
    <GlassCard className="flex flex-col gap-4 p-6" data-testid="profile-geo">
      <div>
        <h3 className="font-display text-md font-bold leading-none text-cloud-white">
          Top countries
        </h3>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Cohort attribution by install country. Spend not yet joined per
          country — sub D7 and D7 revenue read directly from Adjust.
        </p>
      </div>
      {top.length === 0 ? (
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          No country attribution in the active window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="profile-geo-table">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                <th className="px-3 pb-2 pt-1 text-left">Country</th>
                <th className="px-3 pb-2 pt-1 text-right">Sub D7</th>
                <th className="px-3 pb-2 pt-1 text-right">Rev D7</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr
                  key={row.country_code || row.country_name}
                  data-testid={`geo-row-${row.country_code}`}
                  className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-cloud-white">
                    {row.country_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {row.sub_d7.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    ${Math.round(row.rev_d7).toLocaleString()}
                  </td>
                </tr>
              ))}
              {rest && (
                <tr
                  data-testid="geo-row-rest"
                  className="border-t border-[color:var(--border-subtle)]"
                >
                  <td className="whitespace-nowrap px-3 py-3 italic text-[color:var(--text-muted)]">
                    Rest
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {rest.sub_d7.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    ${Math.round(rest.rev_d7).toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
