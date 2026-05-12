"use client";

import type { ReactNode } from "react";

type AgentGreetingProps = {
  /** Greeting text. `**token**` substrings render with the yellow accent.
   *  Only the key number should be marked. */
  greeting: string;
};

/**
 * Speech-bubble card that follows the identity header. The little tail
 * up-and-left points at the avatar above. Markdown-style `**bold**`
 * marks the brand-yellow accent on the key number only.
 */
export function AgentGreeting({ greeting }: AgentGreetingProps) {
  return (
    <div className="relative">
      {/* Tail — pointing up-left toward the avatar. Two stacked diamonds
          give a thin border + filled body so the tail visually merges
          with the bubble surface. */}
      <span
        aria-hidden
        className="absolute -top-1.5 left-8 h-3 w-3 rotate-45"
        style={{
          background: "var(--surface-elevated)",
          borderLeft: "1px solid var(--border-glass)",
          borderTop: "1px solid var(--border-glass)",
        }}
      />
      <div
        className="rounded-[14px] px-5 py-4"
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border-glass)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <p className="font-body text-md leading-relaxed text-cloud-white">
          {renderGreeting(greeting)}
        </p>
      </div>
    </div>
  );
}

/** Split on `**...**` markers and render the marked tokens in yellow. */
function renderGreeting(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span
          key={i}
          className="font-display font-extrabold text-yellow tabular-nums"
        >
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
