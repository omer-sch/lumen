import "server-only";

import { z } from "zod";

import { supabaseAdmin } from "@/lib/db/client";

import { embed } from "./embed";

// Single entry point for every agent that needs grounded context.
// Validates args (throws on bad input), embeds the query, runs HNSW +
// JSONB pre-filter ANN via the match_rag_chunks RPC, and returns chunks
// plus citation pointers. Server-side only; the service-role Supabase
// client bypasses RLS, so per-user scoping happens in agent code via
// the `filters` argument (e.g. filter by client).

export const RetrieveArgs = z.object({
  corpus: z.enum(["knowledge", "history", "comms", "benchmarks"]),
  query: z.string().min(1),
  filters: z
    .object({
      client: z.string().optional(),
      channel: z.string().optional(),
      platform: z.string().optional(),
      date_range: z.tuple([z.string(), z.string()]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .default({}),
  k: z.number().int().min(1).max(50).default(10),
});

export type RetrieveArgsType = z.infer<typeof RetrieveArgs>;

export type RetrievedChunk = {
  chunk_id: string;
  source_path: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
};

export type Citation = { source_path: string; chunk_id: string };

export type RetrieveResult = {
  chunks: RetrievedChunk[];
  citations: Citation[];
  /** Number of chunks returned (after ANN + filter). Not the corpus size searched. */
  chunks_returned: number;
  latency_ms: number;
  query_embedding_cost_usd: number;
};

type MatchRow = {
  id: string;
  chunk_id: string;
  source_path: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

export async function retrieve(
  args: z.input<typeof RetrieveArgs>,
): Promise<RetrieveResult> {
  const parsed = RetrieveArgs.parse(args);
  const startedAt = Date.now();

  const { vector, cost_usd } = await embed(parsed.query);

  // pgvector accepts a JSON array via PostgREST. The supabase-js rpc
  // signature is loosely typed (Functions returns never in our
  // generated types), so we cast through unknown rather than fighting
  // the inferred parameter type.
  const rpcArgs = {
    query_embedding: vector,
    match_corpus: parsed.corpus,
    match_count: parsed.k,
    filter_client: parsed.filters.client ?? null,
    filter_channel: parsed.filters.channel ?? null,
    filter_platform: parsed.filters.platform ?? null,
    filter_date_from: parsed.filters.date_range?.[0] ?? null,
    filter_date_to: parsed.filters.date_range?.[1] ?? null,
    filter_tags: parsed.filters.tags ?? null,
  };

  const { data, error } = await supabaseAdmin().rpc(
    "match_rag_chunks" as never,
    rpcArgs as never,
  );

  if (error) {
    throw new Error(`retrieve failed: ${error.message}`);
  }

  const rows = (data as MatchRow[] | null) ?? [];

  const chunks: RetrievedChunk[] = rows.map((row) => ({
    chunk_id: row.chunk_id,
    source_path: row.source_path,
    content: row.content,
    similarity: row.similarity,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }));

  const citations: Citation[] = chunks.map((c) => ({
    source_path: c.source_path,
    chunk_id: c.chunk_id,
  }));

  return {
    chunks,
    citations,
    chunks_returned: chunks.length,
    latency_ms: Date.now() - startedAt,
    query_embedding_cost_usd: cost_usd,
  };
}
