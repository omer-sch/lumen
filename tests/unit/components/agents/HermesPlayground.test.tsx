// Layer 4 (component). File under test:
// src/components/agents/hermes/HermesPlayground.tsx. Verifies the
// min-length gate, the canonical-fixture button, the success-state
// render, and the error-state render. fetch is mocked at the global
// level since the playground is a thin client around POST
// /api/agents/hermes/generate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HermesPlayground } from "@/components/agents/hermes/HermesPlayground";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const validBody = {
  run_id: "run-abcdef1234",
  intent: {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: { label: "last week", iso_start: "2026-05-04", iso_end: "2026-05-10" },
    focus: null,
    confidence: 0.91,
    doubts: [],
  },
  bullets: [
    { claim: "Placeholder bullet 1", slide_target: "platform_overall" },
  ],
  deck: {
    pptx_path: null,
    slides: [{ index: 0, layout: "cover", title: "Hermes draft (stub)" }],
  },
  history: [
    { node: "parse_intent", started_at: "2026-05-15T10:00:00Z", ended_at: "2026-05-15T10:00:01Z", notes: "confidence=0.91" },
    { node: "analyze", started_at: "2026-05-15T10:00:01Z", ended_at: "2026-05-15T10:00:02Z", notes: "STUB · phase 2" },
  ],
  latency_ms: 1234,
};

describe("HermesPlayground", () => {
  it("disables the submit button until the email is at least 30 characters", async () => {
    render(<HermesPlayground />);
    const button = screen.getByRole("button", { name: /draft report/i });
    expect(button).toBeDisabled();
    const textarea = screen.getByLabelText(/paste client email/i);
    await userEvent.type(textarea, "too short");
    expect(button).toBeDisabled();
    fireEvent.change(textarea, {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix focused on Meta.",
      },
    });
    expect(button).toBeEnabled();
  });

  it('"Use canonical fixture" populates the textarea with a real-looking email', () => {
    render(<HermesPlayground />);
    const fixtureButton = screen.getByRole("button", {
      name: /canonical fixture/i,
    });
    fireEvent.click(fixtureButton);
    const textarea = screen.getByLabelText(
      /paste client email/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/GlobalComix/);
    expect(textarea.value.length).toBeGreaterThanOrEqual(30);
  });

  it("renders the result panels on a successful submit", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(validBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<HermesPlayground />);
    fireEvent.change(screen.getByLabelText(/paste client email/i), {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix focused on Meta.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /draft report/i }));
    await waitFor(() => {
      expect(screen.getByText(/Run trace/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Parsed intent/i)).toBeInTheDocument();
    // "globalcomix" appears in both the textarea content and the intent
    // panel; getAllByText handles both.
    expect(screen.getAllByText(/globalcomix/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/parse_intent/)).toBeInTheDocument();
    expect(screen.getByText(/^analyze$/)).toBeInTheDocument();
    expect(screen.getByText(/Draft deck/i)).toBeInTheDocument();
  });

  it("renders an error alert when the API returns 4xx/5xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<HermesPlayground />);
    fireEvent.change(screen.getByLabelText(/paste client email/i), {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix focused on Meta.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /draft report/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument();
  });
});
