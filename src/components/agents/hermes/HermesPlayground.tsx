"use client";

import { useCallback, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// The Phase 2 playground. Synchronous submit -> wait -> render the
// final state. Phase 8 replaces this with an SSE-streamed progress
// overlay; for v0 we surface the run history breadcrumb at the end
// so a tester can see what happened.

type RunResponse = {
  run_id: string;
  intent: {
    client: string;
    platforms: string[];
    channels: string[];
    period: { label: string; iso_start: string | null; iso_end: string | null };
    focus?: string | null;
    confidence: number;
    doubts: string[];
  } | null;
  // The server returns these but the v0 UI doesn't render them yet.
  // Typed loosely so a server-side shape change shows up as a TS error
  // here instead of silently mis-rendering.
  findings?: unknown[];
  approval?: Record<string, unknown>;
  bullets: Array<{ claim: string; slide_target: string }>;
  deck: {
    pptx_path: string | null;
    slides: Array<{ index: number; layout: string; title: string }>;
  };
  history: Array<{
    node: string;
    started_at: string;
    ended_at: string;
    notes?: string;
  }>;
  latency_ms: number;
};

type Phase = "idle" | "running" | "done" | "error";

const MIN_LEN = 30;
const MAX_LEN = 20_000;

const CANONICAL_FIXTURE = `Hi team,

Could you send over the weekly review for GlobalComix? I'm mostly interested in how iOS is doing on Meta this past week; we saw the dashboards move and want a narrative we can share with the client tomorrow.

Thanks,
Emily`;

export function HermesPlayground(): React.ReactElement {
  const textareaId = useId();
  const traceLiveId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [emailText, setEmailText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RunResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    phase !== "running" &&
    emailText.trim().length >= MIN_LEN &&
    emailText.trim().length <= MAX_LEN;

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      setPhase("running");
      setResult(null);
      setErrorMessage(null);
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
        const data = (await res.json()) as RunResponse;
        setResult(data);
        setPhase("done");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [canSubmit, emailText],
  );

  const handleLoadFixture = useCallback(() => {
    setEmailText(CANONICAL_FIXTURE);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
        aria-busy={phase === "running"}
      >
        <div className="flex items-center justify-between">
          <label
            htmlFor={textareaId}
            className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]"
          >
            Paste client email
          </label>
          <button
            type="button"
            onClick={handleLoadFixture}
            className="rounded-sm font-body text-xs text-[color:var(--text-secondary)] underline-offset-2 hover:underline focus:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]"
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
          placeholder="Hi team, could you send over the weekly review for GlobalComix..."
          className="w-full resize-y rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-4 font-body text-sm text-cloud-white placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--color-ua)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ua)]"
          aria-describedby={`${textareaId}-hint`}
        />
        <p
          id={`${textareaId}-hint`}
          className="font-body text-xs text-[color:var(--text-secondary)]"
        >
          {emailText.trim().length} / {MAX_LEN} characters · minimum {MIN_LEN}.
          Hermes parses intent, then runs Analyze / Quill / Atelier (currently
          stubs in phase 2) and returns the final state.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "rounded-full px-5 py-2 font-display text-sm font-semibold tracking-tight transition-[box-shadow,filter] duration-280 ease-out-quart",
              canSubmit
                ? "bg-[color:var(--color-ua)] text-graphite shadow-[0_8px_28px_color-mix(in_oklab,var(--color-ua)_40%,transparent)] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ua)] focus:ring-offset-2 focus:ring-offset-[color:var(--surface-base)]"
                : "cursor-not-allowed bg-[color:var(--surface-icon-bg)] text-[color:var(--text-muted)]",
            )}
          >
            {phase === "running" ? "Drafting…" : "Draft report"}
          </button>
          {phase === "running" && (
            <span
              role="status"
              aria-live="polite"
              className="font-body text-xs text-[color:var(--text-secondary)]"
            >
              Hermes is running the graph. Hold on.
            </span>
          )}
        </div>
      </form>

      {phase === "error" && errorMessage && (
        <div
          role="alert"
          className="rounded-2xl border border-[color:var(--color-coral)] bg-[color:var(--surface-card)] p-4 font-body text-sm text-cloud-white"
        >
          <div className="font-display text-base font-semibold">Run failed</div>
          <p className="mt-1 text-[color:var(--text-secondary)]">
            {errorMessage}
          </p>
        </div>
      )}

      <section
        id={traceLiveId}
        aria-live="polite"
        aria-atomic="false"
        className="flex flex-col gap-6"
      >
        {result && (
          <>
            <RunSummary result={result} />
            <NodeTrace history={result.history} />
            {result.intent && <IntentPanel intent={result.intent} />}
            <DeckPanel deck={result.deck} bullets={result.bullets} />
          </>
        )}
      </section>
    </div>
  );
}

function RunSummary({ result }: { result: RunResponse }): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Run ID" value={result.run_id.slice(0, 8)} mono />
      <Stat label="Latency" value={`${(result.latency_ms / 1000).toFixed(1)}s`} mono />
      <Stat
        label="Confidence"
        value={
          result.intent ? `${(result.intent.confidence * 100).toFixed(0)}%` : "—"
        }
        mono
      />
      <Stat label="Bullets" value={String(result.bullets.length)} mono />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-3">
      <div className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-lg font-semibold text-cloud-white",
          mono && "tabular-nums",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NodeTrace({
  history,
}: {
  history: RunResponse["history"];
}): React.ReactElement {
  return (
    <div>
      <h2 className="mb-2 font-display text-lg font-semibold text-cloud-white">
        Run trace
      </h2>
      <ol className="flex flex-col gap-2">
        {history.map((event, i) => {
          const start = new Date(event.started_at).getTime();
          const end = new Date(event.ended_at).getTime();
          const ms = Math.max(0, end - start);
          return (
            <li
              key={i}
              className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-3"
            >
              <div className="flex flex-col">
                <span className="font-display text-sm font-semibold text-cloud-white">
                  {event.node}
                </span>
                {event.notes && (
                  <span className="font-body text-xs text-[color:var(--text-secondary)]">
                    {event.notes}
                  </span>
                )}
              </div>
              <span className="font-body text-xs tabular-nums text-[color:var(--text-secondary)]">
                {ms}ms
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function IntentPanel({
  intent,
}: {
  intent: NonNullable<RunResponse["intent"]>;
}): React.ReactElement {
  return (
    <div>
      <h2 className="mb-2 font-display text-lg font-semibold text-cloud-white">
        Parsed intent
      </h2>
      <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-body text-sm sm:grid-cols-3">
          <Pair label="Client" value={intent.client} />
          <Pair label="Platforms" value={intent.platforms.join(", ")} />
          <Pair label="Channels" value={intent.channels.join(", ")} />
          <Pair label="Period" value={intent.period.label} />
          {intent.focus && <Pair label="Focus" value={intent.focus} />}
          <Pair
            label="Confidence"
            value={`${(intent.confidence * 100).toFixed(0)}%`}
          />
        </dl>
        {intent.doubts.length > 0 && (
          <div className="mt-3">
            <div className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
              Doubts
            </div>
            <ul className="mt-1 list-inside list-disc text-sm text-[color:var(--text-secondary)]">
              {intent.doubts.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Pair({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-cloud-white">{value}</dd>
    </div>
  );
}

function DeckPanel({
  deck,
  bullets,
}: {
  deck: RunResponse["deck"];
  bullets: RunResponse["bullets"];
}): React.ReactElement {
  const hasFile = Boolean(deck.pptx_path);
  return (
    <div>
      <h2 className="mb-2 font-display text-lg font-semibold text-cloud-white">
        Draft deck
      </h2>
      <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-4">
        {hasFile ? (
          <a
            href={deck.pptx_path ?? "#"}
            className="rounded-sm font-body text-sm text-[color:var(--color-ua)] underline-offset-2 hover:underline focus:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]"
          >
            Download .pptx
          </a>
        ) : (
          <p className="font-body text-xs text-[color:var(--text-secondary)]">
            No .pptx written (Atelier is a stub in phase 2). Slide manifest
            and bullets below.
          </p>
        )}
        <ol className="mt-3 flex flex-col gap-2">
          {deck.slides.map((slide) => {
            const slideBullets = bullets.filter(
              (b) => b.slide_target === slide.layout,
            );
            return (
              <li
                key={slide.index}
                className="rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--surface-base)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-sm font-semibold text-cloud-white">
                    {slide.title}
                  </span>
                  <span className="font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                    {slide.layout}
                  </span>
                </div>
                {slideBullets.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-xs text-[color:var(--text-secondary)]">
                    {slideBullets.map((b, i) => (
                      <li key={i}>{b.claim}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
