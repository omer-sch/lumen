"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type Agent, type AgentRun } from "@/lib/mock/agents";
import { LivePulse } from "@/components/ui/LivePulse";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentDetailPanel } from "@/components/agents/AgentDetailPanel";

/** Per-tick progress increment for running agents. ~2% every 220ms = ~11s
 *  to complete from 0, ~4s to complete from 62 (Aria's starting state). */
const TICK_MS = 220;
const PROGRESS_STEP = 2;

/** Opening step text used when "Run now" kicks off a fresh run. Each agent
 *  has a sensible default that the progress bar will surface. */
const RUN_STEP: Record<string, string> = {
  aria: "Sending to Flux · generating image",
  max: "Querying BigQuery · scanning 28 campaigns",
  nova: "Drafting executive summary",
};

type RecentMemoryEntry = {
  runId: string;
  thumbs: "up" | "down" | null;
  note: string;
  score: number;
  date: string;
  savedAt: string;
};

function buildAriaPrompt(
  agent: Agent,
  recentMemory: RecentMemoryEntry[],
): string {
  const rules = agent.memory.map((m) => m.rule).join(". ");
  const base = `Lumen AI hero image. Single glass light bulb floating on deep navy background. ${rules}. Cinematic dark studio lighting, 4k photorealistic render.`;

  const noted = recentMemory.filter((e) => e.note.trim());
  if (noted.length === 0) return base;

  const feedback = noted
    .map(
      (e) =>
        `[${e.thumbs === "up" ? "GOOD" : "BAD"}, ${e.score}/10] ${e.note}`,
    )
    .join(" | ");
  return `${base} Recent feedback: ${feedback}`;
}

type AgentsViewProps = {
  /** Hydrated by the page server component from Postgres. The client
   *  state mirrors this and then evolves locally (progress tick, pause,
   *  Run-now) without further server roundtrips for the demo. */
  initialAgents: Agent[];
};

export function AgentsView({ initialAgents }: AgentsViewProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Tick effect — advance any running, unpaused agent's progress. When a run
  // crosses 100%, transition the agent back to "completed" with a fresh
  // last-run line. We don't synthesize a full run record here; the existing
  // mock history stays stable so the demo reads consistently across reloads.
  useEffect(() => {
    const id = window.setInterval(() => {
      setAgents((prev) =>
        prev.map((a) => {
          if (a.status !== "running" || a.paused || !a.liveRun) return a;
          const next = a.liveRun.progress + PROGRESS_STEP;
          if (next >= 100) {
            return {
              ...a,
              status: "completed" as const,
              liveRun: undefined,
              lastRun: "Completed · just now",
              totalRuns: a.totalRuns + 1,
            };
          }
          return {
            ...a,
            liveRun: { progress: next, step: a.liveRun.step },
          };
        }),
      );
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const toggle = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  };

  const handlePauseToggle = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, paused: !a.paused } : a)),
    );
  };

  const handleRunNow = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        if (a.status === "running" && !a.paused) return a;
        return {
          ...a,
          status: "running" as const,
          paused: false,
          lastRun: "Running now · just kicked off",
          liveRun: {
            progress: 0,
            step: RUN_STEP[a.id] ?? "Starting up...",
          },
        };
      }),
    );

    if (id === "aria") {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;

      (async () => {
        try {
          const memRes = await fetch(`/api/agents/${agent.id}/memory`);
          const { entries } = (await memRes.json()) as {
            entries: RecentMemoryEntry[];
          };
          const recentMemory = entries.slice(-5);
          const prompt = buildAriaPrompt(agent, recentMemory);

          const res = await fetch("/api/agents/aria/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
          const { imageUrl } = (await res.json()) as {
            imageUrl: string;
            seed?: number;
          };

          const date = new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
          });
          const newRun: AgentRun = {
            id: `aria-run-${Date.now()}`,
            date,
            note: "Generated just now · awaiting virality score",
            output: {
              kind: "image",
              data: {
                title: `Generated · ${date}`,
                palette: {
                  from: "var(--color-ua)",
                  to: "var(--color-yellow)",
                },
                composition: prompt,
                imageUrl,
              },
            },
          };
          setAgents((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, history: [newRun, ...a.history] } : a,
            ),
          );
        } catch (err) {
          console.error("Aria generate failed", err);
        }
      })();
    }
  };

  const selected = selectedId
    ? agents.find((a) => a.id === selectedId) ?? null
    : null;
  const activeCount = agents.filter(
    (a) => a.status === "running" && !a.paused,
  ).length;

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
              {agents.length} agents active · {activeCount > 0 ? "live" : "last run 2 min ago"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0">
          <NewAgentButton />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {agents.map((agent, idx) => (
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
          <AgentDetailPanel
            key={selected.id}
            agent={selected}
            onPauseToggle={handlePauseToggle}
            onRunNow={handleRunNow}
          />
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
