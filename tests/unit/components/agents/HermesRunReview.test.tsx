// Layer 4 (component). File under test:
// src/components/agents/hermes/HermesRunReview.tsx. Smoke-level
// rendering plus the approve flow.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  HermesRunReview,
  type HermesRunData,
} from "@/components/agents/hermes/HermesRunReview";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseRun: HermesRunData = {
  run_id: "run-abc12345",
  status: "completed",
  client: "globalcomix",
  startedAt: "2026-05-15T10:00:00Z",
  completedAt: "2026-05-15T10:00:30Z",
  intent: {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: { label: "last week", iso_start: null, iso_end: null },
    focus: null,
    confidence: 0.91,
    doubts: [],
  },
  bullets: [
    {
      claim: "Meta android CPA D7 rose 18%.",
      source_query_id: "network_breakdown",
      delta_value: 0.18,
      action_item: "Tighten Meta android bids",
      citations: [{ source_path: "vault/x.md", chunk_id: "abc-0" }],
      slide_target: "channel_weekly",
    },
  ],
  deck: {
    pptx_path: "/tmp/hermes-runs/run-abc12345.pptx",
    slides: [{ index: 0, layout: "cover", title: "Cover" }],
  },
  approval: { approved: false, approved_by: null, approved_at: null },
  history: [
    {
      node: "parse_intent",
      started_at: "2026-05-15T10:00:00Z",
      ended_at: "2026-05-15T10:00:01Z",
      notes: "confidence=0.91",
    },
  ],
};

describe("HermesRunReview", () => {
  it("renders the run summary + intent + slide panels", () => {
    render(<HermesRunReview run={baseRun} />);
    expect(screen.getByText("Run ID")).toBeInTheDocument();
    expect(screen.getByText(/Draft slides/i)).toBeInTheDocument();
    expect(screen.getByText("Parsed intent")).toBeInTheDocument();
    // Bullet text is rendered.
    expect(screen.getByText(/Meta android CPA D7/)).toBeInTheDocument();
    // Action item is surfaced.
    expect(screen.getByText(/Tighten Meta android bids/)).toBeInTheDocument();
  });

  it("shows the Download .pptx link pointing to the download route", () => {
    render(<HermesRunReview run={baseRun} />);
    const link = screen.getByRole("link", { name: /Download .pptx/i });
    expect(link.getAttribute("href")).toBe(
      "/api/agents/hermes/runs/run-abc12345/download",
    );
  });

  it("approve button posts and updates the UI", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          run_id: "run-abc12345",
          approved: true,
          approved_by: "u1",
          approved_at: "2026-05-15T10:05:00Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    render(<HermesRunReview run={baseRun} />);
    const btn = screen.getByRole("button", { name: /Approve draft/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Approve draft/i })).toBeNull();
    });
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/hermes/runs/run-abc12345/approve",
      { method: "POST" },
    );
  });

  it("renders the error alert on approve failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rls denied" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<HermesRunReview run={baseRun} />);
    fireEvent.click(screen.getByRole("button", { name: /Approve draft/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/rls denied/i)).toBeInTheDocument();
  });

  it("shows the approved badge when the run loads already approved", () => {
    render(
      <HermesRunReview
        run={{
          ...baseRun,
          approval: {
            approved: true,
            approved_by: "u1",
            approved_at: "2026-05-15T10:05:00Z",
          },
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Approve draft/i })).toBeNull();
    // "Approved" appears in both the status stat (lowercase) and the
    // approval-by/at banner (titlecase); use getAllByText.
    expect(screen.getAllByText(/Approved/i).length).toBeGreaterThan(0);
  });
});
