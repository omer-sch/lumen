/**
 * ISO 8601 week number. Week 1 is the week containing the first Thursday
 * of the year, which is also the week that has January 4th. The result
 * matches what yellowHEAD analysts use on their report covers
 * ("Week 18 Review"), and lines up with `date-fns/getISOWeek` without
 * pulling the dependency.
 */
export function isoWeek(d: Date): number {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Formats a date range like "April 27 to May 3, 2026". */
export function formatWeekRange(from: Date, to: Date): string {
  const fmtMonthDay = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  const year = to.getUTCFullYear();
  return `${fmtMonthDay(from)} to ${fmtMonthDay(to)}, ${year}`;
}
