"use client";

import { Suspense, useState } from "react";
import { History, Sparkles } from "lucide-react";
import { useGlobalFilters, windowDays } from "@/lib/filters/use-global-filters";
import { findClient } from "@/lib/mock/clients";
import { askLumen } from "@/lib/ask/router";
import { usePinnedTiles } from "@/lib/pins/store";
import type { Answer } from "@/lib/ask/types";
import { AskInput } from "./AskInput";
import { ThinkingState } from "./ThinkingState";
import { AnswerCard } from "./AnswerCard";

const STARTERS = [
  "What's our UA ROAS this week?",
  "Spend trend over the last 30 days",
  "Compare ROAS by channel",
  "Top 5 campaigns by ROAS",
  "How is Meta doing?",
];

type HistoryEntry = { id: string; askedAt: number; answer: Answer };

export function AskWorkspace() {
  return (
    <Suspense fallback={null}>
      <AskInner />
    </Suspense>
  );
}

function AskInner() {
  const { from, to, client } = useGlobalFilters();
  const c = findClient(client);
  const days = windowDays({ from, to });
  const { pin } = usePinnedTiles();

  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const handleAsk = async (q: string) => {
    setQuestion(q);
    setAnswer(null);
    setLoading(true);
    try {
      const a = await askLumen(q, { windowDays: days });
      setAnswer(a);
      setHistory((cur) =>
        [{ id: `q_${Date.now().toString(36)}`, askedAt: Date.now(), answer: a }, ...cur].slice(0, 8),
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePin = (a: Answer) => {
    pin({
      label: a.narration.slice(0, 80),
      question: a.question,
      config: a.config,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-2 md:gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-yellow"
          style={{
            background: "var(--tint-yellow-soft)",
            boxShadow: "0 0 24px rgba(255,221,12,0.18)",
          }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.25} />
          Free text → visual
        </span>
        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          Ask Lumen <span className="text-gradient-brand">anything.</span>
        </h2>
        <p className="max-w-xl font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Plain English. Lumen pulls the data, builds the chart, and explains
          what it sees. Your global filter
          {c.slug === "all" ? " " : ` (${c.name})`} and {days}-day window feed
          in as default context.
        </p>
      </header>

      <AskInput onAsk={handleAsk} disabled={loading} autoFocus />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleAsk(s)}
            disabled={loading}
            className="rounded-full border px-3 py-1.5 font-body text-xs font-medium text-[color:var(--text-secondary)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:text-cloud-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            style={{
              background: "var(--surface-hover)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && question && <ThinkingState question={question} />}
      {!loading && answer && (
        <AnswerCard answer={answer} onPin={() => handlePin(answer)} />
      )}

      {history.length > 1 && (
        <section
          aria-label="Query history"
          className="flex flex-col gap-3"
        >
          <header className="flex items-center gap-2">
            <History className="h-4 w-4 text-[color:var(--text-muted)]" strokeWidth={2} />
            <h3 className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Recent queries
            </h3>
          </header>
          <div className="flex flex-col gap-3">
            {history.slice(1).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => handleAsk(h.answer.question)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-left transition-[background-color,transform] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                style={{ border: "1px solid var(--border-subtle)" }}
              >
                <span className="font-body text-sm text-cloud-white">
                  {h.answer.question}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                  {h.answer.config.kind}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
