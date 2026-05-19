# first-real-agent-try

Hermes v0: first real Lumen agent, end to end. Paste a client email, get a yellowHEAD weekly review `.pptx`.

## Status

**Ready for merge.** All nine phases shipped, the whole-branch merge-review squad ran and signed off green, every must-fix landed. Two yellows accepted as documented (parse_intent worst-case cost edges over its sub-budget but the pipeline ceiling holds; test-env time rose without breaking the wall-clock budget).

## Per-phase commits

| Phase | Commit / range | Session note |
|---|---|---|
| 0 | `1fa0f61` (branch bootstrap) | external vault (one-time deviation, accepted) |
| 1 | `58fcba5..8d74b2d` (6 commits) | `Sessions/first-real-agent-try/phase-1.md` |
| 2 | `2df9839..866528c` (3 commits) | `Sessions/first-real-agent-try/phase-2.md` |
| 3 | `25ca074..3493048` (4 commits) | `Sessions/first-real-agent-try/phase-3.md` |
| 4 | `892922e` | `Sessions/first-real-agent-try/phase-4.md` |
| 5 | `b299ac7` | `Sessions/first-real-agent-try/phase-5.md` |
| 6 | `533cab1` | `Sessions/first-real-agent-try/phase-6.md` |
| 7 | `c5e3400` | `Sessions/first-real-agent-try/phase-7.md` |
| 8 | `ec8b97b` | `Sessions/first-real-agent-try/phase-8.md` |
| 9 | (docs) | `Sessions/first-real-agent-try/phase-9.md` |
| merge-review | `ff37ce1..5a1528a` (3 commits) | `Sessions/first-real-agent-try/phase-merge-review.md` |

## Locked architecture

```
USER PASTES EMAIL
  parse_intent (Haiku, function)
     Analyze (Sonnet, BQ + Anomstack + RAG)
        Quill (Sonnet, citation validator load-bearing)
           Atelier (deterministic + pptxgenjs)
              review_gate (UI, view + approve)
                 DOWNLOADS .PPTX
```

State machine: LangGraph.js `Annotation.Root` with per-field reducers. RAG-grounded per node via `retrieve()` against Knowledge / History / Comms corpora.

## Test posture (final)

- 674 unit tests + 1 documented skip across 91 files.
- Typecheck clean.
- Production build clean (the pre-existing pptxgenjs `node:*` blocker is fixed by the `IgnorePlugin` in `next.config.ts`).
- Scoped coverage: stmts 72.28, branches 60.23, funcs 73.78, lines 73.65 on `src/lib/**`, `src/app/api/**`, `src/middleware.ts`, and the Hermes UI surfaces. Comfortably above the 65/45/64/65 floor.
- parse-intent.ts at 100 percent statements.

## Open work (handed back to Omer)

1. **OpenAI quota** is exceeded (`429 You exceeded your current quota` on the embed probe). Top up to unblock the Knowledge corpus backfill.
2. **Knowledge corpus backfill**: `LUMEN_APP_URL=http://localhost:3000 LUMEN_VAULT_PATH="…/Lumen Vault" node --env-file=.env.local scripts/backfill-knowledge-corpus.mjs` once OpenAI has headroom. Acceptance: >= 50 chunks in `rag_chunks where corpus='knowledge'`.
3. **Demo recording** per `DEMO.md`.
4. **Owner-tracking column on agent_runs** to lift the admin-only gate on download + approve. Tracked as a Phase 9+ task; not blocking the demo since Hermes is admin-only by team today.
5. **Open the PR** at https://github.com/omer-sch/lumen/pull/new/first-real-agent-try (gh is not authenticated here).

## Out of scope (this branch)

Gmail OAuth, python-pptx renderer, PPTEval gate, per-user auto-approve, multi-platform (iOS / Web for non-android workflows), cross-client RAG, Hermes confidence-retry, reranker, SSE-streamed paste modal, inline bullet edit, per-section regenerate, Voyage AI swap.

## Files of note

- `prompts/2026-05-15-rag-scaffold.md`, Phase 1 driver.
- `src/lib/agents/hermes/prompts/`, externalized Sonnet prompts (parse-intent, analyze, quill).
- `src/lib/agents/hermes/anomstack.ts`, deterministic anomaly detector.
- `src/lib/agents/hermes/nodes/`, five LangGraph nodes.
- `src/app/(app)/agents/hermes/`, playground + run-review pages.
- `src/app/api/agents/hermes/`, generate, runs/{id}/download, runs/{id}/approve.
- `src/components/reports/DraftFromEmailModal.tsx`, paste-to-draft entry point.
- `Sessions/first-real-agent-try/phase-*.md`, every phase's record plus the merge-review note.
- `DEMO.md`, 90-second demo script.
