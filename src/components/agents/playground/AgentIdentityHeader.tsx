"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GlassBulb } from "@/components/ui/GlassBulb";
import { LivePulse } from "@/components/ui/LivePulse";
import type { Agent } from "@/lib/mock/agents";

type AgentIdentityHeaderProps = {
  agent: Agent;
  /** Local paused override that mirrors the AgentActions toggle. */
  paused: boolean;
  /** Compact stats line printed under the role. Caller derives the copy
   *  per-agent so the header stays a presentation component. */
  statsLine: string;
};

/**
 * Full-page workspace header — 96px avatar with mint ring (running) or
 * grayscale (paused), name in display font, role caption, stats line.
 */
export function AgentIdentityHeader({
  agent,
  paused,
  statsLine,
}: AgentIdentityHeaderProps) {
  const isRunning = agent.status === "running" && !paused;
  const [avatarFailed, setAvatarFailed] = useState(false);

  return (
    <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      {avatarFailed ? (
        <div
          className={cn(
            "relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full",
            paused && "grayscale opacity-60",
          )}
          style={{
            background: isRunning
              ? "color-mix(in oklab, var(--color-ua) 14%, var(--surface-icon-bg))"
              : "var(--surface-icon-bg)",
            border: "1px solid var(--border-glass)",
            boxShadow: isRunning
              ? "0 0 0 3px color-mix(in oklab, var(--color-ua) 60%, transparent), var(--shadow-mint), inset 0 1px 0 rgba(255,255,255,0.06)"
              : "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <GlassBulb size={56} accent="mint" float={isRunning} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/avatars/${agent.id}.png`}
          alt={`${agent.name} avatar`}
          onError={() => setAvatarFailed(true)}
          className={cn(
            "h-24 w-24 shrink-0 rounded-full object-cover transition-[box-shadow,filter] duration-280 ease-out-quart",
            isRunning && "ring-2 ring-[color:var(--color-ua)]",
            paused && "grayscale opacity-60",
          )}
          style={{
            background: "var(--surface-icon-bg)",
            border: "1px solid var(--border-glass)",
            boxShadow: isRunning
              ? "0 0 0 4px color-mix(in oklab, var(--color-ua) 30%, transparent), var(--shadow-mint)"
              : undefined,
          }}
        />
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-3xl font-extrabold leading-none tracking-tight text-cloud-white sm:text-4xl">
          {agent.name}
        </h1>
        <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          {agent.role}
        </p>
        <p className="flex items-center gap-2 font-body text-xs text-[color:var(--text-secondary)]">
          {isRunning && <LivePulse accent="mint" size={7} />}
          <span className="tabular-nums">{statsLine}</span>
        </p>
      </div>
    </header>
  );
}
