# Product code edits driven by tests

> Any time a test pass needs an edit to product code (export a previously
> internal function, add a fixture hook, refactor for testability), log it
> here with the reason. Goal: minimum surface change, full visibility.

## This pass (Step 0 through Step 2 P0): no product code edits

The session covers Step 0 (audit), Step 1 (Vitest + RTL infrastructure),
and Step 2 P0 (backend lib unit tests). All tested code paths were
already public exports. No edits to `src/` were required.

## Deferred edits flagged for follow-up

### `src/lib/db/agent-feedback.ts`

`kindToThumbs` and `thumbsToKind` are file-local helpers. They are pure,
have non-trivial branching ("note" vs "rating" fallback when no thumbs),
and would benefit from direct unit tests. To test them today the
options are:

1. Export them as `_internal` and add `// internal: testing only` to the
   declaration.
2. Test them through `addFeedback` / `listFeedbackForAgent` with a fully
   mocked Supabase client.

Option 2 is the right call (tests the real surface), but writes those
through Supabase mocks which is significant scaffolding. Defer to Step 3,
where the route-handler tests for `/api/agents/[agentId]/memory` will
exercise this code path with a single mock setup.

### `src/lib/bq-queries.ts` — `numberish` / `numberOrNull` / `toNumber`

Same situation: private helpers. Currently covered indirectly via the
KPI-shape tests. No edit needed if the indirect coverage is good enough
(it is, per the 87% line coverage on the file). Leave as is.
