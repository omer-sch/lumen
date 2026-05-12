"use client";

import Link from "next/link";
import { ArrowUpRight, Pencil, Star } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Agent, AgentRun, ReportOutput } from "@/lib/mock/agents";

type AgentDraftNovaProps = {
  agent: Agent;
};

/**
 * Nova's main output region: a draft preview card on top with the most
 * recent report, then a stack of compact previous drafts.
 */
export function AgentDraftNova({ agent }: AgentDraftNovaProps) {
  const reportRuns = agent.history.filter(
    (r) => r.output.kind === "report",
  ) as (AgentRun & { output: { kind: "report"; data: ReportOutput } })[];
  const [hero, ...older] = reportRuns;

  if (!hero) {
    return (
      <GlassCard className="p-6">
        <p className="font-body text-sm text-[color:var(--text-secondary)]">
          Nova hasn&rsquo;t drafted a report yet. Friday morning, she will.
        </p>
      </GlassCard>
    );
  }

  return (
    <section aria-label="Nova's drafts" className="flex flex-col gap-4">
      <SectionLabel>Latest draft</SectionLabel>

      <GlassCard glow="ua" className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ua)]">
              Drafted · {hero.date}
            </span>
            <h2 className="font-display text-lg font-bold leading-tight text-cloud-white">
              {hero.output.data.title}
            </h2>
          </div>
          {hero.rating != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-display text-xs font-bold tabular-nums text-yellow"
              style={{
                background: "var(--tint-yellow-soft)",
                border: "1px solid color-mix(in oklab, var(--color-yellow) 30%, transparent)",
              }}
            >
              <Star className="h-3 w-3 fill-current" strokeWidth={0} />
              {hero.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {hero.output.data.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-md px-3 py-1.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-glass)",
              }}
            >
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {m.label}
              </p>
              <p className="font-display text-md font-bold tabular-nums text-yellow">
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {hero.output.data.excerpt}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 font-body text-xs font-semibold uppercase tracking-wider text-navy transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            style={{
              background: "var(--color-ua)",
              boxShadow: "var(--shadow-mint)",
            }}
          >
            Open in Reports
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 font-body text-xs font-semibold uppercase tracking-wider text-cloud-white transition-[transform,background-color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            style={{
              background: "var(--surface-input)",
              border: "1px solid var(--border-default)",
            }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
            Suggest edits
          </button>
        </div>
      </GlassCard>

      {older.length > 0 && (
        <>
          <SectionLabel>Previous drafts</SectionLabel>
          <ul className="flex flex-col gap-2">
            {older.map((run) => (
              <PreviousDraftRow key={run.id} run={run} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PreviousDraftRow({
  run,
}: {
  run: AgentRun & { output: { kind: "report"; data: ReportOutput } };
}) {
  return (
    <li
      className="flex items-center gap-3 rounded-lg p-4"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
      }}
    >
      <span className="w-14 shrink-0 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {run.date}
      </span>
      <p className="min-w-0 flex-1 truncate font-body text-sm text-cloud-white">
        {run.output.data.title}
      </p>
      {run.rating != null && (
        <span className="inline-flex shrink-0 items-center gap-1 font-display text-sm font-bold tabular-nums text-yellow">
          <Star className="h-3 w-3 fill-current" strokeWidth={0} />
          {run.rating.toFixed(1)}
        </span>
      )}
    </li>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}
