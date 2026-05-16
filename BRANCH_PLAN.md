# first-real-agent-try

Hermes v0: first real Lumen agent, end to end. Paste a client email, get a yellowHEAD weekly review `.pptx`.

## Status

**All nine phases complete.** Branch is ready for external review + merge. Whole-branch Review Squad was deferred per Omer's autonomy directive; positioned for an external pass.

## Per-phase commits

| Phase | Commit / range | Session note |
|---|---|---|
| 0 | `1fa0f61` (branch bootstrap) | external vault (one-time deviation) |
| 1 | `58fcba5..8d74b2d` (6 commits) | `Sessions/first-real-agent-try/phase-1.md` |
| 2 | `2df9839..866528c` (3 commits) | `Sessions/first-real-agent-try/phase-2.md` |
| 3 | `25ca074..3493048` (4 commits) | `Sessions/first-real-agent-try/phase-3.md` |
| 4 | `892922e` | `Sessions/first-real-agent-try/phase-4.md` |
| 5 | `b299ac7` | `Sessions/first-real-agent-try/phase-5.md` |
| 6 | `533cab1` | `Sessions/first-real-agent-try/phase-6.md` |
| 7 | `c5e3400` | `Sessions/first-real-agent-try/phase-7.md` |
| 8 | `ec8b97b` | `Sessions/first-real-agent-try/phase-8.md` |
| 9 | (docs commit) | `Sessions/first-real-agent-try/phase-9.md` |

## Locked architecture

```
USER PASTES EMAIL
  └─ parse_intent (Haiku, function)
     └─ Analyze (Sonnet, subagent)
        └─ Quill (Sonnet, subagent)
           └─ Atelier (deterministic + pptxgenjs)
              └─ review_gate (UI · view + approve)
                 └─ LIOR DOWNLOADS .PPTX
```

State machine: LangGraph.js `Annotation.Root` with per-field reducers. RAG-grounded per node via `retrieve()` (Knowledge / History / Comms corpora).

## Test posture

- 670 unit tests + 1 documented skip across 91 files.
- Typecheck clean.
- Coverage on Hermes paths above the 80 percent statements floor; parse-intent.ts at 100 percent.

## Open work (handed back to Omer)

1. **Wire a real `ANTHROPIC_API_KEY`** so the Phase 3 live Haiku adversarial run can convert from yellow to green.
2. **Run the Knowledge corpus backfill**: `CRON_SECRET=… LUMEN_VAULT_PATH="…/Lumen Vault" node scripts/backfill-knowledge-corpus.mjs` (with the dev server up). Acceptance: ≥ 50 chunks in `rag_chunks where corpus='knowledge'`.
3. **Open the draft PR** if `gh` is now authenticated: `https://github.com/omer-sch/feature/first-real-agent-try` (or via the web). The branch is at the head listed in `git log`.
4. **Record the demo** per `DEMO.md`. Link the recording from `Sessions/first-real-agent-try/phase-9.md` once captured.
5. **Spawn the external whole-branch Review Squad** (Tester / Reviewer / Security / Performance / Accessibility) when convenient. Phase 9 lists the five concrete things a reviewer should check.

## Out of scope (this branch)

Gmail OAuth · python-pptx renderer · PPTEval gate · per-user auto-approve · multi-platform (iOS / Web for non-android workflows) · cross-client RAG · Hermes confidence-retry · reranker · SSE-streamed paste modal · inline bullet edit · per-section regenerate.

## Files of note

- `prompts/2026-05-15-rag-scaffold.md` — Phase 1 driver.
- `src/lib/agents/hermes/prompts/` — externalized Sonnet prompts (parse-intent, analyze, quill).
- `src/lib/agents/hermes/anomstack.ts` — deterministic anomaly detector.
- `src/lib/agents/hermes/nodes/` — five LangGraph nodes.
- `src/app/(app)/agents/hermes/` — playground + run-review pages.
- `src/app/api/agents/hermes/` — generate, runs/{id}/download, runs/{id}/approve.
- `Sessions/first-real-agent-try/phase-*.md` — every phase's record.
- `DEMO.md` — 90-second demo script.
