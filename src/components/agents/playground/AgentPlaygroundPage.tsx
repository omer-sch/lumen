"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Agent, AgentMemory, AgentRun } from "@/lib/mock/agents";
import { AgentIdentityHeader } from "./AgentIdentityHeader";
import { AgentGreeting } from "./AgentGreeting";
import { AgentChatInput } from "./AgentChatInput";
import { AgentTimelineMax } from "./AgentTimelineMax";
import { AgentGalleryAria } from "./AgentGalleryAria";
import { AgentDraftNova } from "./AgentDraftNova";
import { AgentToolkit } from "./AgentToolkit";
import { AgentActions } from "./AgentActions";

type AgentPlaygroundPageProps = {
  agent: Agent;
};

type Variant = {
  chatPlaceholder: string;
  chips: string[];
  stats: (agent: Agent) => string;
};

const VARIANTS: Record<"aria" | "max" | "nova", Variant> = {
  max: {
    chatPlaceholder: "Ask Max anything…",
    chips: [
      "What did you find this morning?",
      "Why is iOS CPI down?",
      "Scan again now",
      "Be more sensitive",
    ],
    stats: (a) => {
      const found = a.history.reduce((sum, r) => {
        return r.output.kind === "anomalies"
          ? sum + r.output.data.length
          : sum;
      }, 0);
      return `${a.history.length} runs · ${found} things found · ${a.costThisWeek} spent`;
    },
  },
  aria: {
    chatPlaceholder: "Tell Aria what to make…",
    chips: [
      "Make it moodier",
      "More minimal",
      "Why this style?",
    ],
    stats: (a) => {
      const scores = a.history
        .map((r) => r.score)
        .filter((s): s is number => s != null);
      const avg =
        scores.length === 0
          ? 0
          : Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
      return `${a.history.length} images · avg score ${avg} · ${a.costThisWeek} spent`;
    },
  },
  nova: {
    chatPlaceholder: "Talk to Nova…",
    chips: [
      "Make it shorter",
      "Lead with creative",
      "Draft as email",
      "Why this order?",
    ],
    stats: (a) => {
      const ratings = a.history
        .map((r) => r.rating)
        .filter((r): r is number => r != null);
      const avg =
        ratings.length === 0
          ? 0
          : ratings.reduce((s, x) => s + x, 0) / ratings.length;
      return `${a.history.length} drafts · avg rating ${avg.toFixed(1)} · ${a.costThisWeek} spent`;
    },
  },
};

type RecentMemoryEntry = {
  runId: string;
  thumbs: "up" | "down" | null;
  note: string;
  score: number;
  date: string;
  savedAt: string;
};

/**
 * Build the prompt for Aria's Hugging Face FLUX.1-schnell call. Memory rules
 * + recent thumbs/note feedback are layered into the prompt so the model
 * sees the agent's persistent learnings before each generation. Ported from
 * the original AgentsView implementation.
 *
 * Memory is the *style* (glass bulb, navy, mint, god rays). When a
 * `directive` is supplied (typed by the user in the chat input), it slots
 * in as a "Subject: …" line so the user can steer what Aria depicts
 * without losing the brand baseline.
 */
function buildAriaPrompt(
  memory: AgentMemory[],
  recentMemory: RecentMemoryEntry[],
  directive?: string,
): string {
  const rules = memory.map((m) => m.rule).join(". ");
  const trimmedDirective = directive?.trim();
  const subjectLine = trimmedDirective ? ` Subject: ${trimmedDirective}.` : "";
  const base = `Lumen AI hero image.${subjectLine} Single glass light bulb floating on deep navy background. ${rules}. Cinematic dark studio lighting, 4k photorealistic render.`;
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

const RUN_STEP: Record<string, string> = {
  aria: "Sending to Hugging Face · generating image",
  max: "Querying BigQuery · scanning 28 campaigns",
  nova: "Drafting executive summary",
};

/**
 * Per-agent full-page workspace. Reads top to bottom: breadcrumb, identity
 * header, greeting bubble, chat + chips, agent-specific main output region,
 * toolkit, two big action buttons.
 *
 * `Run now` is wired for Aria (real Hugging Face FLUX.1-schnell call,
 * appends the resulting image to history). Max and Nova have no backend
 * yet, so their Run-now is a local stub that flips status for a few
 * seconds and then returns to completed.
 *
 * Thumbs on Max's most-recent card POST to `/api/agents/max/memory` with
 * a minimal `{ runId, thumbs }` payload.
 */
export function AgentPlaygroundPage({
  agent: initialAgent,
}: AgentPlaygroundPageProps) {
  const variantKey = initialAgent.id as keyof typeof VARIANTS;
  const variant = VARIANTS[variantKey];

  const [agent, setAgent] = useState<Agent>(initialAgent);
  const [paused, setPaused] = useState<boolean>(initialAgent.paused ?? false);
  // `running` is LOCAL — only true while a Run-now call is in flight. The
  // persisted agent.status="running" (set by the listing-page tick / DB
  // seed) is reflected in the avatar ring via liveAgent below, but does
  // NOT lock the Run button. Without this, Aria's seed state ("running"
  // with no completion mechanism on this page) would leave the button
  // permanently disabled.
  const [running, setRunning] = useState<boolean>(false);

  const statsLine = useMemo(() => variant.stats(agent), [variant, agent]);

  const runAria = useCallback(
    async (currentAgent: Agent, directive?: string): Promise<void> => {
      const trimmedDirective = directive?.trim() || undefined;
      try {
        // 1. Pull recent saved feedback so the prompt can learn from it.
        let recentMemory: RecentMemoryEntry[] = [];
        try {
          const memRes = await fetch("/api/agents/aria/memory");
          if (memRes.ok) {
            const json = (await memRes.json()) as {
              entries: RecentMemoryEntry[];
            };
            recentMemory = (json.entries ?? []).slice(-5);
          }
        } catch (e) {
          console.warn("[Aria] memory fetch failed, continuing without it", e);
        }

        const prompt = buildAriaPrompt(
          currentAgent.memory,
          recentMemory,
          trimmedDirective,
        );

        // 2. Generate via Hugging Face FLUX.1-schnell.
        const res = await fetch("/api/agents/aria/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            `Aria generate failed (${res.status}): ${
              typeof body === "object" && body !== null && "error" in body
                ? String((body as { error: unknown }).error)
                : "unknown"
            }`,
          );
        }
        const { imageUrl } = (await res.json()) as { imageUrl: string };

        // 3. Prepend a new run to local history so the gallery picks it up.
        const date = new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
        });
        const newRun: AgentRun = {
          id: `aria-run-${Date.now()}`,
          date,
          note: trimmedDirective
            ? `Directive: "${trimmedDirective}" · awaiting virality score`
            : "Generated just now · awaiting virality score",
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
        setAgent((prev) => ({ ...prev, history: [newRun, ...prev.history] }));
      } catch (err) {
        console.error("[Aria] generate failed", err);
      }
    },
    [],
  );

  const handleRunNow = useCallback(() => {
    if (running) return;
    setRunning(true);
    setPaused(false);

    if (agent.id === "aria") {
      void runAria(agent).finally(() => setRunning(false));
      return;
    }
    // Max / Nova: no real backend yet — local stub.
    console.log(`[${agent.name}] Run now (local stub: ${RUN_STEP[agent.id]})`);
    window.setTimeout(() => setRunning(false), 2400);
  }, [agent, running, runAria]);

  const handleTogglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // Aria's chat directly kicks off generation with the user's text as a
  // directive layered on top of memory rules. Max / Nova don't get this
  // wiring — their chat input falls back to console-log until a real
  // backend exists for them.
  const handleChatSubmit = useCallback(
    (text: string) => {
      if (running || agent.id !== "aria") return;
      const directive = text.trim();
      if (!directive) return;
      setRunning(true);
      setPaused(false);
      void runAria(agent, directive).finally(() => setRunning(false));
    },
    [agent, running, runAria],
  );

  // POST a minimal thumbs payload to /api/agents/{id}/memory. No-op on
  // failure — the visual pressed state is the user-facing confirmation
  // and the route returns 200 in preview mode anyway.
  const handleFeedback = useCallback(
    async (runId: string, thumbs: "up" | "down", runDate: string) => {
      try {
        const res = await fetch(`/api/agents/${agent.id}/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            thumbs,
            note: "",
            score: 0,
            date: runDate,
          }),
        });
        if (!res.ok) {
          console.warn(`[${agent.name}] feedback save failed`, res.status);
        }
      } catch (err) {
        console.error(`[${agent.name}] feedback POST failed`, err);
      }
    },
    [agent.id, agent.name],
  );

  // Display copy mirrors local state. The avatar shows the mint ring
  // whenever EITHER a local Run-now is in flight OR the persisted state
  // says running (and we're not paused). The Run button reads `running`
  // directly so it stays enabled on seed-running visits.
  const visualRunning =
    running || (agent.status === "running" && !paused);
  const liveAgent: Agent = {
    ...agent,
    paused,
    status: visualRunning ? "running" : "completed",
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/agents"
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 font-body text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)] transition-colors duration-280 ease-out-quart hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Back to agents
      </Link>

      <AgentIdentityHeader
        agent={liveAgent}
        paused={paused}
        statsLine={statsLine}
      />

      <AgentGreeting greeting={agent.greeting} />

      <AgentChatInput
        agentName={agent.name}
        placeholder={variant.chatPlaceholder}
        chips={variant.chips}
        onSubmit={agent.id === "aria" ? handleChatSubmit : undefined}
        disabled={agent.id === "aria" && running}
      />

      {agent.id === "max" && (
        <AgentTimelineMax agent={agent} onFeedback={handleFeedback} />
      )}
      {agent.id === "aria" && (
        <AgentGalleryAria
          agent={agent}
          onRetry={handleRunNow}
          running={running}
        />
      )}
      {agent.id === "nova" && <AgentDraftNova agent={agent} />}

      <AgentToolkit agentName={agent.name} toolkit={agent.toolkit} />

      <AgentActions
        agentName={agent.name}
        running={running}
        paused={paused}
        onRunNow={handleRunNow}
        onTogglePause={handleTogglePause}
      />
    </div>
  );
}
