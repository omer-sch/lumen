"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GlassBulb } from "@/components/ui/GlassBulb";
import { getAgentIdentity, type AgentId } from "@/lib/agents/identity";

type AgentBylineSize = "sm" | "md";
type AgentBylineTone = "dark" | "light";

type AgentBylineProps = {
  agentId: AgentId;
  /** Inline prefix shown before the agent name, e.g. "Drafted by". */
  prefix?: string;
  /** `sm` = 24px avatar (Feed, Ask). `md` = 40px avatar (Report header). */
  size?: AgentBylineSize;
  /** Surface theme — `light` is used by the Reports document on its white
   *  background; everything else stays on the default dark UI. */
  tone?: AgentBylineTone;
  className?: string;
};

const SIZE: Record<
  AgentBylineSize,
  { avatar: number; bulb: number; nameSize: string; prefixSize: string }
> = {
  sm: {
    avatar: 24,
    bulb: 14,
    nameSize: "text-xs",
    prefixSize: "text-xs",
  },
  md: {
    avatar: 40,
    bulb: 22,
    nameSize: "text-sm",
    prefixSize: "text-xs",
  },
};

const TONE: Record<AgentBylineTone, { name: string; prefix: string }> = {
  dark: {
    name: "text-cloud-white",
    prefix: "text-[color:var(--text-muted)]",
  },
  light: {
    name: "text-[color:var(--text-light-primary)]",
    prefix: "text-[color:var(--text-light-muted)]",
  },
};

/**
 * Compact "by Aria/Max/Nova" credit shown wherever an agent produced
 * the visible output. Avatar + name, no card chrome — this is a byline,
 * not a hero. Falls back to the brand `GlassBulb` if the avatar PNG
 * fails to load (same pattern as `AgentCard`).
 */
export function AgentByline({
  agentId,
  prefix,
  size = "sm",
  tone = "dark",
  className,
}: AgentBylineProps) {
  const identity = getAgentIdentity(agentId);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dims = SIZE[size];
  const palette = TONE[tone];
  const nameClass = cn(
    "font-display font-semibold leading-none",
    dims.nameSize,
    palette.name,
  );
  const prefixClass = cn(
    "font-body leading-none",
    dims.prefixSize,
    palette.prefix,
  );

  return (
    <span
      data-testid={`agent-byline-${agentId}`}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {avatarFailed ? (
        <span
          aria-label={`${identity.name} avatar`}
          role="img"
          className="grid shrink-0 place-items-center overflow-hidden rounded-full"
          style={{
            width: dims.avatar,
            height: dims.avatar,
            background: "var(--surface-icon-bg)",
            border: "1px solid var(--border-glass)",
          }}
        >
          <GlassBulb size={dims.bulb} accent="mint" float={false} />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={identity.avatarUrl}
          alt={`${identity.name} avatar`}
          onError={() => setAvatarFailed(true)}
          width={dims.avatar}
          height={dims.avatar}
          className="shrink-0 rounded-full object-cover"
          style={{
            width: dims.avatar,
            height: dims.avatar,
            background: "var(--surface-icon-bg)",
            border: "1px solid var(--border-glass)",
          }}
        />
      )}
      <span className="inline-flex items-baseline gap-1.5">
        {prefix && <span className={prefixClass}>{prefix}</span>}
        <span className={nameClass}>{identity.name}</span>
      </span>
    </span>
  );
}
