// Layer 4 (frontend component). File under test:
// src/components/dashboard/lifecycle/DailySubsTable.tsx
//
// Sort behavior: default Date DESC (newest first). Click "New subs"
// header sorts by subs DESC; click again flips to ASC. Multi-OS rows
// for the same date roll up into one row.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DailySubsTable } from "@/components/dashboard/lifecycle/DailySubsTable";

const rows = [
  // Two OS rows on the same date — they must collapse to one table row.
  { date: "2026-05-15", os: "iOS", subs: 100, churn: 10, netSub: 90 },
  { date: "2026-05-15", os: "Android", subs: 50, churn: 5, netSub: 45 },
  { date: "2026-05-16", os: "iOS", subs: 200, churn: 20, netSub: 180 },
  { date: "2026-05-17", os: "iOS", subs: 80, churn: 8, netSub: 72 },
];

function rowOrder() {
  // Read the rendered row data-testids in DOM order. Each row has a
  // test id of `lifecycle-daily-row-${date}` so order = sort outcome.
  const tbody = document.querySelector("tbody")!;
  return [...tbody.querySelectorAll("tr[data-testid^='lifecycle-daily-row-']")]
    .map((tr) => tr.getAttribute("data-testid"))
    .filter(Boolean) as string[];
}

describe("DailySubsTable", () => {
  it("rolls multi-OS rows up to one row per date", () => {
    render(<DailySubsTable daily={rows} />);
    // 3 unique dates → 3 table rows.
    const rowEls = document.querySelectorAll(
      "tbody tr[data-testid^='lifecycle-daily-row-']",
    );
    expect(rowEls.length).toBe(3);
  });

  it("defaults to Date DESC (newest first)", () => {
    render(<DailySubsTable daily={rows} />);
    expect(rowOrder()).toEqual([
      "lifecycle-daily-row-2026-05-17",
      "lifecycle-daily-row-2026-05-16",
      "lifecycle-daily-row-2026-05-15",
    ]);
  });

  it("sorts by New subs DESC on header click, ASC on second click", async () => {
    const user = userEvent.setup();
    render(<DailySubsTable daily={rows} />);

    // Date 05-16 has 200 subs (max), 05-17 has 80, 05-15 has 150 (rolled up).
    // DESC after first click: 200 > 150 > 80 → 16, 15, 17.
    await user.click(screen.getByTestId("lifecycle-daily-sort-subs"));
    expect(rowOrder()).toEqual([
      "lifecycle-daily-row-2026-05-16",
      "lifecycle-daily-row-2026-05-15",
      "lifecycle-daily-row-2026-05-17",
    ]);

    // ASC on second click: 80 < 150 < 200 → 17, 15, 16.
    await user.click(screen.getByTestId("lifecycle-daily-sort-subs"));
    expect(rowOrder()).toEqual([
      "lifecycle-daily-row-2026-05-17",
      "lifecycle-daily-row-2026-05-15",
      "lifecycle-daily-row-2026-05-16",
    ]);
  });

  it("renders an empty hint when daily is empty", () => {
    render(<DailySubsTable daily={[]} />);
    expect(screen.getByTestId("lifecycle-daily-table")).toBeInTheDocument();
    expect(
      screen.getByText(/No daily detail for this window/i),
    ).toBeInTheDocument();
  });

  it("truncates rows past the 31-day visible cap", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}-${i}`,
      os: "iOS",
      subs: i,
      churn: 0,
      netSub: i,
    }));
    // Use unique date strings so the rollup keeps all 45 rows.
    render(<DailySubsTable daily={many} />);
    const rowEls = document.querySelectorAll(
      "tbody tr[data-testid^='lifecycle-daily-row-']",
    );
    expect(rowEls.length).toBe(31);
    expect(screen.getByTestId("lifecycle-daily-truncated")).toBeInTheDocument();
  });

  it("formats Net Sub with sign and tone classes", () => {
    render(
      <DailySubsTable
        daily={[
          { date: "2026-05-15", os: "iOS", subs: 100, churn: 10, netSub: 90 },
          { date: "2026-05-16", os: "iOS", subs: 20, churn: 50, netSub: -30 },
        ]}
      />,
    );
    const positive = within(
      screen.getByTestId("lifecycle-daily-row-2026-05-15"),
    );
    expect(positive.getByText(/^\+90$/)).toBeInTheDocument();

    const negative = within(
      screen.getByTestId("lifecycle-daily-row-2026-05-16"),
    );
    expect(negative.getByText(/^-30$/)).toBeInTheDocument();
  });
});
