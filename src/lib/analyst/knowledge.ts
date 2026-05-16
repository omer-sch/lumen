import "server-only";

import { retrieve } from "@/lib/rag/retrieve";

import type { Intent, KnowledgeChunk } from "./types";

// Vector-lookup interface for the analyst. Two modes, gated by env:
//
//   - USE_ANALYST_KNOWLEDGE !== "on": returns []. This is the default
//     and intentional. The knowledge corpus is not yet populated
//     (OpenAI embeddings quota / alternative embedding path is its
//     own workstream). Returning [] keeps the analyst contract honest:
//     consumers get an empty array, not a stubbed lie.
//   - USE_ANALYST_KNOWLEDGE === "on": delegates to the existing
//     src/lib/rag/retrieve.ts (Supabase-backed ANN over the knowledge
//     corpus). Lets us flip the bit once embeddings are populated
//     without re-plumbing every consumer.
//
// Hermes' analyze.ts still calls retrieve() directly for its own
// rank-and-frame step in shadow / off mode; this module is the
// analyst-layer equivalent that the ReadyData contract exposes.

const DEFAULT_K = 5;

export type KnowledgeLookupArgs = {
  intent: Intent;
  /** Optional override of the default top-K. */
  k?: number;
};

export async function lookupKnowledge(
  args: KnowledgeLookupArgs,
): Promise<KnowledgeChunk[]> {
  if (process.env.USE_ANALYST_KNOWLEDGE !== "on") {
    return [];
  }

  const { intent } = args;
  const channelHint = intent.channels.join(" ");
  const query = `${intent.client} ${channelHint} ${intent.focus ?? ""} playbook ranking framing`.trim();

  try {
    const result = await retrieve({
      corpus: "knowledge",
      query,
      filters: { tags: ["playbook"] },
      k: args.k ?? DEFAULT_K,
    });
    return result.chunks.map<KnowledgeChunk>((c) => ({
      chunk_id: c.chunk_id,
      source_path: c.source_path,
      content: c.content,
      similarity: c.similarity,
    }));
  } catch (err) {
    // The corpus is sparsely populated and the embedding budget is
    // capped; a retrieve failure must never block the analyst from
    // returning ReadyData. Log and return []. The consumer that asked
    // for ReadyData still gets the rest of the contract.
    console.warn({
      event: "analyst.knowledge.error",
      message: err instanceof Error ? err.message : String(err),
      client: intent.client,
    });
    return [];
  }
}
