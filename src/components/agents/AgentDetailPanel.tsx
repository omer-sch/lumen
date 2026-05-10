"use client";

import { useState } from "react";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Agent, AgentRun } from "@/lib/mock/agents";

type AgentDetailPanelProps = {
  agent: Agent;
};

type Verdict = "up" | "down" | null;

export function AgentDetailPanel({ agent }: AgentDetailPanelProps) {
  const mostRecent = agent.history[0];
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [note, setNote] = useState("");
  const [score, setScore] = useState<number>(mostRecent?.score ?? 80);
  const [saved, setSaved] = useState(false);

  // Nova uses 0–5 ratings; everyone else uses 0–100 scores.
  const usesRating = agent.id === "nova";
  const trackMax = usesRating ? 5 : 100;

  const handleSave = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <GlassCard
      glow="ua"
      enterIndex={1}
      id={`agent-detail-${agent.id}`}
      className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2 lg:p-6"
    >
      {/* Run history */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-md font-bold leading-none text-cloud-white">
            Recent runs
          </h3>
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Last 3
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {agent.history.map((run, i) => (
            <RunRow key={`${run.date}-${i}`} run={run} usesRating={usesRating} />
          ))}
        </ul>
      </section>

      {/* Feedback */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-md font-bold leading-none text-cloud-white">
            Feedback · {mostRecent?.date}
          </h3>
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Most recent run
          </span>
        </div>

        {/* Score bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
              {usesRating ? "Rating" : "Virality score"}
            </span>
            <span
              className="font-display text-lg font-extrabold tabular-nums text-yellow"
              aria-live="polite"
            >
              {usesRating ? score.toFixed(1) : Math.round(score)}
              <span className="ml-1 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                / {trackMax}
              </span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={trackMax}
            step={usesRating ? 0.1 : 1}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            aria-label={usesRating ? "Rating" : "Virality score"}
            className="agent-score-range"
            style={
              {
                ["--fill" as string]: `${(score / trackMax) * 100}%`,
              } as React.CSSProperties
            }
          />
        </div>

        {/* Thumbs */}
        <div className="flex items-center gap-2">
          <VerdictButton
            kind="up"
            active={verdict === "up"}
            onClick={() => setVerdict(verdict === "up" ? null : "up")}
          />
          <VerdictButton
            kind="down"
            active={verdict === "down"}
            onClick={() => setVerdict(verdict === "down" ? null : "down")}
          />
          <span className="ml-1 font-body text-xs text-[color:var(--text-muted)]">
            How was the last run?
          </span>
        </div>

        {/* Note */}
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
            Note for {agent.name}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Leave a note for the agent — what to improve next time..."
            className="resize-none rounded-md px-3 py-2.5 font-body text-sm text-cloud-white placeholder:text-[color:var(--text-muted)] focus-mint focus-visible:outline-none"
            style={{
              background: "var(--surface-input)",
              border: "1px solid var(--border-default)",
            }}
          />
        </label>

        {/* Save */}
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-[0.16em] transition-opacity duration-280 ease-out-quart",
              saved
                ? "text-[color:var(--color-ua)] opacity-100"
                : "pointer-events-none opacity-0",
            )}
            aria-live="polite"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Saved to {agent.name}&rsquo;s memory
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-xs font-semibold uppercase tracking-wider text-navy transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            style={{
              background: "var(--color-ua)",
              boxShadow: "var(--shadow-mint)",
            }}
          >
            Save to agent memory
          </button>
        </div>
      </section>
    </GlassCard>
  );
}

function RunRow({ run, usesRating }: { run: AgentRun; usesRating: boolean }) {
  const value =
    run.rating !== undefined
      ? run.rating.toFixed(1)
      : run.score !== undefined
        ? String(run.score)
        : "—";
  const showAccent = run.rating !== undefined || run.score !== undefined;

  return (
    <li
      className="flex items-start gap-3 rounded-md p-3"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
      }}
    >
      <div className="flex w-14 shrink-0 flex-col">
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          {run.date}
        </span>
        {showAccent && (
          <span className="mt-0.5 font-display text-md font-bold tabular-nums leading-none text-yellow">
            {value}
            {usesRating && (
              <span className="ml-0.5 font-body text-[10px] font-semibold text-[color:var(--text-muted)]">
                /5
              </span>
            )}
          </span>
        )}
      </div>
      <p className="font-body text-sm leading-snug text-[color:var(--text-secondary)]">
        {run.note}
      </p>
    </li>
  );
}

function VerdictButton({
  kind,
  active,
  onClick,
}: {
  kind: "up" | "down";
  active: boolean;
  onClick: () => void;
}) {
  const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
  const label = kind === "up" ? "Good run" : "Needs work";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-md transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        active
          ? "text-[color:var(--color-ua)]"
          : "text-[color:var(--text-secondary)] hover:text-cloud-white",
      )}
      style={{
        background: active
          ? "var(--tint-ua-soft)"
          : "var(--surface-input)",
        border: active
          ? "1px solid color-mix(in oklab, var(--color-ua) 40%, transparent)"
          : "1px solid var(--border-default)",
        boxShadow: active
          ? "0 0 14px color-mix(in oklab, var(--color-ua) 25%, transparent)"
          : undefined,
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}
