import "server-only";

import { chunkMarkdown } from "@/lib/rag/chunk";

import { type IndexResult, upsertRagChunks } from "./_upsert";

// The History corpus auto-writes when an agent_runs row transitions to
// status=completed. Quill reads History when drafting a new deck so its
// tone matches recent runs for the same client + channel.
//
// Callers shape the run's content into a text blob suitable for
// embedding (typically the bullets/findings as markdown). The trigger
// route at /api/rag/index-history is the production entry point; this
// function is also callable directly from agent code or tests.

export type IndexAgentRunArgs = {
  agent: string;
  run_id: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export async function indexAgentRunOutput(
  args: IndexAgentRunArgs,
): Promise<IndexResult> {
  const meta = {
    agent: args.agent,
    run_id: args.run_id,
    ...(args.metadata ?? {}),
  };
  const chunks = chunkMarkdown(args.content).map((c) => ({
    chunk_id: c.chunk_id,
    content: c.content,
    metadata: meta,
  }));
  return upsertRagChunks("history", `agent_runs/${args.run_id}`, chunks);
}
