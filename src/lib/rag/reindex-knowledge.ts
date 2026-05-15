import "server-only";

import { createHash } from "node:crypto";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

import { supabaseAdmin } from "@/lib/db/client";
import { indexKnowledgeDocument } from "@/lib/rag/indexers/knowledge";
import type { ManifestEntry } from "@/lib/rag/manifests/reader";

// Reader is injectable so unit tests don't have to mock node:fs/promises,
// which is brittle with vi.mock against built-in modules. Production
// uses fsReadFile; tests pass a fake reader.
export type SourceReader = (absolutePath: string) => Promise<string>;

const defaultReader: SourceReader = (p) => fsReadFile(p, "utf8");

export type EntryResult = {
  source_path: string;
  status: "indexed" | "unchanged" | "missing" | "error";
  chunks_indexed?: number;
  cost_usd?: number;
  error?: string;
};

export type ReindexResult = {
  processed: number;
  chunks_indexed: number;
  cost_usd: number;
  results: EntryResult[];
};

function sha256Prefix(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

async function latestIndexedPrefix(
  sourcePath: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("rag_chunks")
    .select("chunk_id")
    .eq("corpus", "knowledge")
    .eq("source_path", sourcePath)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const chunkId = data[0].chunk_id;
  const dash = chunkId.indexOf("-");
  return dash > 0 ? chunkId.slice(0, dash) : chunkId;
}

export async function processManifestEntry(
  entry: ManifestEntry,
  sourceRoot: string,
  reader: SourceReader = defaultReader,
): Promise<EntryResult> {
  try {
    const absolute = path.resolve(sourceRoot, entry.path);
    const content = await reader(absolute);
    const prefix = sha256Prefix(content);
    const indexed = await latestIndexedPrefix(entry.source_path);
    if (indexed === prefix) {
      return { source_path: entry.source_path, status: "unchanged" };
    }
    const r = await indexKnowledgeDocument({
      source_path: entry.source_path,
      content,
      metadata: entry.metadata,
    });
    return {
      source_path: entry.source_path,
      status: "indexed",
      chunks_indexed: r.chunks_indexed,
      cost_usd: r.cost_usd,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT")) {
      return {
        source_path: entry.source_path,
        status: "missing",
        error: message,
      };
    }
    return { source_path: entry.source_path, status: "error", error: message };
  }
}

export async function reindexEntries(
  entries: ManifestEntry[],
  sourceRoot: string,
  reader: SourceReader = defaultReader,
): Promise<ReindexResult> {
  const results: EntryResult[] = [];
  let totalIndexed = 0;
  let totalCost = 0;
  for (const entry of entries) {
    const r = await processManifestEntry(entry, sourceRoot, reader);
    results.push(r);
    if (r.status === "indexed") {
      totalIndexed += r.chunks_indexed ?? 0;
      totalCost += r.cost_usd ?? 0;
    }
  }
  return {
    processed: results.length,
    chunks_indexed: totalIndexed,
    cost_usd: totalCost,
    results,
  };
}
