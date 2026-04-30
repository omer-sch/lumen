"use client";

import { useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

type Example = {
  q: string;
  /** First card is a hero — yellow + shimmer. The rest are mint. */
  glow: "yellow" | "ua";
  shimmer?: boolean;
};

const EXAMPLES: Example[] = [
  {
    q: "How did our Meta spend perform this week vs last week?",
    glow: "yellow",
    shimmer: true,
  },
  { q: "Show me the top 5 creatives by ROAS in April.", glow: "ua" },
  {
    q: "Where did installs drop, and which campaigns drove the change?",
    glow: "ua",
  },
  {
    q: "Compare CPI across TikTok and Google for the past 14 days.",
    glow: "ua",
  },
];

export default function QueriesPage() {
  // Phase 0 input is disabled, but we still drive a focus state for visual
  // parity with the live spec (mint border + mint glow on focus).
  const [focused, setFocused] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-10 py-10">
      {/* Hero — compact inline header. The brand bulb is intentionally absent
          here: yellow SectionBreaks are reserved for true brand moments, not
          every page top. */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-yellow"
          style={{
            background: "var(--tint-yellow-soft)",
            boxShadow: "0 0 24px rgba(255,221,12,0.18)",
          }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.25} />
          Phase 1 preview
        </span>
        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          Ask Lumen <span className="text-gradient-brand">anything.</span>
        </h2>
        <p className="max-w-xl font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Type a question in plain English. Lumen pulls the data, builds the
          chart, and explains what it sees — so you spend less time digging and
          more time deciding.
        </p>
      </div>

      {/* Featured Ask input */}
      <div className="flex flex-col items-center gap-2">
        <GlassCard glow="ua" feature shimmer className="w-full p-3">
          <form
            aria-label="Ask Lumen"
            className="flex items-center gap-2"
            action="/queries"
          >
            <label htmlFor="query-input" className="sr-only">
              Ask Lumen
            </label>
            <input
              id="query-input"
              name="q"
              type="text"
              disabled
              aria-disabled="true"
              placeholder="Ask about a metric, channel, campaign, or trend…"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="flex-1 rounded-md px-3 py-2 font-body text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[color:var(--text-muted)] disabled:cursor-not-allowed"
              style={{
                background: "var(--surface-input)",
                border: `1px solid ${
                  focused ? "var(--color-ua)" : "var(--border-default)"
                }`,
                color: "var(--text-primary)",
                boxShadow: focused ? "var(--shadow-mint)" : "none",
              }}
            />
            <button
              type="submit"
              disabled
              aria-disabled="true"
              className="inline-flex items-center gap-1.5 rounded-md bg-yellow px-4 py-2 font-body text-sm font-semibold text-navy shadow-yellow transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              Ask
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </form>
        </GlassCard>
        <p
          className="font-body text-xs uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Coming in Phase 1
        </p>
      </div>

      {/* Example cards — first is yellow hero, rest are mint, all stagger in */}
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {EXAMPLES.map((ex, i) => (
          <GlassCard
            key={ex.q}
            glow={ex.glow}
            shimmer={ex.shimmer}
            enterIndex={i + 1}
            aria-disabled="true"
            className="cursor-not-allowed p-5"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md"
                style={{
                  background:
                    ex.glow === "yellow"
                      ? "var(--tint-yellow-soft)"
                      : "var(--tint-ua-soft)",
                  color:
                    ex.glow === "yellow"
                      ? "var(--color-yellow)"
                      : "var(--color-ua)",
                  boxShadow:
                    ex.glow === "yellow"
                      ? "0 0 12px color-mix(in oklab, var(--color-yellow) 30%, transparent)"
                      : "0 0 12px color-mix(in oklab, var(--color-ua) 30%, transparent)",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="font-body text-sm leading-relaxed text-cloud-white">
                  {ex.q}
                </p>
                <p
                  className="mt-2 font-body text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Available in Phase 1
                </p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
