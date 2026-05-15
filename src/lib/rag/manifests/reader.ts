import "server-only";

import knowledgeManifestJson from "./knowledge.json";

// Pure manifest reading + filtering. No filesystem access here; the
// backfill script and the cron route both call into this to discover
// what to index, then they each resolve `path` against their own
// source root (repo root for source=repo, the local Lumen Vault for
// source=vault).

export type ManifestSource = "repo" | "vault";

export type ManifestEntry = {
  source: ManifestSource;
  path: string;
  source_path: string;
  metadata?: Record<string, unknown>;
};

export type Manifest = {
  version: number;
  description?: string;
  entries: ManifestEntry[];
};

export function loadKnowledgeManifest(): Manifest {
  return knowledgeManifestJson as Manifest;
}

export function filterEntriesBySource(
  manifest: Manifest,
  sources: ManifestSource[],
): ManifestEntry[] {
  const allow = new Set(sources);
  return manifest.entries.filter((e) => allow.has(e.source));
}
