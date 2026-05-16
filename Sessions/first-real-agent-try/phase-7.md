# Phase 7 · review_gate (review surface + approve)

Status: complete (whole-branch squad pass deferred to phase 9)
Branch: `first-real-agent-try`
Commit: `c5e3400`
Branch state: 1 commit past phase 6's `533cab1`

## Squad sign-off

| Agent          | Verdict | Headline                                                          |
|----------------|---------|-------------------------------------------------------------------|
| Build          | green   | 5 files. Approve route + client review component + server shell + tests. |
| Tester         | n/a     | Suite green: 652 -> 663 (+11) + 1 skipped. Per-phase squad deferred. |
| Reviewer       | n/a     | Deferred to phase-9 whole-branch pass.                            |
| Security       | n/a     | Deferred.                                                          |
| Performance    | n/a     | Deferred.                                                          |
| Accessibility  | n/a     | Surface UI; full WCAG audit folded into phase 9.                   |
| Docs           | green   | This note in-repo.                                                 |

## What shipped

- `src/app/api/agents/hermes/runs/[runId]/approve/route.ts`: Clerk-authed POST. Validates runId, looks up via getRun, refuses non-Hermes / not-yet-completed runs, writes approval into agent_runs.output. Approval write does not re-trigger the history-index pg_net trigger.
- `src/components/agents/hermes/HermesRunReview.tsx`: client component. Run-summary stats, download link, approve button + approved badge, intent panel, per-slide bullet panels with citations + source_query_id surfaced, run trace.
- `src/app/(app)/agents/hermes/runs/[runId]/page.tsx`: server shell. Hydrates run.output and renders the client review.

## Documented deviations

- **Inline bullet editing deferred.** Master plan describes `EditableText`-based bullet edits + a "human-touched" indicator. v0 ships view + approve only. Edits require a persistent edit-state shape (server side) that isn't worth specing today.
- **Per-section regenerate (POST /api/agents/hermes/regenerate-section) deferred.** Substantial subgraph work; queued.

## Tests

- `tests/unit/api/agents/hermes/runs/approve.test.ts`: 6 cases (401, 404 missing, 404 not-hermes, 409 not-completed, 200 happy path, 500 supabase failure).
- `tests/unit/components/agents/HermesRunReview.test.tsx`: 5 cases (renders summary + intent + bullets, download link href, approve flow + UI update, error alert, pre-approved state).
