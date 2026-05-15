import "server-only";

import { chunkMarkdown } from "@/lib/rag/chunk";

import { type IndexResult, upsertRagChunks } from "./_upsert";

// The Knowledge corpus holds yellowHEAD playbooks, post-mortems,
// strategic context, brand snippets — anything an agent should be able
// to ground its claims in. Sourced primarily from the Lumen Vault.
// Indexed manually via /api/rag/index and on a 0 5 UTC cron sweep.

export type KnowledgeMetadata = {
  client?: string;
  channel?: string;
  platform?: string;
  date?: string;
  tags?: string[];
  [key: string]: unknown;
};

export type IndexKnowledgeArgs = {
  source_path: string;
  content: string;
  metadata?: KnowledgeMetadata;
};

export async function indexKnowledgeDocument(
  args: IndexKnowledgeArgs,
): Promise<IndexResult> {
  const chunks = chunkMarkdown(args.content).map((c) => ({
    chunk_id: c.chunk_id,
    content: c.content,
    metadata: args.metadata ?? {},
  }));
  return upsertRagChunks("knowledge", args.source_path, chunks);
}
