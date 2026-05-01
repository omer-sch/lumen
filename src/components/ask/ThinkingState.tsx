"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import { Skeleton } from "@/components/ui/Skeleton";

export function ThinkingState({ question }: { question: string }) {
  return (
    <GlassCard glow="ua" enterIndex={1} className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <LivePulse accent="mint" size={8} />
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            Lumen is reasoning…
          </span>
          <span className="font-body text-sm text-[color:var(--text-secondary)]">
            &ldquo;{question}&rdquo;
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-44 w-full rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
      </div>
    </GlassCard>
  );
}
