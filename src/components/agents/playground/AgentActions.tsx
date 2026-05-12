"use client";

import { Pause, PlayCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentActionsProps = {
  agentName: string;
  /** Local running state; disables Run when active. */
  running: boolean;
  /** Local paused state; flips the secondary button to Resume. */
  paused: boolean;
  onRunNow: () => void;
  onTogglePause: () => void;
};

/** Two-up equal-width action grid at the bottom of the workspace. */
export function AgentActions({
  agentName,
  running,
  paused,
  onRunNow,
  onTogglePause,
}: AgentActionsProps) {
  const runDisabled = running;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={onRunNow}
        disabled={runDisabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-body text-sm font-semibold uppercase tracking-wider text-navy transition-[transform,box-shadow,opacity] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        )}
        style={{
          background: "var(--color-ua)",
          boxShadow: "var(--shadow-mint)",
        }}
      >
        <Sparkles className="h-4 w-4" strokeWidth={2.5} />
        {running ? `${agentName} is running…` : `Run ${agentName} now`}
      </button>
      <button
        type="button"
        onClick={onTogglePause}
        className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-body text-sm font-semibold uppercase tracking-wider text-cloud-white transition-[transform,background-color,border-color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        style={{
          background: "var(--surface-input)",
          border: "1px solid var(--border-default)",
        }}
      >
        {paused ? (
          <>
            <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
            Resume {agentName}
          </>
        ) : (
          <>
            <Pause className="h-4 w-4" strokeWidth={2.5} />
            Pause {agentName}
          </>
        )}
      </button>
    </div>
  );
}
