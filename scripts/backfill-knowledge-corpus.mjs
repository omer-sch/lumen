#!/usr/bin/env node
// Backfill the knowledge corpus from the manifest.
//
// Usage:
//   CRON_SECRET=... node scripts/backfill-knowledge-corpus.mjs
//   LUMEN_VAULT_PATH="/Users/.../Lumen Vault" \
//     CRON_SECRET=... \
//     node scripts/backfill-knowledge-corpus.mjs
//
// What this does:
//   - Reads the manifest at src/lib/rag/manifests/knowledge.json
//   - For each entry with source=repo, reads from <repo>/<path>
//   - For each entry with source=vault, reads from <LUMEN_VAULT_PATH>/<path>
//     (vault entries are skipped if LUMEN_VAULT_PATH is unset)
//   - Posts the content to POST /api/rag/index with the x-backfill-secret
//     header so no Clerk session is needed
//
// Requires the local dev server to be running (LUMEN_APP_URL, default
// http://localhost:3001) AND OPENAI_API_KEY to be present in
// .env.local (the embedder dies loud otherwise, which is the correct
// failure mode).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.resolve(
  repoRoot,
  "src/lib/rag/manifests/knowledge.json",
);

const APP_URL = process.env.LUMEN_APP_URL ?? "http://localhost:3001";
const CRON_SECRET = process.env.CRON_SECRET;
const VAULT_PATH = process.env.LUMEN_VAULT_PATH;

if (!CRON_SECRET) {
  console.error(
    "CRON_SECRET env var required (same value as in .env.local / Vercel).",
  );
  process.exit(1);
}

const manifestRaw = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);

const entries = manifest.entries.filter(
  (e) => e.source === "repo" || (e.source === "vault" && VAULT_PATH),
);
const skippedVaultCount = manifest.entries.filter(
  (e) => e.source === "vault" && !VAULT_PATH,
).length;

if (skippedVaultCount > 0) {
  console.log(
    `Note: skipping ${skippedVaultCount} vault entries (LUMEN_VAULT_PATH not set).`,
  );
}

let total_chunks = 0;
let total_cost = 0;
let total_tokens = 0;
const failures = [];

for (const entry of entries) {
  const sourceRoot = entry.source === "repo" ? repoRoot : VAULT_PATH;
  const absolute = path.resolve(sourceRoot, entry.path);

  let content;
  try {
    content = await readFile(absolute, "utf8");
  } catch (err) {
    failures.push({ source_path: entry.source_path, error: err.message });
    console.error(`! ${entry.source_path}: ${err.message}`);
    continue;
  }

  let res;
  try {
    res = await fetch(`${APP_URL}/api/rag/index`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-backfill-secret": CRON_SECRET,
      },
      body: JSON.stringify({
        corpus: "knowledge",
        source_path: entry.source_path,
        content,
        metadata: entry.metadata,
      }),
    });
  } catch (err) {
    failures.push({ source_path: entry.source_path, error: err.message });
    console.error(`! ${entry.source_path}: ${err.message}`);
    continue;
  }

  if (!res.ok) {
    const text = await res.text();
    failures.push({
      source_path: entry.source_path,
      error: `HTTP ${res.status}: ${text}`,
    });
    console.error(`! ${entry.source_path}: HTTP ${res.status}`);
    continue;
  }

  const data = await res.json();
  total_chunks += data.chunks_indexed;
  total_cost += data.cost_usd;
  total_tokens += data.embedding_tokens;
  console.log(
    `+ ${entry.source_path}: ${data.chunks_indexed} chunks, $${data.cost_usd.toFixed(6)}`,
  );
}

console.log("");
console.log("Backfill complete:");
console.log(`  Entries processed: ${entries.length}`);
console.log(`  Total chunks:      ${total_chunks}`);
console.log(`  Total tokens:      ${total_tokens}`);
console.log(`  Total cost:        $${total_cost.toFixed(4)}`);
if (failures.length > 0) {
  console.log(`  Failures:          ${failures.length}`);
  for (const f of failures) {
    console.log(`    - ${f.source_path}: ${f.error}`);
  }
  process.exit(1);
}
