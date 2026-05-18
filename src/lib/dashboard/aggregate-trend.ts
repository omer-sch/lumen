import type { BQTrendPoint, BQTrendPointByNetwork } from "@/types/dashboard";

/**
 * Aggregate a daily per-(date, network) trend series into Daily,
 * Weekly (ISO weeks, Monday start), or Monthly buckets. Used by the
 * WS7.A Cadence table.
 *
 * Aggregation rules:
 *   - Additive metrics (spend, installs, clicks, impressions, sub_d7,
 *     sub_start_d7, rev_d7): SUM across the bucket.
 *   - Rate metrics (CPI, CPA D7, ROI D7, CTR, CPM, CPC): RECOMPUTE from
 *     bucket sums. Never average a daily rate — that weights every day
 *     equally regardless of spend volume.
 */

export type Cadence = "daily" | "weekly" | "monthly";

export type AggregatedRow = {
  /** Stable bucket key (ISO date for daily, "YYYY-Www" for weekly,
   *  "YYYY-MM" for monthly). */
  bucket: string;
  /** Human-readable label, e.g. "May 1, 2026" / "Week 18 (27 Apr - 3 May 2026)" /
   *  "May 2026". */
  label: string;
  /** Inclusive date bounds of the bucket. */
  isoStart: string;
  isoEnd: string;
  spend: number;
  installs: number;
  clicks: number;
  impressions: number;
  subStartD7: number;
  subD7: number;
  revD7: number;
  /** Recomputed from sums. */
  cpi: number;
  cpaD7: number;
  roiD7: number;
  ctr: number;
};

type AnyTrendPoint = BQTrendPoint | BQTrendPointByNetwork;

export function aggregateTrend(
  rows: readonly AnyTrendPoint[],
  cadence: Cadence,
): AggregatedRow[] {
  if (rows.length === 0) return [];

  type Acc = {
    spend: number;
    installs: number;
    clicks: number;
    impressions: number;
    subStartD7: number;
    subD7: number;
    revD7: number;
    earliest: string;
    latest: string;
  };

  const buckets = new Map<string, Acc>();
  for (const row of rows) {
    const key = bucketKey(row.date, cadence);
    const acc = buckets.get(key);
    if (acc) {
      acc.spend += row.spend ?? 0;
      acc.installs += row.installs ?? 0;
      acc.clicks += row.clicks ?? 0;
      acc.impressions += row.impressions ?? 0;
      acc.subStartD7 += row.subStartD7 ?? row.subStart ?? 0;
      acc.subD7 += row.subD7 ?? 0;
      acc.revD7 += row.revD7 ?? 0;
      if (row.date < acc.earliest) acc.earliest = row.date;
      if (row.date > acc.latest) acc.latest = row.date;
    } else {
      buckets.set(key, {
        spend: row.spend ?? 0,
        installs: row.installs ?? 0,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        subStartD7: row.subStartD7 ?? row.subStart ?? 0,
        subD7: row.subD7 ?? 0,
        revD7: row.revD7 ?? 0,
        earliest: row.date,
        latest: row.date,
      });
    }
  }

  return [...buckets.entries()]
    .map(([bucket, a]) => ({
      bucket,
      label: bucketLabel(bucket, a.earliest, a.latest, cadence),
      isoStart: a.earliest,
      isoEnd: a.latest,
      spend: a.spend,
      installs: a.installs,
      clicks: a.clicks,
      impressions: a.impressions,
      subStartD7: a.subStartD7,
      subD7: a.subD7,
      revD7: a.revD7,
      cpi: a.installs > 0 ? a.spend / a.installs : 0,
      cpaD7: a.subD7 > 0 ? a.spend / a.subD7 : 0,
      roiD7: a.spend > 0 ? a.revD7 / a.spend : 0,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
    }))
    .sort((x, y) => x.bucket.localeCompare(y.bucket));
}

// ── Bucket-key + label helpers ─────────────────────────────────────────────

function bucketKey(isoDate: string, cadence: Cadence): string {
  if (cadence === "daily") return isoDate;
  if (cadence === "monthly") return isoDate.slice(0, 7); // YYYY-MM
  // Weekly: ISO-8601 week, Monday-start. The label uses the week's
  // Monday-Sunday inclusive range; the key encodes ISO year + week.
  const d = new Date(`${isoDate}T00:00:00Z`);
  const { isoYear, isoWeek } = isoWeekOf(d);
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function bucketLabel(
  key: string,
  isoStart: string,
  isoEnd: string,
  cadence: Cadence,
): string {
  if (cadence === "daily") {
    const d = new Date(`${isoStart}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  if (cadence === "monthly") {
    const d = new Date(`${isoStart}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  }
  // weekly: "Week 18 (27 Apr - 3 May 2026)"
  const [, weekNumber] = key.split("-W");
  const start = new Date(`${isoStart}T00:00:00Z`);
  const end = new Date(`${isoEnd}T00:00:00Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const year = end.getUTCFullYear();
  return `Week ${weekNumber} (${fmt(start)} - ${fmt(end)} ${year})`;
}

/**
 * ISO-8601 week-of-year for a UTC date. Used as both the bucket key
 * and the human label. The algorithm: a year's first week is the one
 * that contains its first Thursday; weeks start on Monday.
 */
export function isoWeekOf(d: Date): { isoYear: number; isoWeek: number } {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  // Shift Sunday (0) to 7 so Monday = 1 ... Sunday = 7.
  const day = date.getUTCDay() || 7;
  // Set the date to the Thursday of the current ISO week.
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek =
    1 + Math.round(((date.getTime() - yearStart.getTime()) / 86_400_000 - 3) / 7);
  return { isoYear, isoWeek };
}
