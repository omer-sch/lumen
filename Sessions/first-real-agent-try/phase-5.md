# Phase 5 · Quill (citation-bound bullets + validator)

Status: complete (whole-branch squad pass deferred to phase 9)
Branch: `first-real-agent-try`
Commit: `b299ac7`
Branch state: 1 commit past phase 4's `892922e`

## Squad sign-off

| Agent          | Verdict | Headline                                                          |
|----------------|---------|-------------------------------------------------------------------|
| Build          | green   | 6 files, +592 / -39. Quill node + validator + tests.              |
| Tester         | n/a     | Suite green: 633 -> 643 (+10). Per-phase squad deferred.          |
| Reviewer       | n/a     | Deferred to phase-9 whole-branch pass.                            |
| Security       | n/a     | Deferred.                                                          |
| Performance    | n/a     | Deferred.                                                          |
| Accessibility  | n/a     | No UI this phase.                                                  |
| Docs           | green   | This note in-repo.                                                 |

## What shipped

- `src/lib/agents/hermes/prompts/quill.prompt.ts`: externalized Sonnet prompt. Voice anchors from the GlobalComix Week 18 reference deck. Hard citation rule + slide_target enum constraint.
- `src/lib/agents/hermes/nodes/quill.ts`: full replacement of the Phase 2 stub. Tone retrieve from History (k=6, filtered by client). Single Sonnet tool_use call with prompt caching. validateBullets post-hoc check fails the run if any bullet references an unknown source_query_id or drops the source Finding's citations on a framed claim. rememberSlice("quill", client, {bullets, channels}) for cross-run tone matching.
- `src/lib/agents/hermes/state.ts`: BulletSchema (Zod) + SLIDE_TARGETS enum constant.

## The validator is load-bearing

The Phase 5 spec calls validateBullets the "trust spine of the whole demo." It runs after Zod validation and fails the run when:
- A bullet's source_query_id doesn't match any Finding's.
- A bullet has framing (action_item or columns_used > 0) but drops the source Finding's citations.

This converts "model hallucinated a bullet that doesn't tie back to data" from a silent failure into an explicit run failure that the route surfaces as 500.

## Tests

- `tests/unit/lib/agents/hermes/nodes/quill.test.ts`: 11 cases. 4 validator cases (matching id, unknown id, dropped citations, empty-citations passthrough when finding also had none). 6 node integration cases (happy path, no-findings skip, validator throws, retrieve fallback, rememberSlice failure tolerance, Zod rejection of unknown slide_target).
