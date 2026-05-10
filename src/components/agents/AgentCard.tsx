"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassBulb } from "@/components/ui/GlassBulb";
import { LivePulse } from "@/components/ui/LivePulse";
import type { Agent, AgentStatus } from "@/lib/mock/agents";

type AgentCardProps = {
  agent: Agent;
  /** 1-based grid position — drives staggered card-enter animation. */
  enterIndex?: number;
  expanded: boolean;
  onToggle: (id: string) => void;
};

export function AgentCard({ agent, enterIndex, expanded, onToggle }: AgentCardProps) {
  const isRunning = agent.status === "running";

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      interactive
      onClick={() => onToggle(agent.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(agent.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-controls={`agent-detail-${agent.id}`}
      data-testid={`agent-card-${agent.id}`}
      className={cn(
        "flex h-full flex-col gap-4 p-5",
        expanded && "ring-1 ring-[color:var(--color-ua)]/40",
      )}
    >
      {/* Header — bulb avatar + status pill */}
      <div className="flex items-start gap-4">
        <div
          className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md"
          style={{
            background: isRunning
              ? "color-mix(in oklab, var(--color-ua) 12%, var(--surface-icon-bg))"
              : "var(--surface-icon-bg)",
            border: "1px solid var(--border-glass)",
            boxShadow: isRunning
              ? "var(--shadow-mint), inset 0 1px 0 rgba(255,255,255,0.06)"
              : "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <GlassBulb
            size={48}
            accent="mint"
            float={isRunning}
            style={{
              opacity: isRunning ? 1 : 0.6,
              filter: isRunning
                ? undefined
                : "saturate(0.7) drop-shadow(0 8px 16px rgba(0,0,0,0.3))",
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-extrabold leading-tight tracking-tight text-cloud-white">
                {agent.name}
              </h3>
              <p className="font-body text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                {agent.role}
              </p>
            </div>
            <StatusPill status={agent.status} />
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {agent.description}
      </p>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 gap-px overflow-hidden rounded-md"
        style={{
          background: "var(--border-glass)",
          border: "1px solid var(--border-glass)",
        }}
      >
        <Stat
          label={agent.keyMetric.label}
          value={agent.keyMetric.value}
          accent="yellow"
        />
        <Stat label="Total runs" value={String(agent.totalRuns)} />
        <Stat label="Schedule" value={agent.schedule.split(" · ")[0]} hint={agent.schedule.split(" · ")[1]} />
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="font-body text-xs text-[color:var(--text-muted)]">
          {agent.lastRun}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[color:var(--text-muted)] transition-transform duration-280 ease-out-quart",
            expanded && "rotate-180 text-[color:var(--color-ua)]",
          )}
          strokeWidth={2}
        />
      </div>
    </GlassCard>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "yellow";
}) {
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2.5"
      style={{ background: "var(--surface-glass)" }}
    >
      <span className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span
        className={cn(
          "font-display text-md font-bold tabular-nums leading-none",
          accent === "yellow" ? "text-yellow" : "text-cloud-white",
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="font-body text-[10px] text-[color:var(--text-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  if (status === "running") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]"
        style={{
          background: "var(--tint-ua-soft)",
          border: "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
        }}
      >
        <LivePulse accent="mint" size={6} />
        Running
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-yellow"
        style={{
          background: "var(--tint-yellow-soft)",
          border: "1px solid color-mix(in oklab, var(--color-yellow) 30%, transparent)",
        }}
      >
        Scheduled
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--border-default)",
      }}
    >
      Completed
    </span>
  );
}
