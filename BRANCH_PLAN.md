# first-real-agent-try

Hermes v0: first real Lumen agent, end to end. Paste a client email, get a yellowHEAD weekly review `.pptx`.

## Status

Phase 2 complete (yellow → resolved). Phase 3 (parse_intent hardening + adversarial fixtures) ready to start on Omer's STOP-gate sign-off.

Session notes:
- Phase 0: external vault (one-time deviation, accepted).
- Phase 1: `Sessions/first-real-agent-try/phase-1.md`.
- Phase 2: `Sessions/first-real-agent-try/phase-2.md`.

Phase-1 commits: `58fcba5..8d74b2d` (6 commits). RAG layer + agent scaffold.
Phase-2 commits: `2df9839..866528c` (3 commits). LangGraph state machine + real parse_intent + playground UI + squad fixes.
Test count: 469 → 601 (+132). All Phase 1 + 2 paths above the 80 percent statement-coverage floor.

## Plan

The branch executes nine phases under the Phase Squad protocol: one Build Agent, a parallel 5-6 agent Review Squad (Tester / Reviewer / Security / Performance / Accessibility), then a Docs Agent synthesis. STOP gate per phase.

Phase map:
0. Branch setup + prerequisite cleanup
1. Foundation — agent scaffold + RAG (`prompts/2026-05-15-rag-scaffold.md` + Supabase setup prompt)
2. Hermes skeleton — StateGraph + stub nodes
3. parse_intent (real)
4. Analyze (real, BQ + Anomstack + RAG)
5. Quill (real, citation-bound bullets)
6. Atelier (real `.pptx` render)
7. review_gate UI
8. Paste-to-draft entry point
9. Tests, polish, docs, demo

## Locked architecture

```
USER PASTES EMAIL
  └─ parse_intent (Haiku, function)
     └─ Analyze (Sonnet, subagent)
        └─ Quill (Sonnet, subagent)
           └─ Atelier (Sonnet + pptxgenjs)
              └─ review_gate (UI)
                 └─ LIOR DOWNLOADS .PPTX
```

State machine: LangGraph.js. RAG-grounded per node via `retrieve()` (Knowledge / History / Comms).

## Sources of truth

- This branch's master plan: original prompt (Omer's `Hermes v0: first real agent, end to end (with Phase Squad + Ruflo swarm)`, 2026-05-15).
- RAG scaffold: `prompts/2026-05-15-rag-scaffold.md`.
- Supabase setup: `prompts/2026-05-12-supabase-db-setup.md` (pending — to be added before Phase 1).
- Brand: `.claude/skills/yellowhead-brand/SKILL.md`.
- Product context: `CLAUDE.md`.

## Out of scope (this branch)

Gmail OAuth, python-pptx renderer, PPTEval gate, per-user auto-approve, multi-platform (iOS / Web), cross-client RAG, Hermes confidence-retry, reranker.

## Do not merge

Hold the PR in draft until Phase 9 sign-off. The branch is intentionally long-running.
