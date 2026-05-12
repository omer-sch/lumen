"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronDown,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Agent, AgentRun, AnomalyOutput } from "@/lib/mock/agents";

type AgentTimelineMaxProps = {
  agent: Agent;
  /** Fire-and-forget callback for thumbs on the most-recent run. Only
   *  invoked on a fresh set (toggling off is a UI-only state change). */
  onFeedback?: (
    runId: string,
    thumbs: "up" | "down",
    runDate: string,
  ) => void;
};

const CHANNEL_TINT: Record<
  AnomalyOutput["channel"],
  { bg: string; fg: string }
> = {
  Meta: { bg: "var(--tint-ua-soft)", fg: "var(--color-ua)" },
  TikTok: { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
  Google: { bg: "var(--tint-yellow-soft)", fg: "var(--color-yellow)" },
  AppsFlyer: { bg: "var(--tint-organic-soft)", fg: "var(--color-organic)" },
};

/**
 * Max's main output region: a vertical stack of "what Max has been up to"
 * cards, newest first. The first card gets a mint left border and the
 * full action row; older runs are compact one-liners with an anomaly count.
 */
export function AgentTimelineMax({ agent, onFeedback }: AgentTimelineMaxProps) {
  const [mostRecent, ...older] = agent.history;
  if (!mostRecent) {
    return (
      <EmptyState>
        No runs yet. Max hasn&rsquo;t scanned anything for you today.
      </EmptyState>
    );
  }

  return (
    <section
      aria-label="Max's recent scans"
      className="flex flex-col gap-3"
    >
      <SectionLabel>What Max has been up to</SectionLabel>
      <MostRecentCard
        run={mostRecent}
        agentName={agent.name}
        onFeedback={onFeedback}
      />
      {older.map((run) => (
        <CompactRunCard key={run.id} run={run} />
      ))}
    </section>
  );
}

function MostRecentCard({
  run,
  agentName,
  onFeedback,
}: {
  run: AgentRun;
  agentName: string;
  onFeedback?: AgentTimelineMaxProps["onFeedback"];
}) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<"up" | "down" | null>(null);

  const handleVerdict = (next: "up" | "down") => {
    setVerdict((prev) => {
      // Only POST when transitioning into a set state, not when toggling off.
      if (prev !== next) onFeedback?.(run.id, next, run.date);
      return prev === next ? null : next;
    });
  };
  const anomalies =
    run.output.kind === "anomalies" ? run.output.data : [];
  const count = anomalies.length;

  return (
    <GlassCard
      glow="ua"
      className="relative flex flex-col gap-3 p-5 pl-6"
    >
      {/* Mint left accent — overlays the GlassCard's normal border. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
        style={{
          background: "var(--color-ua)",
          boxShadow: "0 0 12px color-mix(in oklab, var(--color-ua) 50%, transparent)",
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ua)]">
            Most recent · {run.date}
          </span>
          <p className="font-body text-md leading-snug text-cloud-white">
            {run.note}
          </p>
        </div>
        {count > 0 && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 font-display text-xs font-bold tabular-nums text-yellow"
            style={{
              background: "var(--tint-yellow-soft)",
              border: "1px solid color-mix(in oklab, var(--color-yellow) 30%, transparent)",
            }}
          >
            {count} found
          </span>
        )}
      </div>

      {/* Inline expansion of the anomalies */}
      {open && count > 0 && (
        <ul className="flex flex-col gap-2 pt-1">
          {anomalies.map((a, i) => {
            const tint = CHANNEL_TINT[a.channel];
            const deltaColor =
              a.direction === "down"
                ? "var(--color-creative)"
                : "var(--color-ua)";
            return (
              <li key={`${a.channel}-${a.client}-${i}`}>
                <Link
                  href={`/feed#anomaly-${run.id}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-md p-2.5 transition-[background-color,border-color] duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                  style={{
                    background: "var(--surface-glass)",
                    border: "1px solid var(--border-glass)",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ background: tint.bg, color: tint.fg }}
                    >
                      {a.channel}
                    </span>
                    <span className="truncate font-body text-sm text-cloud-white">
                      {a.client}
                    </span>
                    <span className="font-body text-xs text-[color:var(--text-muted)]">
                      · {a.metric}
                    </span>
                  </div>
                  <span
                    className="font-display text-sm font-bold tabular-nums"
                    style={{ color: deltaColor }}
                  >
                    {a.delta}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={count === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-navy transition-[transform,box-shadow,opacity] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          style={{
            background: "var(--color-ua)",
            boxShadow: "var(--shadow-mint)",
          }}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-280 ease-out-quart",
              open && "rotate-180",
            )}
            strokeWidth={2.5}
          />
          {open ? "Hide" : "Show me"}
        </button>
        <PillButton
          onClick={() => handleVerdict("up")}
          active={verdict === "up"}
          tone="up"
          icon={<ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
          label="Helpful"
        />
        <PillButton
          onClick={() => handleVerdict("down")}
          active={verdict === "down"}
          tone="down"
          icon={<ThumbsDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
          label="Not useful"
        />
        <PillButton
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>(
              `input[aria-label="Message ${agentName}"]`,
            );
            input?.focus();
          }}
          icon={<MessageCircle className="h-3.5 w-3.5" strokeWidth={2.5} />}
          label={`Tell ${agentName} why`}
        />
      </div>
    </GlassCard>
  );
}

function CompactRunCard({ run }: { run: AgentRun }) {
  const count =
    run.output.kind === "anomalies" ? run.output.data.length : 0;
  return (
    <div
      className="flex items-center gap-3 rounded-lg p-4"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
      }}
    >
      <span className="w-14 shrink-0 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {run.date}
      </span>
      <p className="min-w-0 flex-1 truncate font-body text-sm text-[color:var(--text-secondary)]">
        {run.note}
      </p>
      {count > 0 && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-display text-[11px] font-bold tabular-nums text-yellow"
          style={{
            background: "var(--tint-yellow-soft)",
            border: "1px solid color-mix(in oklab, var(--color-yellow) 30%, transparent)",
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function PillButton({
  onClick,
  active,
  tone,
  icon,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  tone?: "up" | "down";
  icon: React.ReactNode;
  label: string;
}) {
  const accent =
    tone === "down" ? "var(--color-creative)" : "var(--color-ua)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,border-color] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        active
          ? "text-cloud-white"
          : "text-[color:var(--text-secondary)] hover:text-cloud-white",
      )}
      style={{
        background: active
          ? `color-mix(in oklab, ${accent} 18%, transparent)`
          : "var(--surface-input)",
        border: active
          ? `1px solid color-mix(in oklab, ${accent} 40%, transparent)`
          : "1px solid var(--border-default)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <GlassCard className="p-6">
      <p className="font-body text-sm text-[color:var(--text-secondary)]">
        {children}
      </p>
    </GlassCard>
  );
}
