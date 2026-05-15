// Layer 2 (lib unit). File under test:
// src/lib/rag/manifests/reader.ts. The manifest is a checked-in JSON
// file with a fixed shape; we lock the contract here so a hand-edit
// that breaks the indexers gets caught at CI.
import { describe, expect, it } from "vitest";

import {
  filterEntriesBySource,
  loadKnowledgeManifest,
  type ManifestEntry,
} from "@/lib/rag/manifests/reader";

describe("loadKnowledgeManifest", () => {
  const manifest = loadKnowledgeManifest();

  it("has version 1", () => {
    expect(manifest.version).toBe(1);
  });

  it("has at least one repo entry and one vault entry", () => {
    const repo = filterEntriesBySource(manifest, ["repo"]);
    const vault = filterEntriesBySource(manifest, ["vault"]);
    expect(repo.length).toBeGreaterThan(0);
    expect(vault.length).toBeGreaterThan(0);
  });

  it("every entry has a unique source_path", () => {
    const seen = new Set<string>();
    for (const e of manifest.entries) {
      expect(seen.has(e.source_path)).toBe(false);
      seen.add(e.source_path);
    }
  });

  it("every entry has a valid source field", () => {
    for (const e of manifest.entries) {
      expect(["repo", "vault"]).toContain(e.source);
    }
  });

  it("repo entries do not start their paths with a leading slash", () => {
    const repo = filterEntriesBySource(manifest, ["repo"]);
    for (const e of repo) {
      expect(e.path.startsWith("/")).toBe(false);
    }
  });

  it("vault entries also avoid leading slashes (resolved against LUMEN_VAULT_PATH)", () => {
    const vault = filterEntriesBySource(manifest, ["vault"]);
    for (const e of vault) {
      expect(e.path.startsWith("/")).toBe(false);
    }
  });
});

describe("filterEntriesBySource", () => {
  const fake = {
    version: 1,
    entries: [
      { source: "repo", path: "a", source_path: "a" } as ManifestEntry,
      { source: "vault", path: "b", source_path: "b" } as ManifestEntry,
      { source: "repo", path: "c", source_path: "c" } as ManifestEntry,
    ],
  };

  it("filters to one source", () => {
    expect(filterEntriesBySource(fake, ["repo"])).toHaveLength(2);
    expect(filterEntriesBySource(fake, ["vault"])).toHaveLength(1);
  });

  it("filters to multiple sources", () => {
    expect(filterEntriesBySource(fake, ["repo", "vault"])).toHaveLength(3);
  });

  it("returns empty array when no sources match", () => {
    expect(filterEntriesBySource(fake, [])).toHaveLength(0);
  });
});
