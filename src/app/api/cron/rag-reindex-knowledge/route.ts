import "server-only";

import { NextRequest, NextResponse } from "next/server";

import {
  filterEntriesBySource,
  loadKnowledgeManifest,
} from "@/lib/rag/manifests/reader";
import { reindexEntries } from "@/lib/rag/reindex-knowledge";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily Knowledge re-scan. Processes only `source: "repo"` entries
// because the deployed function has no filesystem access to the local
// vault. Vault entries are processed manually via
// `scripts/backfill-knowledge-corpus.mjs`. The hard work lives in
// `src/lib/rag/reindex-knowledge.ts` so this route is a thin auth +
// dispatch shell.

function isValidSecret(provided: string): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  if (expected.length !== provided.length) {
    let diff = 1;
    const len = Math.max(expected.length, provided.length, 32);
    for (let i = 0; i < len; i++) {
      diff |= (expected.charCodeAt(i) || 0) ^ (provided.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!isValidSecret(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const manifest = loadKnowledgeManifest();
  const repoEntries = filterEntriesBySource(manifest, ["repo"]);

  const start = Date.now();
  const result = await reindexEntries(repoEntries, process.cwd());

  console.info({
    event: "rag.cron.reindex_knowledge",
    entries: repoEntries.length,
    indexed: result.results.filter((r) => r.status === "indexed").length,
    unchanged: result.results.filter((r) => r.status === "unchanged").length,
    missing: result.results.filter((r) => r.status === "missing").length,
    errors: result.results.filter((r) => r.status === "error").length,
    chunks_indexed: result.chunks_indexed,
    cost_usd: result.cost_usd,
    latencyMs: Date.now() - start,
  });

  return NextResponse.json(result);
}
