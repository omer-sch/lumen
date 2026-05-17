"use client";

import { useMemo } from "react";

import type { HermesEvent } from "@/lib/agents/hermes/events";
import { feedCardForEvent, labelForEvent } from "@/lib/agents/hermes/events";
import { cn } from "@/lib/utils";

// Status tape + findings feed for the Hermes paste-email modal.
// Reads from the useHermesStream events list and renders:
//   1. A single-line status header with a soft pulse and the
//      friendly label for the most recent event.
//   2. A growing list of small cards, one per node_finished event,
//      newest at the bottom (chat-style).
//
// No business logic here -- just shape. Errors and the deck-ready
// redirect are handled by the modal itself.

type Props = {
  events: HermesEvent[];
  /** "streaming" while events flow, "done" after deck_ready, "error"
   *  on failure. Drives the header's pulse tone. */
  status: "idle" | "streaming" | "done" | "error";
};

export function HermesProgress({ events, status }: Props) {
  const latest = events[events.length - 1] ?? null;
  const headerLabel = latest ? labelForEvent(latest) : "Starting up";

  const cards = useMemo(() => {
    const out: { key: string; text: string; at: string }[] = [];
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      const text = feedCardForEvent(ev);
      if (!text) continue;
      out.push({ key: `${i}-${ev.type}`, text, at: ev.at });
    }
    return out;
  }, [events]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--surface-base)] p-3"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            status === "error"
              ? "bg-[color:var(--color-creative)]"
              : "bg-[color:var(--color-ua)]",
            status === "streaming" && "animate-pulse",
          )}
          style={
            status !== "error"
              ? {
                  boxShadow:
                    "0 0 8px color-mix(in oklab, var(--color-ua) 60%, transparent)",
                }
              : undefined
          }
        />
        <span className="font-body text-sm font-semibold text-cloud-white">
          {headerLabel}
        </span>
        {status === "streaming" && (
          <span className="ml-auto font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
            Live
          </span>
        )}
        {status === "done" && (
          <span className="ml-auto font-body text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ua)]">
            Ready
          </span>
        )}
      </div>

      {cards.length > 0 && (
        <ol className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
          {cards.map((c) => (
            <li
              key={c.key}
              className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2"
            >
              <p className="font-body text-xs leading-relaxed text-cloud-white">
                {c.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
