# Next-session plan

This session covered Step 0 (audit), Step 1 (Vitest + RTL infrastructure),
and Step 2 (P0 backend lib unit tests, plus one P1 hook for proof of
plumbing). 139 unit tests passing; coverage at 43.44% lines globally
(70-99% on the files actually tested in this pass).

Next session picks up at Step 3 and works through priority tiers. Each
tier must finish before the next starts; if context runs out, stop at a
tier boundary and update this file.

---

## Step 3 (Layer 3): API route-handler tests, P0 only

Target files (each gets its own test file under `tests/unit/api/<same-path>.test.ts`):

- `api/bq/dashboard-kpis/route.ts`
- `api/bq/trend/route.ts`
- `api/bq/channel-mix/route.ts`
- `api/bq/campaigns/route.ts`
- `api/bq/data-bounds/route.ts`
- `api/bq/freshness/route.ts`
- `api/bq/100play/dashboard-kpis/route.ts`
- `api/bq/100play/trend/route.ts`
- `api/bq/100play/channel-mix/route.ts`
- `api/bq/100play/campaigns/route.ts`
- `api/bq/100play/data-bounds/route.ts`
- `api/pins/route.ts`
- `api/pins/[id]/route.ts`
- `api/agents/[agentId]/memory/route.ts`

Per-route coverage (encode the policy in the test):

1. Happy path: valid auth + valid params + mocked BQ returns expected
   shape, handler returns 200 with the right JSON.
2. Missing required params: 400.
3. Whitespace-only params: 400.
4. Unknown client / out-of-allowlist client: 403 (never 500).
5. Invalid date: 400 (before any query is dispatched).
6. BQ throws: 500 with body `{ error: "Query failed" }` only. No stack,
   no schema names, no column names in the response body.
7. IDOR for `/api/pins/[id]` and `/api/agents/[agentId]/memory`: user A
   cannot read or mutate user B's row (the Supabase calls are scoped by
   `user_id`; verify the where-clause includes that filter).
8. Cache-control header is set when the handler relies on
   `unstable_cache`. The current shape: handlers do not set explicit
   cache headers; the cache is server-side via `unstable_cache`. The
   test should encode that the response body comes back without an
   explicit `cache-control` directive (until the policy changes).

Mocking pattern (set up once in `tests/unit/api/_setup.ts`):

```ts
// Pass-through Next cache.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

// Controllable BQ.
const queryFn = vi.fn();
vi.mock("@google-cloud/bigquery", () => ({
  BigQuery: class { query(o: unknown) { return queryFn(o); } },
}));

// Per-test Clerk auth.
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_test" }),
}));
```

For Supabase routes (pins, agents memory), mock `@supabase/supabase-js`
with a chainable builder that records the `eq("user_id", ...)` calls,
then assert IDOR is enforced.

To call a route handler: build `new Request("http://localhost/api/...")`
(or `NextRequest`) and pass it directly to `GET` / `POST` / `DELETE`.

Expected coverage after Step 3 P0: 60% lines globally.

---

## Step 4 (Layer 1): frontend component + hook tests, P1

After Step 3 lands, target these in order:

1. Hooks:
   - `lib/filters/use-global-filters.ts` (pure helpers `resolveRange`,
     `windowDays`, `previousWindow` first; hook itself second).
   - `lib/dashboard/use-dashboard-data.ts` (mocked `fetch`, loading /
     success / error / `windowEmpty` branches).
   - `lib/pins/store.ts` (`usePinnedTiles` with mocked fetch, optimistic
     add / remove, MAX_PINS cap).
   - `lib/filters/use-dashboard-mode.ts`.

2. Components:
   - `components/dashboard/KpiCard.tsx` (value, delta, direction,
     loading skeleton).
   - `components/dashboard/TrendChart.tsx` (metric switcher).
   - `components/campaigns/CampaignsTable.tsx` (sort, filter, large
     dataset).
   - `components/shell/DateRangePicker.tsx` and `ClientSelector.tsx`
     (URL state round trip).
   - `components/ask/AnswerCard.tsx` (renders narration / rationale /
     byline / alternative).
   - `components/reports/ReportDocument.tsx` (sections in order).
   - `components/agents/AgentDetailPanel.tsx` (memory list, feedback
     save flow via mocked fetch).

Skip the pure presentational components (`GlassCard`, `LivePulse`,
`SectionBreak`, `Skeleton`): visual regression covers them in Step 6.

Expected coverage after Step 4: 80% lines globally; raise threshold to
70/70/70/70 in `vitest.config.ts`.

---

## Step 5 (Layer 4): security E2E additions

Read existing specs before adding. Do not duplicate:

- `security-headers.spec.ts`, `csp.spec.ts`, `injection.spec.ts`,
  `secrets-leak.spec.ts`, `bq-api-anon.spec.ts`, `auth-flow.spec.ts`.

Add:

- `tests/e2e/bq-api-authz.spec.ts` (IDOR on `/api/agents/[agentId]/memory`
  and `/api/pins/[id]`).
- `tests/e2e/bq-api-params.spec.ts` (fuzz BQ params: invalid client,
  SQLi shapes, oversized date ranges, negative limits; assert 400 or
  403, never 500, never raw BQ message in body).
- `tests/e2e/clickjacking.spec.ts` (assert `X-Frame-Options` or CSP
  `frame-ancestors` on top-level pages).
- `tests/e2e/cookie-flags.spec.ts` (Clerk session cookies: Secure,
  HttpOnly, SameSite).
- `tests/e2e/rate-limit.spec.ts` — `test.skip` placeholder with a `TODO`
  naming the missing primitive (Lumen has no rate limiter yet).

---

## Step 6 (Layer 5): visual regression

1. Add a `chromium-visual` project to `playwright.config.ts`:
   - Authenticated storage state (`tests/.auth/user.json`).
   - `LUMEN_PREVIEW=1` env on the dev server.
   - Freeze the system clock via `page.addInitScript`.
   - Disable animations (`prefers-reduced-motion: reduce` + CSS injection).
   - Mock `/api/bq/*` via `page.route` with deterministic fixtures so
     screenshots do not drift with BQ data.

2. One spec per page at `tests/e2e/visual/<page>.visual.spec.ts`:
   `/dashboard`, `/campaigns`, `/campaigns/[id]`, `/queries`, `/reports`,
   `/feed`, `/knowledge`. Two viewports (1440x900, 390x844), two themes
   (dark, light where supported). `toHaveScreenshot` with
   `maxDiffPixelRatio: 0.01`.

3. While in there, run an assertion sweep before each snapshot:
   - No hydration mismatches (`page.on("console", ...)` fails the test).
   - No 4xx / 5xx network requests during load.
   - All KPI tiles render a value or skeleton; never empty.
   - All `href="#"` links are TODOs in source, not real nav targets.

4. Log every bug found in `tests/UI_BUGS.md`. Do not fix in this pass.

---

## Step 7: E2E spec maintenance

Run `npm run test:e2e` after Step 6. For each failing spec:

- UI changed and spec is stale: update spec.
- UI has a real regression: mark `test.fixme` with a link to the
  `UI_BUGS.md` entry. Never delete to silence.

---

## Step 8: CI wiring

Update / create `.github/workflows/ci.yml`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test:unit:cov
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

Visual regression project should run only on label `visual-review` or on
`main` pushes, not every PR. Coverage thresholds in
`vitest.config.ts` already gate the build.

---

## Files added in the previous (this) session

- `vitest.config.ts`
- `tests/unit/setup.ts`
- `tests/unit/_stubs/server-only.ts`
- `tests/unit/lib/bq-security.test.ts`
- `tests/unit/lib/agents/identity.test.ts`
- `tests/unit/lib/format.test.ts`
- `tests/unit/lib/env.server.test.ts`
- `tests/unit/lib/db/user.test.ts`
- `tests/unit/lib/bq.test.ts`
- `tests/unit/lib/bq-queries.test.ts`
- `tests/unit/lib/bq-queries-100play.test.ts`
- `tests/unit/lib/ask/router.test.ts`
- `tests/unit/lib/notifications/store.test.tsx`
- `tests/unit/api/_lib/handle.test.ts`
- `tests/COVERAGE_MATRIX.md`
- `tests/UI_BUGS.md`
- `tests/PRODUCT_CODE_EDITS.md`
- `tests/NEXT_SESSION.md` (this file)

## Dependencies added

- `vitest@^4.1.6`
- `@vitest/coverage-v8@^4.1.6`
- `@testing-library/react@^16.3.2`
- `@testing-library/jest-dom@^6.9.1`
- `@testing-library/user-event@^14.6.1`
- `jsdom@^29.1.1`

All added at latest major; no existing major was bumped. `happy-dom` was
considered and skipped per the prompt (jsdom is the established choice
for Recharts compatibility).

## How to run

```bash
npm run test:unit         # Vitest, watch mode disabled
npm run test:unit:watch   # Vitest, watch
npm run test:unit:cov     # Vitest with coverage (gates against thresholds)
npm run test:e2e          # Playwright E2E
npm run test              # Vitest then Playwright, sequentially
```
