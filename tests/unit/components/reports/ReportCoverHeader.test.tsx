// @vitest-environment jsdom
// Layer 4 (component). File under test:
// src/components/reports/ReportCoverHeader.tsx. Pins the byline +
// no-sample-banner contract that the P0 renderer fixes establish.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReportCoverHeader } from "@/components/reports/ReportCoverHeader";
import type { Report } from "@/lib/reports/types";

function makeReport(over: Partial<Report> = {}): Report {
  return {
    id: "rpt_test",
    userId: "u",
    client: "globalcomix",
    createdAt: new Date("2026-05-09T00:00:00Z").getTime(),
    updatedAt: new Date("2026-05-09T00:00:00Z").getTime(),
    prompt: "",
    title: "Weekly review",
    period: "May 3 to May 9, 2026",
    clientLabel: "GlobalComix",
    sections: [],
    ...over,
  };
}

describe("ReportCoverHeader", () => {
  it("never renders the SAMPLE-data banner (component is gone post real-data)", () => {
    render(<ReportCoverHeader report={makeReport()} viewMode="document" />);
    expect(
      screen.queryByText(/sample report|illustrative|not live bigquery/i),
    ).toBeNull();
  });

  it("renders the Hermes byline when source is hermes", () => {
    render(
      <ReportCoverHeader
        report={makeReport({ source: "hermes", authoredBy: "hermes" })}
        viewMode="document"
      />,
    );
    expect(screen.getByText(/Drafted by/i)).toBeInTheDocument();
    expect(screen.getByText(/Hermes/i)).toBeInTheDocument();
  });

  it("omits the byline entirely when source is manual (no AI author in the loop)", () => {
    render(
      <ReportCoverHeader
        report={makeReport({ source: "manual", authoredBy: "nova" })}
        viewMode="document"
      />,
    );
    expect(screen.queryByText(/Drafted by/i)).toBeNull();
    // The agent-byline test id should not appear either.
    expect(
      document.querySelector('[data-testid^="agent-byline-"]'),
    ).toBeNull();
  });
});
