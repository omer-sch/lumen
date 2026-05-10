"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AGENTS } from "@/lib/mock/agents";
import { LivePulse } from "@/components/ui/LivePulse";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentDetailPanel } from "@/components/agents/AgentDetailPanel";

export function AgentsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  };

  const selected = selectedId
    ? AGENTS.find((a) => a.id === selectedId) ?? null
    : null;
  const activeCount = AGENTS.filter((a) => a.status === "running").length;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span
            className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "color-mix(in oklab, var(--color-ua) 12%, transparent)",
              color: "var(--color-ua)",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
              boxShadow:
                "0 0 24px color-mix(in oklab, var(--color-ua) 18%, transparent)",
            }}
          >
            <LivePulse accent="mint" size={8} />
            UA · {activeCount > 0 ? `${activeCount} running now` : "All idle"}
          </span>
          <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
            Agents{" "}
            <span
              className="block bg-clip-text text-transparent sm:inline"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, var(--color-ua) 0%, var(--color-ua-glow) 55%, var(--color-yellow) 100%)",
              }}
            >
              working for you.
            </span>
          </h2>
          <p className="flex items-center gap-2 font-body text-sm text-[color:var(--text-secondary)]">
            <LivePulse accent="mint" size={7} />
            <span>
              {AGENTS.length} agents active · last run 2 min ago
            </span>
          </p>
        </div>

        <div className="flex shrink-0">
          <NewAgentButton />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {AGENTS.map((agent, idx) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            enterIndex={idx + 1}
            expanded={selectedId === agent.id}
            onToggle={toggle}
          />
        ))}
      </section>

      {selected && (
        <section aria-label={`${selected.name} details`}>
          <AgentDetailPanel key={selected.id} agent={selected} />
        </section>
      )}
    </div>
  );
}

function NewAgentButton() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 font-body text-xs font-semibold uppercase tracking-wider text-navy opacity-60 transition-[transform,box-shadow] duration-280 ease-out-quart"
        style={{
          background: "var(--color-yellow)",
          boxShadow: "var(--shadow-yellow)",
          cursor: "not-allowed",
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        New agent
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-md px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-cloud-white opacity-0 transition-opacity duration-280 ease-out-quart group-hover:opacity-100 group-focus-within:opacity-100"
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        Coming soon
      </span>
    </span>
  );
}
