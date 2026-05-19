# Move discovery-script outputs into docs/data (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `move-script-outputs-to-docs-data`. One workstream, housekeeping only.

## Why

Today's top-level cleanup pass moved 7 stray `.md` files out of the project root into `prompts/`, `docs/`, and `docs/security/`. Four files were intentionally left at the root because they are written there by discovery scripts:

- `100play_schema.md` — written by `scripts/inspect-100play.ts`
- `playw3_data_review.md` — written by `scripts/review-playw3.ts`
- `LUMEN_DATA_PLAN.md` — written by `scripts/scan-and-plan.ts`
- `easy_client_discovery.md` — written by `scripts/discover-easy-client.ts`

Moving these files without updating the scripts would silently recreate the mess on the next script run. This PR fixes the scripts to write into `docs/data/` (which already exists, alongside `docs/data/bq_view_plan.md`), then moves the existing four files into their new home, then updates the one RAG manifest entry that tracks `LUMEN_DATA_PLAN.md`.

## Out of scope

- Do not change what any script does. Same data, same output content, same shape. Only the output path changes.
- Do not change `docs/data/bq_view_plan.md`. That file references `LUMEN_DATA_PLAN.md` inside its prose (line 14 today); the reference is informational, not a path the build relies on. Leave it.
- Do not move `100play_schema.md` content into a different format or shape. Same markdown, new directory.
- No new tests. Existing tests should keep passing untouched.

## File touchpoints

Four script files plus the four output markdowns plus the RAG manifest:

```
scripts/inspect-100play.ts             // write path: docs/data/100play_schema.md
scripts/review-playw3.ts               // write path: docs/data/playw3_data_review.md
scripts/scan-and-plan.ts               // write path: docs/data/LUMEN_DATA_PLAN.md
scripts/discover-easy-client.ts        // write path: docs/data/easy_client_discovery.md

100play_schema.md                      // move -> docs/data/
playw3_data_review.md                  // move -> docs/data/
LUMEN_DATA_PLAN.md                     // move -> docs/data/
easy_client_discovery.md               // move -> docs/data/

src/lib/rag/manifests/knowledge.json   // update LUMEN_DATA_PLAN.md path to docs/data/LUMEN_DATA_PLAN.md
```

## Script changes — pattern

Each script today writes to `path.resolve(process.cwd(), "<filename>.md")`. Change each to `path.resolve(process.cwd(), "docs/data/<filename>.md")` and make sure the parent directory is created if missing (most of these scripts already create directories with `fs.mkdirSync(dirname, { recursive: true })`; if not, add it).

Specifically:

- **`scripts/inspect-100play.ts`** around line 351: `const out = path.resolve(process.cwd(), "100play_schema.md");` becomes `const out = path.resolve(process.cwd(), "docs/data/100play_schema.md");`. Ensure `fs.mkdirSync(path.dirname(out), { recursive: true })` runs before `fs.writeFileSync(out, ...)`.

- **`scripts/review-playw3.ts`** around line 28: the module-level `REPORT_PATH` constant. Same change.

- **`scripts/scan-and-plan.ts`** around line 971 (the `outPath` constant) and the logger lines that mention "writing LUMEN_DATA_PLAN.md" (around lines 433 and 5 in the file header comment). Update the path; consider updating the log line and the header comment to read "writing docs/data/LUMEN_DATA_PLAN.md" so the script's self-description matches reality.

- **`scripts/discover-easy-client.ts`** around line 275: same path-resolve change.

If any script also opens or reads the file later (e.g., to append, to verify), update those calls to the new path too. Grep each script after the edit to make sure no stale `"100play_schema.md"` / `"playw3_data_review.md"` / `"LUMEN_DATA_PLAN.md"` / `"easy_client_discovery.md"` string literal remains in that file.

## RAG manifest change

In `src/lib/rag/manifests/knowledge.json`, update the `LUMEN_DATA_PLAN.md` entry:

```json
{
  "source": "repo",
  "path": "LUMEN_DATA_PLAN.md",
  "source_path": "lumen/LUMEN_DATA_PLAN.md",
  ...
}
```

becomes

```json
{
  "source": "repo",
  "path": "docs/data/LUMEN_DATA_PLAN.md",
  "source_path": "lumen/docs/data/LUMEN_DATA_PLAN.md",
  ...
}
```

`BRANCH_PLAN.md` and `FOLLOWUPS.md` were already updated to `docs/BRANCH_PLAN.md` and `docs/FOLLOWUPS.md` in today's earlier housekeeping pass. The other 100play / playw3 / easy_client outputs are not in the manifest at all, so no manifest change for them.

## File moves

After the script edits land in the working tree, `git mv` each of the four files into `docs/data/`. The `git mv` preserves history. If you prefer two commits — one for the script edits, one for the moves — that is fine; just keep them adjacent so a reviewer sees the intent.

## Acceptance

Manual:

1. Project root contains only `CLAUDE.md`, `README.md`, `SPEC.md` and the standard config / source folders. No stray `.md` files.
2. `docs/data/` contains the four moved files: `100play_schema.md`, `playw3_data_review.md`, `LUMEN_DATA_PLAN.md`, `easy_client_discovery.md`. The `bq_view_plan.md` that was already there stays.
3. Running any of the four scripts (`tsx scripts/inspect-100play.ts`, etc.) writes its output to `docs/data/<filename>.md` and does NOT write anything to the project root.

Automated:

1. `npm run typecheck` is clean (script edits are TypeScript so this catches typos).
2. `npm test` passes.
3. `npm run build` is clean.
4. `grep -nE "process\\.cwd\\(\\),\\s*\"(100play_schema|playw3_data_review|LUMEN_DATA_PLAN|easy_client_discovery)\\.md\"" -r scripts` returns no matches.

## Commit shape

Suggested: two commits on the branch.

1. `Move script outputs to docs/data/: update write paths in 4 discovery scripts and RAG manifest entry`
2. `Move existing output files into docs/data/ via git mv`

Single-commit also fine.

## Follow-up not part of this PR

None. After this lands, the top-level cleanup is fully done.
