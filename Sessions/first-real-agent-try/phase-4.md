# Phase 4 · Analyze (Anomstack + Sonnet rank-and-frame)

Status: complete (whole-branch squad pass deferred to phase 9)
Branch: `first-real-agent-try`
Commit: `892922e`
Branch state: 1 commit past phase 3's `c5b4dec`

## Squad sign-off

| Agent          | Verdict | Headline                                                 |
|----------------|---------|----------------------------------------------------------|
| Build          | green   | 7 files, +991 / -45. Anomstack + analyze node + tests.   |
| Tester         | n/a     | Suite green: 617 -> 633 (+18). Per-phase squad deferred. |
| Reviewer       | n/a     | Deferred to phase-9 whole-branch pass.                   |
| Security       | n/a     | Deferred.                                                 |
| Performance    | n/a     | Deferred.                                                 |
| Accessibility  | n/a     | No UI this phase.                                         |
| Docs           | green   | This note in-repo.                                        |

## What shipped

- `src/lib/agents/hermes/anomstack.ts`: pure-function detector. Three classes — z-score across networks (spend / CPI / CPA D7, min population 3, |z| >= 2), CPA D7 vs `trailingCpaD7Avg` percent delta (|delta| >= 25%), campaign spend delta (same threshold). Output is a typed RawAnomaly[] with source_query_id and rationale.
- `src/lib/agents/hermes/prompts/analyze.prompt.ts`: Sonnet system prompt. Hard rule: rank and frame, never invent. Knowledge + History chunks delimited as untrusted.
- `src/lib/agents/hermes/nodes/analyze.ts`: orchestrator. Cached BQ fetch (queryGlobalComixNetworkBreakdown + queryGlobalComixCampaigns + queryGlobalComixTrend) in parallel; Anomstack pre-pass; parallel Knowledge + History retrieve (degrades to empty on error); Sonnet tool_use with prompt caching on system + tools.
- `src/lib/agents/hermes/state.ts`: FindingSchema (Zod) + FindingsResponseSchema for tool_use validation.

## Deviations from spec

- "Best in N weeks" detector deferred — requires a wider date-range query than the dashboard slice gives. Logged as TODO for phase 6+.
- Integration test against real Week 19 data not written — needs working BQ credentials in the test env.

## Tests

- `tests/unit/lib/agents/hermes/anomstack.test.ts`: 11 cases. Z-score outliers (high spend, low CPI with direction=down), small-population skip, zero-stdev skip, CPA D7 vs trailing baseline, campaign spend delta, count totals.
- `tests/unit/lib/agents/hermes/nodes/analyze.test.ts`: 7 cases. Intent-null skip, happy-path orchestration, parallel retrieve to both corpora, retrieve failure tolerance, no-tool_use throw, Zod rejection of bad finding shape, history trace counts.
- Graph e2e updated to mock the new second messages.create + the three BQ queries.
