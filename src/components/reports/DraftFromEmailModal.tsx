"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

// Paste-to-draft entry point for Hermes. Modal with a single textarea +
// submit. On success, Atelier inserts the draft into the reports table
// and the modal redirects to /reports/<report_id>?source=hermes, which
// renders through the same components a manually-built report uses.
// Falls back to the playground (/agents/hermes?run=<id>) when Atelier
// could not produce a report_id (skipped intent / snapshot / user_id).
//
// Documented deviation: the master plan calls for SSE-streamed run
// trace inside the modal. v0 ships a synchronous request with an
// indeterminate progress indicator that names the current pipeline
// step ("parse_intent, analyze, quill, atelier"). The streaming
// variant lands in a polish phase after the demo.

const MIN_LEN = 30;
const MAX_LEN = 20_000;

const PIPELINE_STEPS = [
  "parse_intent",
  "analyze",
  "quill",
  "atelier",
  "review_gate",
] as const;

const CANONICAL_FIXTURE = `Hi team,

Could you send over the weekly review for GlobalComix? I'm mostly interested in how iOS is doing on Meta this past week; we saw the dashboards move and want a narrative we can share with the client tomorrow.

Thanks,
Emily`;

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DraftFromEmailModal({ open, onClose }: Props): React.ReactElement | null {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const textareaId = useId();

  const [emailText, setEmailText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  // Focus management: when the modal opens, move focus to the textarea.
  // When it closes, restore focus to the trigger (the caller manages
  // that via onClose -> blur restore).
  useEffect(() => {
    if (open) {
      // Defer to next tick so the DOM is ready.
      const id = window.setTimeout(() => textareaRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Cycle the pipeline-step indicator while submitting so the modal
  // doesn't read as frozen. Real SSE streaming lands in a polish phase.
  useEffect(() => {
    if (!submitting) {
      setStepIdx(0);
      return;
    }
    const handle = window.setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, PIPELINE_STEPS.length - 1));
    }, 1800);
    return () => window.clearInterval(handle);
  }, [submitting]);

  const close = useCallback(() => {
    if (submitting) return;
    setEmailText("");
    setError(null);
    onClose();
  }, [submitting, onClose]);

  // Keyboard handling while open: Escape closes, Tab wraps focus
  // inside the dialog so a screen-reader user can't tab past the
  // submit button into elements behind the backdrop (WCAG 2.1.2,
  // 2.4.3). The query selector matches every focusable inside the
  // dialog ref; we use the first/last entries as the wrap points.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const canSubmit =
    !submitting &&
    emailText.trim().length >= MIN_LEN &&
    emailText.trim().length <= MAX_LEN;

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      setStepIdx(0);
      try {
        const res = await fetch("/api/agents/hermes/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email_text: emailText.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          run_id: string;
          report_id: string | null;
        };
        if (data.report_id) {
          // v0.5-A: Hermes drafts land in the canonical Reports surface.
          // The byline + per-section regenerate affordance live there.
          router.push(`/reports/${data.report_id}?source=hermes`);
        } else {
          // Defensive fallback (Atelier skipped or report id missing):
          // land on the Hermes profile so the failed run shows up in
          // Recent Runs and the user can paste again.
          router.push(`/agents/hermes`);
        }
        // Don't reset state here; the route change will unmount us.
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSubmitting(false);
      }
    },
    [canSubmit, emailText, router],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10"
    >
      <button
        type="button"
        aria-label="Close"
        ref={closeButtonRef}
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        className="relative w-full max-w-2xl rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-6 shadow-2xl"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
              Hermes
            </p>
            <h2
              id={titleId}
              className="font-display text-2xl font-extrabold tracking-tight text-cloud-white"
            >
              Draft from an email
            </h2>
            <p
              id={descriptionId}
              className="font-body text-sm text-[color:var(--text-secondary)]"
            >
              Paste the client&apos;s email and Hermes will parse the intent,
              run Analyze / Quill / Atelier, and produce a draft deck. You
              review and approve on the next screen.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-md p-1 text-[color:var(--text-secondary)] hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)]"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor={textareaId}
              className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]"
            >
              Email body
            </label>
            <button
              type="button"
              onClick={() => setEmailText(CANONICAL_FIXTURE)}
              disabled={submitting}
              className="rounded-sm font-body text-xs text-[color:var(--text-secondary)] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]"
            >
              Use canonical fixture
            </button>
          </div>
          <textarea
            id={textareaId}
            ref={textareaRef}
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            rows={10}
            minLength={MIN_LEN}
            maxLength={MAX_LEN}
            disabled={submitting}
            placeholder="Hi team, could you put together a weekly review for…"
            className="w-full resize-y rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-base)] p-4 font-body text-sm text-cloud-white placeholder:text-[color:var(--text-secondary)] focus:border-[color:var(--color-ua)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ua)] disabled:opacity-60"
          />
          <p className="font-body text-xs text-[color:var(--text-secondary)]">
            {emailText.trim().length} / {MAX_LEN} characters · minimum {MIN_LEN}.
          </p>

          {submitting && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--surface-base)] p-3 font-body text-xs text-[color:var(--text-secondary)]"
            >
              Drafting · {PIPELINE_STEPS[stepIdx]}
              <span className="ml-2 text-[color:var(--color-ua)]">
                {PIPELINE_STEPS.slice(0, stepIdx + 1).join(" → ")}
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-[color:var(--color-coral)] bg-[color:var(--surface-base)] p-3 font-body text-sm text-cloud-white"
            >
              <span className="font-display font-semibold">Draft failed</span>:{" "}
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="rounded-full border border-[color:var(--border-glass)] bg-transparent px-4 py-2 font-body text-sm text-cloud-white hover:bg-[color:var(--surface-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "rounded-full px-5 py-2 font-display text-sm font-semibold",
                canSubmit
                  ? "bg-[color:var(--color-ua)] text-graphite shadow-[0_8px_28px_color-mix(in_oklab,var(--color-ua)_40%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]"
                  : "cursor-not-allowed bg-[color:var(--surface-base)] text-[color:var(--text-secondary)]",
              )}
            >
              {submitting ? "Drafting…" : "Draft report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DraftFromEmailButton(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const handleClose = useCallback(() => {
    setOpen(false);
    // Restore focus to the trigger so a keyboard user lands back at
    // the place they came from (WCAG 2.4.3 Focus Order). Defer one
    // tick because the modal unmount happens in the same render.
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-ua)] px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ua)] transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        Draft from email
      </button>
      <DraftFromEmailModal open={open} onClose={handleClose} />
    </>
  );
}
