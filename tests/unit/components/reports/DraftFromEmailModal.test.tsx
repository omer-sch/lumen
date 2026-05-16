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
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ run_id: "run-xyz", report_id: "rpt_run-xyz" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
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
      expect(pushMock).toHaveBeenCalledWith(
        "/reports/rpt_run-xyz?source=hermes",
      );
    });
  });

  it("falls back to the playground when Atelier did not produce a report_id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ run_id: "run-xyz", report_id: null }), {
        status: 200,
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
      expect(pushMock).toHaveBeenCalledWith("/agents/hermes?run=run-xyz");
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
