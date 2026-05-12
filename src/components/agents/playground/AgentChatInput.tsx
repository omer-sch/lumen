"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

type AgentChatInputProps = {
  /** Display name used in the placeholder ("Ask Max anything…"). */
  agentName: string;
  /** Custom placeholder override. Caller supplies the agent-specific copy. */
  placeholder: string;
  /** Pre-built suggestion chips, agent-specific. Clicking a chip pre-fills
   *  the input but does not auto-send. */
  chips: string[];
  /** Called with the trimmed submission text. When provided, replaces the
   *  default console-log fallback. Aria wires this to her generation flow. */
  onSubmit?: (text: string) => void;
  /** Locks the form (input + Send + chips) while an external operation is
   *  in flight — e.g. Aria mid-generation. */
  disabled?: boolean;
};

/**
 * Chat input + suggestion chips, full-width card. When `onSubmit` is wired
 * (Aria), Send routes through it. When not (Max / Nova, no backend yet),
 * Send falls back to console-logging so the surface remains useful.
 * Chips populate the input on click; they never auto-send.
 */
export function AgentChatInput({
  agentName,
  placeholder,
  chips,
  onSubmit,
  disabled,
}: AgentChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (onSubmit) {
      onSubmit(trimmed);
    } else {
      console.log(`[${agentName} chat]`, trimmed);
    }
    setValue("");
  };

  return (
    <GlassCard glow="ua" className="flex flex-col gap-3 p-4 sm:p-5">
      <form
        onSubmit={handleSubmit}
        aria-busy={disabled || undefined}
        className="flex items-center gap-2 rounded-md p-1.5 transition-opacity duration-280 ease-out-quart"
        style={{
          background: "var(--surface-input)",
          border: "1px solid var(--border-default)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={`Message ${agentName}`}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-body text-base text-cloud-white placeholder:text-[color:var(--text-muted)] focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-xs font-semibold uppercase tracking-wider text-navy transition-[transform,box-shadow,opacity] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          style={{
            background: "var(--color-ua)",
            boxShadow: "var(--shadow-mint)",
          }}
        >
          Send
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setValue(chip)}
            disabled={disabled}
            className="rounded-full px-3 py-1.5 font-body text-xs font-medium text-[color:var(--color-ua)] transition-[transform,background-color,border-color,opacity] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--tint-ua-soft)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            style={{
              background: "transparent",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 40%, transparent)",
            }}
          >
            {chip}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}
