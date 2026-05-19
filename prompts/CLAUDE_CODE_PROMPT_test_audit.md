# Claude Code prompt: full test coverage audit and expansion across Lumen

## Context you need before doing anything

You are working on Lumen, a Next.js 15 App Router + TypeScript app at `/Users/omer/Desktop/Lumen`. Read `CLAUDE.md` at the repo root first. It defines what the product is and what is in scope (currently UA team only). Do not invent features or pages that are not described there.

The stack:
- Next.js 15 (App Router), React 19, TypeScript 5
- Clerk for auth (`@clerk/nextjs`, `@clerk/testing` available)
- BigQuery as the data layer (`@google-cloud/bigquery`)
- Recharts, Tailwind, Sentry, PostHog, Supabase
- Tests today: Playwright E2E only, in `tests/e2e/`

There are no unit tests, no component tests, no direct route-handler tests, and no visual regression snapshots in the repo. Your job is to close those gaps in a single, well-scoped pass and then bring the existing Playwright E2E suite up to date with the current code.

## Your goal

Deliver test coverage at five levels with one clear stack per level. Do not introduce a second testing framework in any layer if one already fits.

1. **Frontend (component + hook unit tests)** — Vitest + React Testing Library + jsdom. Add it. None of this exists today.
2. **Backend (lib unit tests, no network)** — Vitest. Same Vitest setup as level 1, separate test file pattern.
3. **API (route handler tests)** — Vitest, calling the route handler functions directly (`import { GET } from "@/app/api/.../route"`). Mock `next/headers`, Clerk auth, and the BigQuery client with `vi.mock`. No network.
4. **Security** — Extend the existing Playwright E2E security specs and add new ones. Do not rewrite what already passes.
5. **UI bugs and visual regression** — Add Playwright screenshot comparison (`toHaveScreenshot`) for the six core pages in light and dark theme, mobile and desktop viewports. Use deterministic data (mock fixtures, frozen dates).

## What I want you to actually do, in this order

### Step 0 — survey, do not skip
Before writing any test, do this and report back in a short summary:
- Run `npm run lint` and `npm run build` and confirm both pass.
- Run `npm run test:e2e` and capture which specs currently pass and which fail. Do not "fix" failing E2E tests yet, just record them.
- List every file under `src/lib/`, `src/app/api/`, `src/components/`, and `src/app/(app)/`. From that list, build a coverage matrix (markdown table) of: file path, current test coverage (E2E only / none / partial), proposed test level (1 to 5 from the list above), priority (P0 / P1 / P2).
- Save that matrix to `tests/COVERAGE_MATRIX.md`. This is the audit artifact. Do not move on until this file exists and is committed-ready.

Priority rule:
- P0: anything touching BigQuery, auth, security, or payment-shaped surfaces. Examples: `lib/bq-security.ts`, `lib/bq.ts`, `lib/bq-queries.ts`, `middleware.ts`, every route under `/api/bq/*`, every route under `/api/agents/*`, every route under `/api/pins/*`.
- P1: data formatting and shaping the dashboard depends on. Examples: `lib/format.ts`, `lib/dashboard/use-dashboard-data.ts`, `lib/filters/use-global-filters.ts`, `lib/ask/router.ts`, `lib/reports/generate.ts`, `lib/notifications/store.ts`.
- P2: presentational components. Examples: `components/ui/*`, `components/shell/*`, `components/dashboard/KpiCard.tsx`, `components/campaigns/RowSparkline.tsx`.

Do P0 first, then P1, then P2. If you run out of context budget partway through, stop at the end of a priority tier, never mid-tier.

### Step 1 — set up Vitest + RTL
- Add dev deps: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `happy-dom` (pick one, prefer `jsdom` for compatibility with Recharts).
- Create `vitest.config.ts` at the repo root. Config:
  - `test.environment: "jsdom"`
  - `test.globals: true`
  - `test.setupFiles: ["./tests/unit/setup.ts"]`
  - `test.include: ["tests/unit/**/*.test.{ts,tsx}"]`
  - alias `@` to `./src` matching `tsconfig.json`
  - `coverage.provider: "v8"`, `coverage.reporter: ["text", "html"]`, threshold lines/branches/functions at 70% initially.
- Add scripts to `package.json`:
  - `"test:unit": "vitest run"`
  - `"test:unit:watch": "vitest"`
  - `"test:unit:cov": "vitest run --coverage"`
  - `"test": "npm run test:unit && npm run test:e2e"`
- `tests/unit/setup.ts` should:
  - import `@testing-library/jest-dom/vitest`
  - mock `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) with no-op defaults
  - mock `@clerk/nextjs` and `@clerk/nextjs/server` with `auth()` returning a fake userId
  - polyfill `ResizeObserver` and `matchMedia` for Recharts and any responsive component
- Make sure `tsconfig.json` includes `tests/**/*` and the Vitest globals types.

### Step 2 — level 2 (backend lib unit tests) — write these first, they are easiest and unblock everything
Target files (P0 first):
- `lib/bq-security.ts` — every guard function. Test the allowlist of clients (active clients only — see project memory: 90-day spend recency as proxy), the date range validator, any string sanitization, any SQL identifier escaper. For each guard, write at least one positive and three adversarial inputs (SQLi payloads, oversized strings, nulls, undefined, wrong type).
- `lib/bq-queries.ts` and `lib/bq-queries-100play.ts` — assert the generated SQL is shape-stable. Snapshot the SQL string for each query function with representative params, then write parameterized cases that change one input at a time. Do not run the SQL against BigQuery in unit tests.
- `lib/bq.ts` — mock `@google-cloud/bigquery`. Test that invalid params throw before any query is sent, that the BQ client is constructed once, and that query results pass through the expected shaping.
- `lib/format.ts` — every formatter (currency, percentage, delta, big number). Include locale edge cases and zero / negative / NaN / Infinity.
- `lib/reports/generate.ts` — given a fixture campaign/KPI set, the generated report has the required sections in the required order and never echoes a client name not in the input.
- `lib/ask/router.ts` — given a natural-language input, the router returns the expected intent. Cover at least 10 representative prompts.
- `lib/notifications/store.ts` — add, mark-read, dismiss, list. Pure state, easy to test.
- `lib/agents/identity.ts` — agent identity resolution.

Pattern:
- Tests live in `tests/unit/lib/<same-path-as-src>.test.ts`.
- Each test file starts with one `describe` per exported function.
- Use `it.each` for parameterized cases instead of copy-pasted tests.

### Step 3 — level 3 (API route handler tests)
For every route under `src/app/api/`, write a test at `tests/unit/api/<route-path>.test.ts`.

Per route, cover:
- Happy path: valid auth, valid params, mocked BQ returns the expected shape, handler returns 200 with the right JSON shape.
- Auth: no Clerk session returns 401 (or redirect, whichever the route does today — verify against `middleware.ts`).
- Authorization (IDOR): for `/api/agents/[agentId]/memory` and `/api/pins/[id]`, a user must not be able to read or write another user's resource. Mock Clerk to return user A, attempt to access user B's data, expect 403 or 404 (whichever the code returns — pick one and enforce it, do not allow both).
- Param validation: missing required params returns 400. Invalid date range returns 400. Unknown client returns 400. Oversized payloads return 413 or 400.
- Error path: BQ throws → handler returns 500 and does not leak the error message or stack to the client body.
- Caching headers: assert the response sets `cache-control` correctly for data-freshness routes versus dashboard-kpis (whatever the policy is — encode the policy in the test).

Mocking guidance:
- Mock `@google-cloud/bigquery` once in `tests/unit/api/_setup.ts` with a controllable `query` function. Each test sets the return value.
- Mock `@clerk/nextjs/server` `auth()` with `vi.mock` per test as needed.
- For routes that read `request.url` or headers, construct a `new Request(url, { headers })` and pass it into the handler directly.

### Step 4 — level 1 (frontend component + hook tests)
Component tests live in `tests/unit/components/<same-path>.test.tsx`. Hook tests live in `tests/unit/lib/hooks/<same-path>.test.ts`.

Prioritize:
- `components/dashboard/KpiCard.tsx` — renders the metric, the delta, the up/down state. Color and icon match the brand tokens. Loading skeleton when value is undefined.
- `components/dashboard/TrendChart.tsx` — given fixture data, the right number of series renders. Metric switcher changes the active series.
- `components/campaigns/CampaignsTable.tsx` — sort, filter, empty state, large dataset (500 rows) does not crash.
- `components/shell/DateRangePicker.tsx` and `ClientSelector.tsx` — selection updates the global filter state.
- `lib/filters/use-global-filters.ts` and `lib/dashboard/use-dashboard-data.ts` — use `@testing-library/react`'s `renderHook`. Mock fetch. Test loading / success / error states.

Skip pure presentational components (`GlassCard`, `LivePulse`, `GlassBulb`, `SectionBreak`) — visual regression covers them.

### Step 5 — level 4 (security extensions to Playwright)
Read the existing security specs first: `security-headers.spec.ts`, `csp.spec.ts`, `injection.spec.ts`, `secrets-leak.spec.ts`, `bq-api-anon.spec.ts`, `auth-flow.spec.ts`. Do not duplicate what is there.

Add:
- `tests/e2e/bq-api-authz.spec.ts` — authenticated as user A, hit `/api/agents/[agentId]/memory` for an agent that belongs to user B, expect 403/404. Same for `/api/pins/[id]`.
- `tests/e2e/bq-api-params.spec.ts` — fuzz the BQ API params: invalid client names, SQLi payloads in dimension/filter fields, oversized date ranges, negative limits. Every response must be 400, never 500, and never leak BQ error text.
- `tests/e2e/rate-limit.spec.ts` — if there is a rate limiter (check `middleware.ts` and any Vercel config), assert it triggers. If there is not, write the spec as `test.skip` with a `// TODO` comment naming the missing primitive. Do not silently pretend rate limiting exists.
- `tests/e2e/clickjacking.spec.ts` — assert `X-Frame-Options` or CSP `frame-ancestors` on all top-level pages.
- `tests/e2e/cookie-flags.spec.ts` — Clerk session cookies must be Secure, HttpOnly, SameSite=Lax or Strict in production-equivalent runs.

### Step 6 — level 5 (UI bugs + visual regression)
Add a Playwright project `chromium-visual` in `playwright.config.ts` that:
- Uses an authenticated storage state (the existing `tests/.auth/user.json`).
- Sets `LUMEN_PREVIEW=1` so data is deterministic (or mock the BQ routes via `page.route` to return fixed JSON).
- Freezes the system clock via `page.addInitScript` so timestamps and "last updated" labels do not drift.
- Disables animations: `prefers-reduced-motion: reduce`, plus a global CSS override injected via init script.

Then add one spec per core page at `tests/e2e/visual/<page>.visual.spec.ts`:
- `/dashboard`, `/campaigns`, `/campaigns/[id]` (use a fixture id), `/queries`, `/reports`, `/feed`, `/knowledge`
- Each in two viewports: 1440x900 desktop, 390x844 mobile
- Each in two themes: dark default, light variant where supported
- Use `await expect(page).toHaveScreenshot(...)` with a `maxDiffPixelRatio` of 0.01

Bug hunt while you are in there. Before snapshotting each page, run a quick assertion sweep:
- No hydration mismatch (`page.on("console", ...)` errors fail the test)
- No 4xx or 5xx network requests in the page load
- No element has `position: fixed` overlapping the sidebar at mobile width
- All KPI tiles render a value or a skeleton, never empty text
- Every link with `href="#"` is a TODO comment in the source, not a real nav target

Report each bug you find as a one-line entry in `tests/UI_BUGS.md` with file path and a screenshot reference. Do not fix the bugs in this pass. Triage only.

### Step 7 — bring existing E2E specs up to date
Now run `npm run test:e2e` again. For every spec that fails:
- If it fails because the UI changed and the spec is out of date, update the spec.
- If it fails because the UI has a real regression, do not edit the spec. Add a failure entry to `tests/UI_BUGS.md` and mark the spec with `test.fixme` and a link to the bug entry.
- Never delete a spec to make a failure go away.

### Step 8 — wire CI
- Update `.github/workflows/` (or create one if missing) to run `npm run lint`, `npm run build`, `npm run test:unit:cov`, then `npm run test:e2e`.
- The coverage step must fail the build if coverage drops below the thresholds in `vitest.config.ts`.
- The visual regression project should run only on label `visual-review` or on main branch pushes, not on every PR. Visual snapshots are noisy on PRs.

## Rules and constraints

- Do not use em dashes anywhere in code, comments, test names, or docs. Use a colon, semicolon, or parentheses.
- Do not write Hebrew anywhere in the test files. Test names and assertions are English only.
- Do not pin any dependency to a major version newer than what is already in `package.json`. If you need a newer major, ask Omer first.
- Do not change product behavior to make a test pass. Tests describe the system as it is. If the system is wrong, the test fails and you log it in `UI_BUGS.md`.
- Do not invent fixtures. Use real shapes from the actual BQ routes. To get the shape, read the route handler and the types in `src/types/`.
- Do not add a second test framework at any layer. If you think you need one, stop and explain.
- Active clients only for BQ-backed tests. Use `100play` as the canonical fixture client (it already has its own route folder). If you need a second client for IDOR tests, mock one — do not hit BQ.
- Keep every test file under 300 lines. If a file gets bigger, split by describe block.
- Every new test must have a comment at the top stating: what layer (1 to 5), what file under test, and the priority (P0 / P1 / P2).

## What to deliver back to me

When you finish, produce a single summary at the end of the session containing:
1. The `tests/COVERAGE_MATRIX.md` file path and a 5 line summary of what it shows.
2. The new test count by layer.
3. The current code coverage percentage (lines, branches, functions).
4. The contents of `tests/UI_BUGS.md` (paste it inline).
5. A list of every existing E2E spec you marked `test.fixme` with the reason.
6. A list of dependencies added and why.
7. The exact commands to run each test layer locally.

If you cannot finish in one session, stop at the end of the current priority tier (never mid-tier), commit what you have, and write the next-session plan to `tests/NEXT_SESSION.md` so the next pass picks up cleanly.

## What I do not want

- A 10,000 line test suite that asserts trivial things like "the button renders".
- Snapshot tests on JSON output that change every run.
- Mocks so deep that the test is testing the mock, not the code.
- A test that depends on a real BigQuery query running.
- Any test that requires network access to a third party.
- Edits to product code beyond what is strictly required to make tests runnable (for example, exporting a function that was internal). If you need a product code edit, list it in a `tests/PRODUCT_CODE_EDITS.md` file with the rationale, do the minimum edit, and call it out in the final summary.
