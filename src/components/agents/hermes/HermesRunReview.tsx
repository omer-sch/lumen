"use client";

import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

// Phase 7 review surface. View the Hermes draft, see the bullets per
// slide, approve, download. Inline edit + section regenerate are
// queued for a polish phase — for v0 the approve flow plus the run
// trace is enough to demonstrate the trust contract.

export type HermesRunData = {
  run_id: string;
  status: "running" | "completed" | "failed" | "scheduled";
  client: string | null;
  startedAt: string;
  completedAt: string | null;
  intent: {
    client: string;
    platforms: string[];
    channels: string[];
    period: { label: string; iso_start: string | null; iso_end: string | null };
    focus?: string | null;
    confidence: number;
    doubts: string[];
  } | null;
  bullets: Array<{
    claim: string;
    source_query_id: string;
    delta_value: number | null;
    action_item: string | null;
    citations: Array<{ source_path: string; chunk_id: string }>;
    slide_target:
      | "platform_overall"
      | "channel_weekly"
      | "campaign_breakdown"
      | "closing";
  }>;
  deck: {
    pptx_path: string | null;
    slides: Array<{ index: number; layout: string; title: string }>;
  };
  approval: {
    approved: boolean;
    approved_by: string | null;
    approved_at: string | null;
  } | null;
  history: Array<{
    node: string;
    started_at: string;
    ended_at: string;
    notes?: string;
  }>;
};

const SLIDE_TITLES = {
  platform_overall: "Platform overall",
  channel_weekly: "Channel weekly",
  campaign_breakdown: "Campaign breakdown",
  closing: "Closing",
} as const;
type SlideTarget = keyof typeof SLIDE_TITLES;

export function HermesRunReview({
  run: initial,
}: {
  run: HermesRunData;
}): React.ReactElement {
  const [run, setRun] = useState<HermesRunData>(initial);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const approved = run.approval?.approved === true;

  const handleApprove = useCallback(async () => {
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(
        `/api/agents/hermes/runs/${run.run_id}/approve`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        approved_by: string;
        approved_at: string;
      };
      setRun((r) => ({
        ...r,
        approval: {
          approved: true,
          approved_by: data.approved_by,
          approved_at: data.approved_at,
        },
      }));
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setApproving(false);
    }
  }, [run.run_id]);

  const bulletsBySlide = (
    Object.keys(SLIDE_TITLES) as SlideTarget[]
  ).map((target) => ({
    target,
    title: SLIDE_TITLES[target],
    bullets: run.bullets.filter((b) => b.slide_target === target),
  }));

  return (
    <div className="flex flex-col gap-8">
      <RunSummary run={run} approved={approved} />

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/agents/hermes/runs/${run.run_id}/download`}
          className="rounded-full bg-[color:var(--color-ua)] px-5 py-2 font-display text-sm font-semibold text-graphite shadow-[0_8px_28px_color-mix(in_oklab,var(--color-ua)_40%,transparent)] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]"
        >
          Download .pptx
        </a>
        {approved ? (
          <span
            role="status"
            className="font-body text-sm text-[color:var(--text-secondary)]"
          >
            Approved
            {run.approval?.approved_at
              ? ` at ${new Date(run.approval.approved_at).toLocaleString()}`
              : ""}
            {run.approval?.approved_by ? ` by ${run.approval.approved_by}` : ""}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className={cn(
              "rounded-full border border-[color:var(--color-ua)] px-5 py-2 font-display text-sm font-semibold text-[color:var(--color-ua)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]",
              approving && "cursor-not-allowed opacity-60",
            )}
          >
            {approving ? "Approving…" : "Approve draft"}
          </button>
        )}
      </div>

      {approveError && (
        <div
          role="alert"
          className="rounded-2xl border border-[color:var(--color-coral)] bg-[color:var(--surface-card)] p-3 font-body text-sm text-cloud-white"
        >
          <span className="font-display text-base font-semibold">
            Approve failed
          </span>
          : {approveError}
        </div>
      )}

      {run.intent && <IntentPanel intent={run.intent} />}

      <section
        aria-label="Draft slides"
        className="flex flex-col gap-4"
      >
        <h2 className="font-display text-lg font-semibold text-cloud-white">
          Draft slides
        </h2>
        {bulletsBySlide.map((slide) => (
          <SlidePanel key={slide.target} {...slide} />
        ))}
      </section>

      <NodeTrace history={run.history} />
    </div>
  );
}

function RunSummary({
  run,
  approved,
}: {
  run: HermesRunData;
  approved: boolean;
}): React.ReactElement {
  const latency =
    run.startedAt && run.completedAt
      ? Math.max(
          0,
          new Date(run.completedAt).getTime() -
            new Date(run.startedAt).getTime(),
        )
      : null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Run ID"
        value={run.run_id.slice(0, 8)}
        mono
      />
      <Stat label="Status" value={approved ? "approved" : run.status} />
      <Stat
        label="Bullets"
        value={String(run.bullets.length)}
        mono
      />
      <Stat
        label="Latency"
        value={latency != null ? `${(latency / 1000).toFixed(1)}s` : "—"}
        mono
      />
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

function IntentPanel({
  intent,
}: {
  intent: NonNullable<HermesRunData["intent"]>;
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

function SlidePanel({
  target,
  title,
  bullets,
}: {
  target: SlideTarget;
  title: string;
  bullets: HermesRunData["bullets"];
}): React.ReactElement {
  return (
    <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--surface-card)] p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-cloud-white">
          {title}
        </span>
        <span className="font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
          {target}
        </span>
      </div>
      {bullets.length === 0 ? (
        <p className="mt-2 font-body text-xs text-[color:var(--text-secondary)]">
          (no bullets routed to this slide)
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--surface-base)] p-3"
            >
              <p className="font-body text-sm text-cloud-white">{b.claim}</p>
              {b.action_item && (
                <p className="mt-1 font-body text-xs text-[color:var(--color-ua)]">
                  Action: {b.action_item}
                </p>
              )}
              {(b.citations?.length ?? 0) > 0 && (
                <p className="mt-1 font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                  Cites · {b.citations.map((c) => c.chunk_id).join(", ")}
                </p>
              )}
              <p className="mt-1 font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                source · {b.source_query_id}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NodeTrace({
  history,
}: {
  history: HermesRunData["history"];
}): React.ReactElement {
  if (history.length === 0) return <></>;
  return (
    <div>
      <h2 className="mb-2 font-display text-lg font-semibold text-cloud-white">
        Run trace
      </h2>
      <ol className="flex flex-col gap-2">
        {history.map((event, i) => {
          const ms = Math.max(
            0,
            new Date(event.ended_at).getTime() -
              new Date(event.started_at).getTime(),
          );
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
