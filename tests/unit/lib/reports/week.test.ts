// Layer 2 (lib unit). File under test: src/lib/reports/week.ts. Priority: P1.
// ISO 8601 week numbers drive the report cover ("Week 18 Review"). Edge
// cases that matter: ISO weeks that wrap a year boundary, the leap-year
// week 53, and the formatWeekRange string used in the report cover.
import { describe, expect, it } from "vitest";

import { formatWeekRange, isoWeek } from "@/lib/reports/week";

const utc = (s: string) => new Date(`${s}T00:00:00Z`);

describe("isoWeek", () => {
  it.each([
    // Mid-year sanity check. April 27, 2026 is a Monday — ISO week 18.
    ["2026-04-27", 18],
    ["2026-05-03", 18], // last day of week 18 (Sunday)
    ["2026-05-04", 19], // first Monday of week 19
    // Calendar boundary anchors.
    ["2024-01-01", 1], // Mon, so it's week 1
    ["2024-12-30", 1], // Mon belongs to week 1 of 2025 (ISO wraps)
    ["2024-12-31", 1], // Tue, still ISO week 1 of 2025
    // 2026 boundary check: Jan 1 2026 is Thursday, week 1.
    ["2026-01-01", 1],
    ["2025-12-29", 1], // Mon -> ISO week 1 of 2026
  ])("for %s returns week %s", (date, expected) => {
    expect(isoWeek(utc(date))).toBe(expected);
  });

  it("handles year-end / year-start consistently across the boundary", () => {
    // The Sunday before week 1 belongs to the prior year's last week.
    // 2025-12-28 is a Sunday, the last day of ISO 2025-W52.
    expect(isoWeek(utc("2025-12-28"))).toBe(52);
    // Next day rolls over to 2026-W1.
    expect(isoWeek(utc("2025-12-29"))).toBe(1);
  });

  it("returns 53 for years that have an ISO week 53", () => {
    // 2020 is one of the rare years with 53 ISO weeks. Dec 28 2020 is a
    // Monday and falls into week 53 of 2020.
    expect(isoWeek(utc("2020-12-28"))).toBe(53);
  });

  it("is timezone-stable: same UTC date gives the same week regardless of local zone", () => {
    // The function reads UTC components only, so a midnight-UTC Date works
    // regardless of the runtime's local zone (which jsdom defaults to the
    // host's). Spot-check by constructing the same date two ways.
    const a = utc("2026-04-27");
    const b = new Date(Date.UTC(2026, 3, 27)); // month is 0-based
    expect(isoWeek(a)).toBe(isoWeek(b));
  });
});

describe("formatWeekRange", () => {
  it('renders "April 27 to May 3, 2026" for a normal week', () => {
    const from = utc("2026-04-27");
    const to = utc("2026-05-03");
    expect(formatWeekRange(from, to)).toBe("April 27 to May 3, 2026");
  });

  it("uses the to-year as the trailing year (handles a week that spans years)", () => {
    // Dec 28, 2026 (Mon) -> Jan 3, 2027 (Sun) crosses the new year.
    const from = utc("2026-12-28");
    const to = utc("2027-01-03");
    expect(formatWeekRange(from, to)).toBe(
      "December 28 to January 3, 2027",
    );
  });

  it("does not pad single-digit days with leading zeros", () => {
    const from = utc("2026-05-04");
    const to = utc("2026-05-10");
    expect(formatWeekRange(from, to)).toBe("May 4 to May 10, 2026");
  });
});
