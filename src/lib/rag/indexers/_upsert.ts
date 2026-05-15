import "server-only";

import { supabaseAdmin } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { embedBatch } from "@/lib/rag/embed";

// Shared internal helper: given pre-prepared chunks for a single
// (corpus, source_path) target, embed and upsert in one round-trip per
// step. Returns the cost/token accounting up. Indexer wrappers
// (knowledge / history / comms) call this; nothing outside src/lib/rag
// should import it directly.

export type Corpus = "knowledge" | "history" | "comms" | "benchmarks";

export type PreparedChunk = {
  chunk_id: string;
  content: string;
  metadata: Record<string, unknown>;
};

export type IndexResult = {
  chunks_indexed: number;
  embedding_tokens: number;
  cost_usd: number;
};

function vectorLiteral(vec: number[]): string {
  // pgvector accepts a quoted string literal `[1,2,3]` over PostgREST.
  // The supabase-js client serialises the column value as-is, so we
  // format here rather than at insert time.
  return `[${vec.join(",")}]`;
}

export async function upsertRagChunks(
  corpus: Corpus,
  source_path: string,
  chunks: PreparedChunk[],
): Promise<IndexResult> {
  if (chunks.length === 0) {
    return { chunks_indexed: 0, embedding_tokens: 0, cost_usd: 0 };
  }

  const { vectors, total_tokens, total_cost_usd } = await embedBatch(
    chunks.map((c) => c.content),
  );

  // Caller metadata is `Record<string, unknown>` so the public API
  // doesn't drag the recursive Json type through every indexer. Cast
  // at the boundary; Supabase will serialise as JSON and any genuinely
  // non-JSON value would fail at runtime, which is the correct failure
  // mode (no metadata shape we actually want includes Date / Promise
  // / Map / etc).
  const rows = chunks.map((c, i) => ({
    corpus,
    source_path,
    chunk_id: c.chunk_id,
    content: c.content,
    embedding: vectorLiteral(vectors[i] ?? []),
    metadata: c.metadata as Json,
  }));

  const { error } = await supabaseAdmin()
    .from("rag_chunks")
    .upsert(rows, { onConflict: "corpus,source_path,chunk_id" });

  if (error) {
    throw new Error(`rag_chunks upsert failed: ${error.message}`);
  }

  return {
    chunks_indexed: chunks.length,
    embedding_tokens: total_tokens,
    cost_usd: total_cost_usd,
  };
}
