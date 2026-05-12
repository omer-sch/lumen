"use client";

import {
  Bell,
  Brain,
  Database,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Rss,
  Sparkles,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { AgentToolkit as AgentToolkitData } from "@/lib/mock/agents";

type AgentToolkitProps = {
  agentName: string;
  toolkit: AgentToolkitData;
};

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Database,
  FileText,
  Brain,
  MessageCircle,
  Bell,
  Rss,
  TrendingUp,
  Image: ImageIcon,
};

/**
 * The toolkit panel — one short paragraph in the agent's voice describing
 * what the agent does, a row of connected-tool pills, and a footer link
 * to the agent's learned memory.
 */
export function AgentToolkit({ agentName, toolkit }: AgentToolkitProps) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-[color:var(--color-ua)]" strokeWidth={2.5} />
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ua)]">
          What {agentName} works with
        </span>
      </div>

      <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {toolkit.sentence}
      </p>

      <div className="flex flex-wrap gap-2">
        {toolkit.tools.map((t) => {
          const Icon = ICON_MAP[t.icon] ?? Sparkles;
          return (
            <span
              key={t.name}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-xs font-medium text-cloud-white"
              style={{
                background: "var(--surface-input)",
                border: "1px solid var(--border-glass)",
              }}
            >
              <Icon
                className="h-3.5 w-3.5 text-[color:var(--color-ua)]"
                strokeWidth={2}
              />
              {t.name}
            </span>
          );
        })}
      </div>

      <button
        type="button"
        className="self-start font-body text-xs text-[color:var(--color-ua)] underline-offset-4 transition-colors duration-280 ease-out-quart hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        See what {agentName} has learned →
      </button>
    </GlassCard>
  );
}
