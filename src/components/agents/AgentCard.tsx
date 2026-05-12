"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassBulb } from "@/components/ui/GlassBulb";
import { LivePulse } from "@/components/ui/LivePulse";
import type { Agent } from "@/lib/mock/agents";

type AgentCardProps = {
  agent: Agent;
  /** 1-based grid position — drives staggered card-enter animation. */
  enterIndex?: number;
};

type DisplayStatus = "running" | "completed" | "scheduled" | "paused";

export function AgentCard({ agent, enterIndex }: AgentCardProps) {
  const display: DisplayStatus = agent.paused ? "paused" : agent.status;
  const isRunning = display === "running";
  const isPaused = display === "paused";
  const [avatarFailed, setAvatarFailed] = useState(false);

  return (
    <Link
      href={`/agents/${agent.id}`}
      aria-label={`Open ${agent.name}'s workspace`}
      data-testid={`agent-card-${agent.id}`}
      className="block rounded-lg focus-mint focus-visible:outline-none"
    >
      <GlassCard
        glow="ua"
        enterIndex={enterIndex}
        className={cn(
          "flex h-full flex-col gap-4 p-5 transition-[transform,box-shadow,border-color] duration-280 ease-out-quart cursor-pointer active:scale-[0.985]",
          isPaused && "opacity-90",
        )}
      >
        {/* Header — avatar + status pill */}
        <div className="flex items-start gap-4">
          {avatarFailed ? (
            <div
              className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full"
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
                size={40}
                accent="mint"
                float={isRunning}
                style={{
                  opacity: isRunning ? 1 : isPaused ? 0.4 : 0.6,
                  filter: isRunning
                    ? undefined
                    : "saturate(0.7) drop-shadow(0 8px 16px rgba(0,0,0,0.3))",
                }}
              />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/avatars/${agent.id}.png`}
              alt={`${agent.name} avatar`}
              onError={() => setAvatarFailed(true)}
              className={cn(
                "h-16 w-16 shrink-0 rounded-full object-cover",
                isRunning && "ring-2 ring-[#54F0A3]/60",
                isPaused && "opacity-60 grayscale",
              )}
              style={{
                background: "var(--surface-icon-bg)",
                border: "1px solid var(--border-glass)",
              }}
            />
          )}

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
              <StatusPill status={display} />
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
          <Stat
            label="Schedule"
            value={agent.schedule.split(" · ")[0]}
            hint={agent.schedule.split(" · ")[1]}
            dimmed={isPaused}
          />
        </div>

        {/* Live progress — present while running and not paused */}
        {isRunning && agent.liveRun && (
          <LiveProgress
            progress={agent.liveRun.progress}
            step={agent.liveRun.step}
          />
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="font-body text-xs text-[color:var(--text-muted)]">
            {isPaused ? "Paused — schedule suspended" : agent.lastRun}
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]"
            strokeWidth={2}
          />
        </div>
      </GlassCard>
    </Link>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
  dimmed,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "yellow";
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-col gap-0.5 px-3 py-2.5", dimmed && "opacity-50")}
      style={{ background: "var(--surface-glass)" }}
    >
      <span className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span
        className={cn(
          "font-display text-md font-bold tabular-nums leading-none",
          accent === "yellow" ? "text-yellow" : "text-cloud-white",
          dimmed && "line-through",
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

function LiveProgress({ progress, step }: { progress: number; step: string }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md px-3 py-2.5"
      style={{
        background: "var(--tint-ua-soft)",
        border: "1px solid color-mix(in oklab, var(--color-ua) 22%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ua)]">
          {step}
        </span>
        <span className="font-display text-xs font-bold tabular-nums text-[color:var(--color-ua)]">
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full"
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

function StatusPill({ status }: { status: DisplayStatus }) {
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
  if (status === "paused") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px dashed var(--border-default)",
        }}
      >
        <Pause className="h-2.5 w-2.5" strokeWidth={2.5} />
        Paused
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
