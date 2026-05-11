"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Check,
  ChevronRight,
  Pause,
  Play,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { AgentRunOutput } from "@/components/agents/AgentRunOutput";
import type { Agent, AgentMemory, AgentRun } from "@/lib/mock/agents";

type AgentDetailPanelProps = {
  agent: Agent;
  onPauseToggle: (id: string) => void;
  onRunNow: (id: string) => void;
};

type Verdict = "up" | "down" | null;

type SavedMemoryEntry = {
  runId: string;
  thumbs: Verdict;
  note: string;
  score: number;
  date: string;
  savedAt: string;
};

export function AgentDetailPanel({
  agent,
  onPauseToggle,
  onRunNow,
}: AgentDetailPanelProps) {
  const mostRecent = agent.history[0];
  const usesRating = agent.id === "nova";
  const initialScore = usesRating
    ? (mostRecent?.rating ?? 4)
    : (mostRecent?.score ?? 80);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [note, setNote] = useState("");
  const [score, setScore] = useState<number>(initialScore);
  const [saved, setSaved] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(
    mostRecent?.id ?? null,
  );

  const trackMax = usesRating ? 5 : 100;
  const isRunning = agent.status === "running" && !agent.paused;
  const canRunNow = !isRunning;

  const [savedEntries, setSavedEntries] = useState<SavedMemoryEntry[]>([]);

  const refreshSaved = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agent.id}/memory`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { entries } = (await res.json()) as { entries: SavedMemoryEntry[] };
      setSavedEntries(entries);
    } catch (err) {
      console.error("Load saved memory failed", err);
    }
  }, [agent.id]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  // When a fresh run lands at history[0] (e.g. after Run now), follow it:
  // jump the inline open-row to the new run and reset the score slider so
  // the feedback form is ready for the new image. Without this the user
  // has to scroll/click to find the result and the slider stays pinned to
  // the previous run's score.
  // Primitives are pulled out so the effect's deps are stable references —
  // depending on `mostRecent` directly would refire on every parent re-render
  // since AgentsView rebuilds the agent objects each tick.
  const recentId = mostRecent?.id;
  const recentScore = mostRecent?.score;
  const recentRating = mostRecent?.rating;
  useEffect(() => {
    if (!recentId) return;
    setOpenRunId(recentId);
    setScore(usesRating ? (recentRating ?? 4) : (recentScore ?? 80));
  }, [recentId, recentScore, recentRating, usesRating]);

  const handleSave = async () => {
    if (mostRecent) {
      try {
        const res = await fetch(`/api/agents/${agent.id}/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: mostRecent.id,
            thumbs: verdict,
            note,
            score,
            date: mostRecent.date,
          }),
        });
        if (res.ok) {
          await refreshSaved();
          setNote("");
          setVerdict(null);
        }
      } catch (err) {
        console.error("Save to memory failed", err);
      }
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <GlassCard
      glow="ua"
      enterIndex={1}
      id={`agent-detail-${agent.id}`}
      className="flex flex-col gap-6 p-5 lg:p-6"
    >
      {/* Top control row — pause/resume + run now */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h3 className="font-display text-md font-bold leading-tight text-cloud-white">
            {agent.name}&rsquo;s workspace
          </h3>
          <p className="font-body text-xs text-[color:var(--text-muted)]">
            {agent.paused
              ? "Paused — won't run on schedule until resumed."
              : isRunning
                ? "Running now — open the output below when it lands."
                : `Next run · ${agent.schedule}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ControlButton
            onClick={() => onPauseToggle(agent.id)}
            icon={agent.paused ? <Play className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Pause className="h-3.5 w-3.5" strokeWidth={2.5} />}
            label={agent.paused ? "Resume" : "Pause"}
            tone="ghost"
          />
          <ControlButton
            onClick={() => onRunNow(agent.id)}
            disabled={!canRunNow}
            icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />}
            label={isRunning ? "Running…" : "Run now"}
            tone="primary"
          />
        </div>
      </div>

      {/* Live progress */}
      {isRunning && agent.liveRun && (
        <LiveBar
          progress={agent.liveRun.progress}
          step={agent.liveRun.step}
        />
      )}

      {/* Memory */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="inline-flex items-center gap-2 font-display text-md font-bold leading-none text-cloud-white">
            <Brain className="h-4 w-4 text-[color:var(--color-ua)]" strokeWidth={2} />
            Memory · what {agent.name} learned
          </h3>
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            {agent.memory.length} pattern{agent.memory.length === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {agent.memory.map((m) => (
            <MemoryChip key={m.id} memory={m} />
          ))}
        </ul>

        {savedEntries.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                Your saved feedback
              </h4>
              <span className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {savedEntries.length} entr{savedEntries.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {[...savedEntries]
                .reverse()
                .slice(0, 5)
                .map((e) => (
                  <SavedEntryRow key={e.savedAt} entry={e} />
                ))}
            </ul>
          </div>
        )}
      </section>

      {/* Run history + feedback */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Run history */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-md font-bold leading-none text-cloud-white">
              Recent runs
            </h3>
            <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Click to open the output
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {agent.history.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                usesRating={usesRating}
                open={openRunId === run.id}
                onToggle={() =>
                  setOpenRunId(openRunId === run.id ? null : run.id)
                }
              />
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
      </div>
    </GlassCard>
  );
}

/* ──────────────────────────────────────────
   Live progress bar
   ────────────────────────────────────────── */
function LiveBar({ progress, step }: { progress: number; step: string }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div
      className="flex flex-col gap-2 rounded-md px-4 py-3"
      style={{
        background: "var(--tint-ua-soft)",
        border: "1px solid color-mix(in oklab, var(--color-ua) 28%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]">
          {step}
        </span>
        <span className="font-display text-sm font-bold tabular-nums text-[color:var(--color-ua)]">
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out-quart"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--color-ua) 0%, var(--color-ua-glow) 100%)",
            boxShadow:
              "0 0 12px color-mix(in oklab, var(--color-ua) 60%, transparent)",
          }}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Memory chip — shows a learned pattern + applied count
   ────────────────────────────────────────── */
function MemoryChip({ memory }: { memory: AgentMemory }) {
  return (
    <li
      className="flex flex-col gap-1.5 rounded-md p-3"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
      }}
    >
      <p className="font-body text-sm leading-snug text-cloud-white">
        {memory.rule}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-body text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          From {memory.source}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-yellow"
          style={{ background: "var(--tint-yellow-soft)" }}
        >
          Applied <span className="tabular-nums">{memory.appliedCount}</span>×
        </span>
      </div>
    </li>
  );
}

/* ──────────────────────────────────────────
   Saved entry — one row of persisted user feedback
   ────────────────────────────────────────── */
function SavedEntryRow({ entry }: { entry: SavedMemoryEntry }) {
  const Icon =
    entry.thumbs === "up"
      ? ThumbsUp
      : entry.thumbs === "down"
        ? ThumbsDown
        : null;
  const iconColor =
    entry.thumbs === "down"
      ? "var(--color-creative)"
      : "var(--color-ua)";
  return (
    <li
      className="flex items-center gap-3 rounded-md px-3 py-2"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
      }}
    >
      <span className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {entry.date}
      </span>
      {Icon && (
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: iconColor }}
          strokeWidth={2.5}
          aria-label={entry.thumbs === "up" ? "Good run" : "Needs work"}
        />
      )}
      <span className="font-display text-xs font-bold tabular-nums text-yellow">
        {Math.round(entry.score)}
      </span>
      <p className="min-w-0 flex-1 truncate font-body text-xs text-[color:var(--text-secondary)]">
        {entry.note || (
          <span className="italic text-[color:var(--text-muted)]">
            (no note)
          </span>
        )}
      </p>
    </li>
  );
}

/* ──────────────────────────────────────────
   Run row — clickable, expands inline to show output
   ────────────────────────────────────────── */
function RunRow({
  run,
  usesRating,
  open,
  onToggle,
}: {
  run: AgentRun;
  usesRating: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const value =
    run.rating !== undefined
      ? run.rating.toFixed(1)
      : run.score !== undefined
        ? String(run.score)
        : "—";
  const showAccent = run.rating !== undefined || run.score !== undefined;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-start gap-3 rounded-md p-3 text-left transition-[background-color,border-color,transform] duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          open && "shadow-card",
        )}
        style={{
          background: open
            ? "color-mix(in oklab, var(--color-ua) 6%, var(--surface-glass))"
            : "var(--surface-glass)",
          border: open
            ? "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)"
            : "1px solid var(--border-glass)",
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
        <p className="flex-1 font-body text-sm leading-snug text-[color:var(--text-secondary)]">
          {run.note}
        </p>
        <ChevronRight
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-[color:var(--text-muted)] transition-transform duration-280 ease-out-quart",
            open && "rotate-90 text-[color:var(--color-ua)]",
          )}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          className="mt-2 rounded-md p-3"
          style={{
            background: "var(--surface-base)",
            border: "1px solid var(--border-glass)",
          }}
        >
          <AgentRunOutput output={run.output} />
        </div>
      )}
    </li>
  );
}

/* ──────────────────────────────────────────
   Verdict (thumbs) buttons
   ────────────────────────────────────────── */
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

/* ──────────────────────────────────────────
   Header control button (Pause/Resume + Run now)
   ────────────────────────────────────────── */
function ControlButton({
  onClick,
  icon,
  label,
  tone,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "primary" | "ghost";
  disabled?: boolean;
}) {
  const isPrimary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,box-shadow,opacity] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        isPrimary ? "text-navy" : "text-cloud-white",
        disabled && "pointer-events-none opacity-50",
      )}
      style={
        isPrimary
          ? {
              background: "var(--color-ua)",
              boxShadow: "var(--shadow-mint)",
            }
          : {
              background: "var(--surface-input)",
              border: "1px solid var(--border-default)",
            }
      }
    >
      {icon}
      {label}
    </button>
  );
}
