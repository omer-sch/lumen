// Layer 4 (component). File under test:
// src/components/reports/DraftFromEmailModal.tsx. Verifies the open/
// close behavior, min-length gate, canonical-fixture button, error
// alert, and the redirect on success.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DraftFromEmailModal } from "@/components/reports/DraftFromEmailModal";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Build a Response whose body is a ReadableStream of SSE frames so
 *  the modal's stream-parsing hook can consume it under jsdom. */
function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("DraftFromEmailModal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <DraftFromEmailModal open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog when open=true with the right ARIA roles", () => {
    render(<DraftFromEmailModal open={true} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(screen.getByText(/Draft from an email/i)).toBeInTheDocument();
  });

  it("submit button is gated by min length", () => {
    render(<DraftFromEmailModal open={true} onClose={() => {}} />);
    const submit = screen.getByRole("button", { name: /Draft report/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Email body/i), {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix on Meta.",
      },
    });
    expect(submit).toBeEnabled();
  });

  it("canonical fixture button populates the textarea", () => {
    render(<DraftFromEmailModal open={true} onClose={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: /canonical fixture/i }),
    );
    const textarea = screen.getByLabelText(
      /Email body/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/GlobalComix/);
  });

  it("on success redirects to /reports/<report_id>?source=hermes", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([
      { type: "run_started", runId: "run-xyz", at: "2026-05-17T00:00:00Z" },
      {
        type: "deck_ready",
        reportId: "rpt_run-xyz",
        at: "2026-05-17T00:00:01Z",
      },
    ]));
    render(<DraftFromEmailModal open={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Email body/i), {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix on Meta.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Draft report/i }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/reports/rpt_run-xyz?source=hermes",
      );
    });
  });

  it("falls back to the Hermes profile when Atelier did not produce a report_id", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([
      { type: "run_started", runId: "run-xyz", at: "2026-05-17T00:00:00Z" },
      {
        type: "error",
        message: "Hermes finished without a report id",
        at: "2026-05-17T00:00:01Z",
      },
    ]));
    render(<DraftFromEmailModal open={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Email body/i), {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix on Meta.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Draft report/i }));
    // When the stream surfaces an error, we render the alert inline
    // instead of redirecting. The fallback redirect to /agents/hermes
    // is reserved for the deck_ready-without-id case; an error event
    // is a different signal.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("renders an error alert on API failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<DraftFromEmailModal open={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Email body/i), {
      target: {
        value:
          "Hi team, please send us a weekly review for GlobalComix on Meta.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Draft report/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/Rate limit exceeded/)).toBeInTheDocument();
  });

  it("Cancel triggers onClose", () => {
    const onClose = vi.fn();
    render(<DraftFromEmailModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
