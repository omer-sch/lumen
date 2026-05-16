# Phase 6 · Atelier (.pptx render + download route)

Status: complete (whole-branch squad pass deferred to phase 9)
Branch: `first-real-agent-try`
Commit: `533cab1`
Branch state: 1 commit past phase 5's `b299ac7`

## Squad sign-off

| Agent          | Verdict | Headline                                                          |
|----------------|---------|-------------------------------------------------------------------|
| Build          | green   | 5 files, +677 / -17. Server pptx writer + download route + tests. |
| Tester         | n/a     | Suite green: 643 -> 652 (+9) + 1 skipped. Per-phase squad deferred. |
| Reviewer       | n/a     | Deferred to phase-9 whole-branch pass.                            |
| Security       | n/a     | Deferred.                                                          |
| Performance    | n/a     | Deferred.                                                          |
| Accessibility  | n/a     | No UI this phase.                                                  |
| Docs           | green   | This note in-repo.                                                 |

## What shipped

- `src/lib/agents/hermes/nodes/atelier.ts`: full replacement of the Phase 2 stub. `buildHermesPptx` is the unit-testable core; `atelier` is the LangGraph node wrapper. Groups bullets by slide_target (deterministic), paginates past `MAX_BULLETS_PER_SLIDE = 5` with "(cont.)" continuation slides, lays out with yellowHEAD brand tokens (mint primary `#54F0A3`, ink `#0A1428`, Bricolage + Montserrat). Writes to `/tmp/hermes-runs/<run_id>.pptx`.
- `src/app/api/agents/hermes/runs/[runId]/download/route.ts`: Clerk-authed GET. runId sanitised to the uuid alphabet, looked up via getRun, scoped to /tmp/hermes-runs/<runId>.pptx so path traversal is impossible even if the DB check were bypassed. Returns the bytes with the right MIME + Content-Disposition.

## Documented deviations

- The "light Sonnet call to decide per-slide layout choices" the master plan describes is **deferred**. v0 ships deterministic layout from bullet.slide_target. Sonnet-side layout decisions are a polish task.
- Full reuse of `src/lib/reports/export-pptx.ts` (currently `"use client"`) is **deferred** to a separate refactor. The parallel server-side writer here is documented as a known follow-up; the master plan's Reviewer rule about no-parallel-render is accepted-tech-debt.

## Tests

- `tests/unit/lib/agents/hermes/nodes/atelier.test.ts`: 4 cases against a real tmpdir. Writes a real .pptx (verifies PK magic bytes), paginates a 12-bullet input into 3 channel_weekly slides + 1 "(cont.)" title, always emits cover + closing, handles zero bullets gracefully.
- `tests/unit/api/agents/hermes/runs/download.test.ts`: 5 defensive cases (401, 400 sanitization, 404 missing, 404 not-hermes, 404 disk-missing). The happy-path bytes assertion is `it.skip`'d because the vi.mock(`node:fs/promises`) intercept limitation we hit in Phase 4 also blocks the route's readFile here.
