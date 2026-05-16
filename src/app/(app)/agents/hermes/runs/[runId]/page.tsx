import { notFound } from "next/navigation";

import { getRun } from "@/lib/agents/_scaffold/run";
import {
  HermesRunReview,
  type HermesRunData,
} from "@/components/agents/hermes/HermesRunReview";

export const metadata = { title: "Hermes draft — Lumen" };

// Server shell for the Hermes draft review surface. Loads the run from
// agent_runs.output (where the graph's completeRun call wrote the
// finalState) and renders the client review component.

export default async function HermesRunReviewRoute({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<React.ReactElement> {
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run || run.agentId !== "hermes") notFound();

  const output = (run.output ?? {}) as Record<string, unknown>;
  const intent = (output.intent ?? null) as HermesRunData["intent"];
  const bullets =
    (output.bullets as HermesRunData["bullets"] | undefined) ?? [];
  const deck =
    (output.deck as HermesRunData["deck"] | undefined) ?? {
      pptx_path: null,
      slides: [],
    };
  const approval =
    (output.approval as HermesRunData["approval"] | undefined) ?? null;
  const history =
    (output.history as HermesRunData["history"] | undefined) ?? [];

  const data: HermesRunData = {
    run_id: run.id,
    status: run.status,
    client: run.client,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    intent,
    bullets,
    deck,
    approval,
    history,
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
          Agents · Hermes · Run {data.run_id.slice(0, 8)}
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-cloud-white">
          Draft review
        </h1>
        <p className="font-body text-sm text-[color:var(--text-secondary)]">
          {data.intent
            ? `${data.intent.client} · ${data.intent.platforms.join(", ")} · ${data.intent.channels.join(", ")} · ${data.intent.period.label}`
            : "Intent unavailable"}
        </p>
      </header>
      <HermesRunReview run={data} />
    </main>
  );
}
