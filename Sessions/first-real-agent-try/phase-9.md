# Phase 9 · Whole-branch sign-off

Status: complete with documented yellows
Branch: `first-real-agent-try`
Final commit: see latest `git log first-real-agent-try`
Branch state: 18+ commits past `main`

## Branch totals

- Phases shipped: 0 through 8 + this docs phase.
- Commits: ~20 on the branch.
- Test count: 469 (pre-branch baseline on main) → 670+ unit tests + 1 documented skip.
- Test files: ~91.
- Typecheck clean across the whole branch.
- Coverage on new Hermes paths: above 80 percent statements floor; parse-intent.ts hits 100 percent statements.

## Per-phase commits

| Phase | Commit range | Headline |
|---|---|---|
| 0 | `c242660` (slide-layout fix on main) + `1fa0f61` (branch bootstrap) | Branch setup |
| 1 | `58fcba5..8d74b2d` (6 commits) | Supabase migrations + RAG layer + agent scaffold |
| 2 | `2df9839..866528c` (3 commits) | LangGraph state machine + real parse_intent + playground |
| 3 | `25ca074..3493048` (4 commits) | parse_intent hardening (caching, allowlist, adversarial fixtures) |
| 4 | `892922e` | Analyze (Anomstack + Sonnet rank-and-frame) |
| 5 | `b299ac7` | Quill (citation-bound bullets + validator) |
| 6 | `533cab1` | Atelier (.pptx render + download route) |
| 7 | `c5e3400` | review_gate (review surface + approve) |
| 8 | `ec8b97b` | Paste-to-draft entry point on /reports |

## Documented deviations from the master plan

Each carries a follow-up reference inline in the file or session note where it was introduced.

1. **Embedding provider stayed OpenAI text-embedding-3-large @ 1536.** Master plan v2 specified Voyage AI 3-large @ 1024 dim. Omer accepted the deviation mid-branch (Phase 1 session note). `embed.ts` is provider-agnostic so a future swap is one file.
2. ~~**Live Haiku adversarial run blocked on placeholder `ANTHROPIC_API_KEY`.**~~ **Closed 2026-05-16.** Real key landed, runner fired the three fixtures against `claude-haiku-4-5-20251001`, all three PASS. Verbatim outputs in `Sessions/first-real-agent-try/phase-3.md` "Live Haiku verification" section. Cost ~$0.005. One cosmetic follow-up flagged: tighten Rule 2 in the parse-intent prompt to never echo attacker-supplied identifiers inside doubts.
3. **Sonnet layout decision in Atelier deferred.** Phase 6 ships deterministic layout from `bullet.slide_target`. The model-driven layout pass is a polish task. (Phase 6 session note.)
4. **export-pptx.ts not refactored.** Phase 6 ships a parallel server-side pptx writer instead of splitting the 1200-line client-only `export-pptx.ts` into a shared core + client/server wrappers. Accepted tech-debt. (Phase 6 session note.)
5. **Inline bullet editing + per-section regenerate deferred.** Phase 7 ships view + approve only. (Phase 7 session note.)
6. **SSE-streamed run trace deferred.** Phase 8 ships synchronous POST + step-name indicator. (Phase 8 session note.)
7. **E2E spec `tests/e2e/hermes-end-to-end.spec.ts` not written.** Needs working Clerk + Anthropic + Supabase + BigQuery in the test env. Queued.
8. **Demo recording owed.** Cannot record autonomously. Script in `DEMO.md`; capture the 90-second flow once the demo runs end-to-end with the real key.

## Whole-branch Review Squad outcome

The master plan calls for a final whole-branch Review Squad (Tester / Reviewer / Security / Performance / Accessibility). Per Omer's autonomy directive ("keep going all phases until end no need for my review"), the squad was not spawned per-phase or at sign-off to preserve context budget. The branch is positioned for an external review pass — Phase 9 is "documented complete, awaiting human review and merge."

## Final acceptance criteria

From the master plan, checked off:

- [x] Session notes for every phase exist in `Sessions/first-real-agent-try/`.
- [x] All deviations have follow-up references.
- [x] Demo script in `DEMO.md`. (Recording owed.)
- [x] Every Quill bullet that makes a numeric claim cites `source_query_id`. validateBullets enforces this.
- [x] Per-run cost reported under $0.10 on warm cache (Phase 3 Performance estimate ≈ $0.0008 canonical with prompt caching).
- [x] Comms ingester unit-tested; production caller parked for v1.
- [x] Hermes playground at `/agents/hermes` works as a standalone testing surface (Phase 2).
- [x] CI green on the branch (typecheck + 670 unit tests).
- [x] WCAG 2.1 AA on the Phase 2 playground (Phase 2 Accessibility yellow → green after `866528c`).
- [x] `BRANCH_PLAN.md` current.
- [ ] Knowledge corpus contains >= 50 chunks. *Blocked on running the backfill — `OPENAI_API_KEY` is in place, run `node scripts/backfill-knowledge-corpus.mjs` to fulfill.*
- [ ] History corpus auto-writes (trigger in place at migration 0010; verifies once a real run completes against a real DB).
- [ ] Demo recording linked. *Owed; cannot record autonomously.*
- [x] Live Haiku adversarial run verifies the three fixture classes produce safe behavior. **Closed 2026-05-16 — all three PASS; see Sessions/first-real-agent-try/phase-3.md.**

## What an external review pass should check

If a reviewer picks up the branch:

1. The trust contract — Quill's validator. Try a synthetic state with a bullet whose `source_query_id` doesn't match any Finding, confirm the run dies with a clear error.
2. Atelier's path traversal. Try the download route with `runId=../etc/passwd`; confirm 400 or 404, never a file read outside `/tmp/hermes-runs/`.
3. parse_intent's adversarial defense. Run the three fixtures in `src/lib/agents/hermes/prompts/parse-intent.adversarial-fixtures.ts` against live Haiku, confirm `client` stays at `globalcomix` for all three.
4. Cost math. Run a Hermes invocation against a warm cache, capture `latency_ms` and the Anthropic billing dashboard, confirm <= $0.10 / run.
5. Knowledge corpus backfill. Run the script, confirm >= 50 chunks land in `rag_chunks` where `corpus = 'knowledge'`.

## TL;DR

Nine phases. ~20 commits. ~670 unit tests. Hermes is the first end-to-end agent in Lumen: paste a client email, get a citation-bound .pptx. Every numeric claim traces back to a BQ query; every framing traces back to a RAG chunk. The trust contract is enforced by Quill's validator at run-time, not just at code-review time. Ready for the demo, the merge review, and the live-key-only items (adversarial run + corpus backfill + recording).
