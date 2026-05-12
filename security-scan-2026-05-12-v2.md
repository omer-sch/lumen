# Lumen Security Scan (v2)

**Date:** 2026-05-12
**Scope:** Full Lumen codebase at `/Users/omer/Desktop/Lumen`
**Method:** Direct read of `src/middleware.ts`, `src/lib/bq*`, `src/lib/env*`, `src/lib/db/*`, every `src/app/api/**/route.ts`, `next.config.ts`, `package.json` + lockfile, `supabase/migrations/*`, `.gitignore`. Greps for `dangerouslySetInnerHTML` / `eval` / `localStorage` / `fetch(` / redirect sinks / `process.env` usage. Live `npm audit` run, lockfile integrity check, npm-registry verification on the lucide-react pin. Companion to (and overrides where stated) `security-scan-2026-05-12.md`.

---

## TL;DR

Posture is solid: SQL is parameterized end-to-end, secrets are all `server-only`, the Clerk gate covers every BQ route even in `LUMEN_PREVIEW`, security headers are real, and per-user scoping is correct on the routes that have it. **No exploitable critical issue.** Three things deserve attention before any external pilot: the four `/api/bq/100play/*` routes accept any allowlisted client slug but always return 100play data (confirmed); `aria/generate` has no rate limit, no length cap, and leaks raw HF error bodies (confirmed); the `agent_feedback` POST trusts a user-supplied `runId` without verifying the run belongs to the named agent. **The prior report's "high priority" finding on `lucide-react@^1.14.0` is REFUTED** — `1.14.0` is the legitimate `latest` dist-tag from the real maintainer (Eric Fennis), with SLSA provenance and a verified shasum. The finding I'd add: every authenticated user can both (a) read every allowlisted client's BQ data and (b) write `agent_feedback` against any other user's run id.

---

## Critical

None confirmed exploitable.

---

## High

### H1. `/api/bq/100play/*` routes ignore the requested `client` and always serve 100play data — CONFIRMED from prior report

**Files:** `src/app/api/bq/100play/{dashboard-kpis,trend,channel-mix,campaigns,data-bounds}/route.ts` → `src/lib/bq-queries-100play.ts:55,68-70,88-146`.

`assertClientAllowed(client)` runs (`bq-queries-100play.ts:93`), so `client` must be in the env allowlist — but `fqTable()` always resolves to the hardcoded `dwh_fb2_ios14_appsflyer_100play`. A request to `/api/bq/100play/dashboard-kpis?client=globalcomix&from=…&to=…` returns 100play numbers labelled as globalcomix in the cache key. Today this is "high" rather than "critical" only because every authenticated Lumen user can already query every allowlisted client through `/api/bq/*` (see H3); the day per-user client scoping ships, this becomes a hard authorization bypass.

**Fix:** in each 100play route, reject `params.client !== "100play"` with 403 before delegating; add a matching assertion in `query100playKPIs/_Trend/_ChannelMix/_DataBounds`.

### H2. `agent_feedback` POST accepts a user-supplied `runId` without verifying the run belongs to the named agent — NEW

**File:** `src/app/api/agents/[agentId]/memory/route.ts:37-57` → `src/lib/db/agent-feedback.ts:73-89`.

`POST /api/agents/aria/memory` only validates `typeof incoming.runId === "string"` and that `agentId` is one of `aria/max/nova`. It then inserts straight into `agent_feedback` with the user's id and the user-supplied `runId`. Two consequences:

1. A logged-in user can leave feedback (including arbitrary `text` and `rating`) against **any** run id in `agent_runs` — including runs owned by other users / other agents. The PG foreign key enforces "the run exists" but not "the run belongs to `agentId`."
2. The DB-side RLS policy `"agent_feedback insert own"` (`supabase/migrations/0001_init_schema.sql:246-249`) only checks `user_id = auth.jwt()->>'sub'`. It does NOT cross-check `run_id`. And every API call uses the service-role key (`src/lib/db/client.ts:8-12,40-50`), which bypasses RLS entirely — so RLS isn't acting as a backstop here today.

**Severity:** high because (a) the route ships today and (b) the feedback rows feed `agent_memory` and are surfaced in the agent panels, so a hostile insert can pollute another user's view. The text field is unbounded; an attacker could flood it.

**Fix:** in `addFeedback`, before insert, `select agent_id from agent_runs where id = :runId` and reject when it doesn't match `agentId`. Add a length cap on `text` (e.g. 2,000 chars). Optionally add an RLS check that joins `agent_runs.agent_id` even though the route uses service-role.

### H3. No per-user authorization on which BQ clients a user can query — CONFIRMED from prior report (M6)

**Files:** `src/middleware.ts`, `src/lib/bq-security.ts:10-15,120-125`, every `/api/bq/*` route.

Auth is "are you signed in to Lumen at all." Once you are, any client in `ALLOWED_CLIENTS` is queryable. There is no notion of "this analyst is on the GlobalComix team and should not see Playw3's spend." This is the largest gap between Lumen and yellowHEAD's client-confidentiality obligations. Re-asserting at high (not medium) because it's the precondition that turns H1 from "confusing" to "trivially exploitable" the day it's fixed.

**Fix:** add a `client_membership` table (user_id, client_slug); plumb `assertUserCanAccess(userId, client)` next to `assertClientAllowed` in `bq-security.ts`. Cache keys remain per-client (not per-user) for hit rate.

---

## Medium

### M1. `aria/generate` — no rate limit, no prompt length cap, weak type check, echoes HF error body — CONFIRMED from prior report (M1+M2), with one addition

**File:** `src/app/api/agents/aria/generate/route.ts:7-74`.

- Line 16-19: runtime check is `if (!prompt)`. Any truthy non-string (object, array, number) reaches `JSON.stringify({ inputs: prompt })`.
- No length cap on `prompt`.
- No per-user / per-IP rate limit. `serverEnv.HF_TOKEN` cost burns until quota.
- Line 65: response body includes the raw HF error body (`{ error, body }`), exposing model name, account routing, upstream diagnostics.
- **New observation:** the route doesn't call `getUserId()` so it has no internal auth check at all. It relies entirely on the Clerk middleware. Routes that touch paid third-party APIs should defence-in-depth their own auth.
- **New observation:** because the middleware treats `/api/agents/*` as a non-BQ route, it is **NOT** gated in `LUMEN_PREVIEW` mode (`src/middleware.ts:28`). Any preview deployment with `HF_TOKEN` set will serve unauthenticated image generation to anyone who can reach it.

**Fix:** validate `typeof prompt === "string" && prompt.length <= 2000`; drop `body` from the JSON response (keep server log); add `await auth.protect()` or equivalent inside the route; add a per-user rate limit; ensure `HF_TOKEN` is **not** present in preview env (or gate the route behind `LUMEN_PREVIEW` like the BQ routes).

### M2. CSP retains `'unsafe-inline'` on `script-src` and `style-src` — CONFIRMED (prior M3)

**File:** `next.config.ts:8-23`.
Documented as a known TODO. Acceptable for closed alpha, not for launch. Schedule nonce-based CSP via middleware as part of the next round of API growth. `'unsafe-eval'` is correctly absent, source maps are correctly disabled in prod (`productionBrowserSourceMaps: false`).

### M3. PostHog captures pageviews including URL query params — CONFIRMED (prior M4)

**File:** `src/components/analytics/PostHogProvider.tsx:14-19`.
`capture_pageview: true` + `capture_pageleave: true` send `?client=…&from=…&to=…` to PostHog on every nav. `person_profiles: "identified_only"` prevents anon profile creation but does not affect URL capture.
**Fix:** set `capture_pageview: false` and emit your own scrubbed pageview events, or configure a property denylist for `client`/`from`/`to`.

### M4. Reports persist to `localStorage` — CONFIRMED (prior M5), with a new caveat about the "share link"

**File:** `src/lib/reports/store.ts:6-29`, `src/components/reports/ReportsView.tsx:85-95`.
Phase-1 acknowledged. **New caveat:** the "Copy share link" button at line 215-230 produces a URL of the form `${origin}/reports?id=${report.id}`. The recipient's browser only finds the report if **their own** localStorage already contains it. So today the share link is non-functional rather than insecure — but the UX implies sharing happens. Risk: when this is wired to a real backend, take care that `id` is a high-entropy unguessable token (UUID v4 / ulid), not a sequential int, and that the receiving route validates the recipient is allowed to read it. Today the id is `crypto.randomUUID()` (`src/lib/reports/generate.ts:13`), so the entropy is fine if/when a backend lands.

### M5. Reports are generated from mock data, not BQ — NEW

**File:** `src/lib/reports/generate.ts:1-2,38-40`.
`generateReport` imports `findClient` and `getCampaigns` from `@/lib/mock/*` and produces a fully-formed branded report whose KPIs and channel breakdowns are entirely fabricated. The Reports page (`src/app/(app)/reports/page.tsx`) ships this in production paths. Not a code-execution risk, but a real product / customer-trust risk: a CSM could plausibly export a PDF and send it to a client, with the client's real name on the cover and made-up performance numbers inside. The yellowHEAD label on the document elevates the seriousness.
**Fix:** before any external pilot, either gate Reports behind a "demo only" banner that survives PDF export, or wire the generator to BQ.

### M6. `LUMEN_PREVIEW` does not exist as a CI guard — CONFIRMED low (prior low #3), upgrading to medium

The `NODE_ENV !== "production" && LUMEN_PREVIEW === "1"` gate (`src/middleware.ts:7-9`, `src/lib/db/user.ts:15-17`, `src/app/page.tsx:7-9`) is correct and triple-redundant. But there is no automated guard against someone setting `LUMEN_PREVIEW=1` in a Vercel production env. Risk is small (the conjunction with `NODE_ENV` saves us) but the cost of the guard is one CI step.
**Fix:** add a `prebuild` script that errors when `process.env.LUMEN_PREVIEW` is set on `vercel build` for production. Five lines.

### M7. Bundled `postcss@8.4.31` inside `next/dist` flagged by `npm audit` (GHSA-qx2v-qp2m-jg93) — NEW

**File:** `package-lock.json` → `node_modules/next/node_modules/postcss`.
`npm audit --omit=dev` reports one moderate finding: PostCSS XSS via unescaped `</style>` in CSS Stringify output (CVSS 6.1). The vulnerable version is the one Next.js 15.5.18 bundles for its build pipeline. The hoisted top-level `postcss@8.5.14` (used by Tailwind/autoprefixer/etc.) is patched. The bundled copy is build-time only, used to produce CSS files served to the browser — the XSS sink is in CSS Stringify output, which our pages don't render as HTML. Real exploitability against Lumen is low.
**Notes:**
- `npm audit fix` will offer to downgrade Next to `9.3.3`. **Do not accept.** That's a major-version regression for a marginal build-time CVE. Wait for the next Next.js patch that bumps its bundled PostCSS, or pin a higher `postcss` resolution.
- Re-run `npm audit --omit=dev` weekly until the upstream bump lands.

---

## Low / informational

- **`/api/bq/freshness`** has no params, queries a hardcoded `rivery_activity_anlytics.v_rivery_activity_check` view (note the upstream typo). Not sensitive, but it bypasses the allowlist machinery and uses a dataset name that lives outside `BQ_DATASET`. If `BQ_PROJECT` ever points at a non-yellowHEAD project, this query fails or hits an unintended view.
- **`/monitoring`** Sentry tunnel is intentionally public so the SDK can post unauthenticated. `@sentry/nextjs` v10 restricts forwarding to the configured DSN host — abuse risk is bounded but worth re-checking on every SDK upgrade.
- **`ask_history` POST** validates `body.answer.question` truthiness only and inserts the rest of `answer` (including `config: any` and `narration: any`) verbatim as JSON. Same for **`pins` POST**. No SQL injection (parameterized via `@supabase/supabase-js`), but a malicious authenticated user can write arbitrary JSON blobs into `ask_queries.result_json` / `pinned_tiles.chart_config_json`. Renderers are React, so the blobs are escaped on display. Cap with a body-size limit (Next default is 1 MB; tighten if needed).
- **`/welcome`** is publicly reachable (in the public-route list). It contains hardcoded UI copy like "ROAS is up 5.7% week-over-week" — this is presentational filler, not a real metric, but a yellowHEAD staffer reading the source might assume it is. Worth replacing with neutral copy before any external link gets shared.
- **No `dangerouslySetInnerHTML`, no `eval`, no `new Function`** anywhere under `src/`. Confirmed by grep.
- **All outbound `fetch`** in server code targets a hardcoded URL (`HF_MODEL_URL` only). Browser fetches go to relative `/api/*` paths only. **No SSRF surface.**
- **`@google-cloud/bigquery@^8.3.0`** is on a current major. **`@clerk/nextjs@^7.2.8`** is current. **`@sentry/nextjs@^10.51.0`** is current. **`@supabase/supabase-js@^2.105.4`** is current.
- **Hardcoded user id `"mock-user-1"`** in `src/lib/reports/generate.ts:129` and `src/components/reports/ReportsView.tsx:100`. Cosmetic in mock-storage land; will need replacing when Reports moves to a backend.
- **`MOCK_USER_ID = "mock-user-1"`** is exported from `src/lib/pins/store.ts:12` as `@deprecated`. Safe today (consumers are gone) but still exported — remove on cleanup.

---

## Looks good (verified)

- **BigQuery query construction is parameterized end-to-end.** `bq-queries.ts` and `bq-queries-100play.ts` use `params: { from, to, [prev_from, prev_to] }` for every user-controlled value; every interpolated identifier (`spendCol`, `revenueCol`, `dedupePredicate`, table names, `PRIMARY_TABLE`) is sourced from the static `CLIENT_SCHEMA` / `CLIENT_TO_TABLE` maps in `bq-security.ts`. `assertIsoDate` enforces `^\d{4}-\d{2}-\d{2}$` before any date touches SQL. SQL injection is not reachable.
- **`bqErrorResponse`** (`src/app/api/bq/_lib/handle.ts:18-31`) translates BQ errors to generic 400/403/500 codes; raw BQ errors are never returned to the browser.
- **`server-only` guard** is present on every secret-touching module: `env.server.ts`, `bq.ts`, `bq-security.ts`, `bq-queries.ts`, `bq-queries-100play.ts`, `db/{user,client,pins,ask,agent-feedback,agents}.ts`, and `app/api/bq/_lib/handle.ts`. Verified by grep.
- **`PREVIEW` bypass is double-gated** (`NODE_ENV !== "production"` AND `LUMEN_PREVIEW === "1"`) at three independent decision points (`middleware.ts:7-9`, `db/user.ts:15-17`, `app/page.tsx:7-9`) and the BQ route family is excluded from the bypass even in preview (`middleware.ts:28`).
- **Per-user data scoping is correct** on the routes that own user data: `removePinForUser` (`db/pins.ts:54-66`) filters by `eq("user_id", userId).eq("id", pinId)`; `listPinsForUser`, `listAskQueries`, `recordAskQuery`, `listFeedbackForAgent` all filter by the Clerk `userId` from `getUserId()`.
- **Security headers in `next.config.ts:25-41`** are real and complete: HSTS (`max-age=63072000; includeSubDomains; preload`), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy with camera/mic/geo/cohort denied, COOP same-origin, CORP same-site. `poweredByHeader: false`. CSP is restrictive aside from the documented `'unsafe-inline'` TODO; `'unsafe-eval'` is correctly absent.
- **No production code path imports `src/lib/mock/*` for BigQuery data.** The `/api/bq/*` routes go through `bq-queries.ts` and `bq-queries-100play.ts` only. Mock imports survive in: agents pages (intentional fallback when Supabase env is absent); the Ask router (still mock today); Reports generator (M5 above); UI shells like `ClientSelector`, `FeedView`, `AIModeView` that render UI-only mock state. `useDashboardData` is fully on BQ.
- **`.gitignore` blocks `.env*`** and only allows `.env.local.example`. `tests/.auth/` is also gitignored. Verified by inspection.
- **Supabase migrations enable RLS** on all per-user tables and write per-user policies keyed on `auth.jwt()->>'sub'` (matches Clerk `sub`). Today the API uses service-role and bypasses RLS, so these policies are dormant defence-in-depth — but they exist and are correct (with the H2 caveat about `agent_feedback` not cross-checking `run_id`).
- **`lucide-react@1.14.0` is legitimate.** `npm view lucide-react@1.14.0` confirms: `dist-tags.latest = 1.14.0`, maintainer `ericfennis`, integrity hash matches the lockfile (`sha512-+1mdWcfSJVUsaTIjN9zoezmUhfXo5l0vP7ekBMPo3jcS/aIkxHnXqAPsByszMZx/Y8oQBRJxJx5xg+RH3urzxA==`), tarball served from registry.npmjs.org with SLSA provenance and GitHub Actions OIDC signature. The package historically lived in the `0.x` line (still on dist-tag `dev` at `0.554.0-rc.0`) but the maintainer published a `1.x` line and tagged it `latest`. The pin is fine.

---

## Delta from prior report (`security-scan-2026-05-12.md`)

| Prior finding | Verdict |
|---|---|
| **H1 — 100play routes ignore client** | **Confirmed.** Same finding here as H1. |
| **H2 — `lucide-react@^1.14.0` suspicious** | **REFUTED.** Verified against npm registry and lockfile integrity. `1.14.0` is the legitimate `latest` from Eric Fennis with SLSA provenance. The author of the prior report was right to flag it (the `0.x` history is unusual) but wrong on the conclusion. **Action: do not unpin.** |
| **M1 — aria/generate echoes HF error body** | **Confirmed.** Same here as M1. |
| **M2 — aria/generate no rate limit / no length cap / weak type check** | **Confirmed.** Same here as M1, with two new observations: route doesn't call `getUserId()`, and `LUMEN_PREVIEW` does NOT gate `/api/agents/*` (it gates only `/api/bq/*`), so the route is wide open in preview. |
| **M3 — CSP `'unsafe-inline'`** | **Confirmed.** Same here as M2. |
| **M4 — PostHog captures URL query params** | **Confirmed.** Same here as M3. |
| **M5 — Reports persist to localStorage** | **Confirmed.** Same here as M4, plus the new caveat that the "share link" only works inside the author's own browser today. |
| **M6 — No per-user client authorization** | **Confirmed and upgraded** to High (H3) because it's the precondition that makes H1 trivially exploitable once H1 is fixed in isolation. |
| Low — `freshness` reaches outside `BQ_DATASET` | Confirmed. |
| Low — `/monitoring` is public by design | Confirmed. |
| Low — `LUMEN_PREVIEW` CI guard | **Upgraded to medium (M6).** The triple-gate is good, but a CI assertion is one line and removes the entire residual-risk class. |
| Low — Mock data only in frontend | **Partial dispute.** `src/lib/reports/generate.ts` is a production code path that imports from `src/lib/mock/*` and produces a CSM-facing PDF. New M5 above. |
| Verified — no `dangerouslySetInnerHTML` / `eval` / `new Function` | Confirmed. |
| Verified — server-only on secret modules | Confirmed (counted 12 modules). |

### What the prior report missed

1. **`agent_feedback` POST is missing a runId/agent cross-check** (H2 above). The `kind` constraint and per-user RLS policy don't catch this. New finding.
2. **`LUMEN_PREVIEW` gates `/api/bq/*` but not `/api/agents/*`** (M1 addendum). The middleware is asymmetric — preview deployments expose `aria/generate` unauthenticated.
3. **Reports use mock data in production paths** (M5). Worth flagging because of the customer-trust risk (CSMs sending fake numbers under client labels).
4. **The Reports "share link" is non-functional** (M4 caveat). Today's URL only resolves on the author's machine. Not a leak, but a UX claim that doesn't match behaviour.
5. **`npm audit`** flags one moderate CVE (M7) on the postcss bundled inside `next/dist`. Fix-available recommendation is wrong — do not accept the auto-downgrade.
6. **`agent_feedback` text/rating columns are unbounded** in the schema (`agent_feedback.text` is `text` with no length check). Combined with H2, an attacker can write large text against another user's run. Migration fix: `check (length(text) <= 2000)`.

---

## Out-of-repo items needing review

- **Clerk dashboard:** sign-up restriction (e.g. `@yellowhead.com` email allowlist), session lifetime, password policy, social provider scopes, allowed callback URLs.
- **GCP IAM** on the BigQuery service account shipped via `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Confirm the SA has read-only access to only the datasets and views Lumen needs (`BQ_DATASET`, plus the `rivery_activity_anlytics.v_rivery_activity_check` view used by `freshness`). Reject `bigquery.jobs.create` against any other dataset.
- **Supabase project:** confirm RLS is `enabled` (not just `force` vs. `enable`) on `pinned_tiles`, `ask_queries`, `agent_feedback` — the migration enables it, but a one-line assertion via the Supabase MCP / SQL editor (`select tablename, rowsecurity from pg_tables where schemaname='public'`) closes the loop. Today the API uses service-role and bypasses RLS, so this is defence-in-depth only, but worth verifying.
- **Vercel project envs:** confirm `LUMEN_PREVIEW` is unset on production. Confirm `HF_TOKEN` is unset on preview unless rate-limiting / auth ships first.
- **Sentry project:** PII scrubbing config (default-on for `@sentry/nextjs` v10, but worth verifying), DSN scope, who has read access.
- **PostHog project:** property denylist for `client` / `from` / `to`; session-replay masking config (we couldn't find it enabled in the SDK init, so likely off — verify).
- **HF account / FAL account:** spend caps so an unrate-limited `aria/generate` call can't burn unlimited budget.
- **Network** between Vercel and BigQuery: VPC-SC perimeter on the GCP project would be worth considering if any client account becomes especially sensitive.

---

## Recommended actions, in order

1. **Patch the four `/api/bq/100play/*` routes** to reject `client !== "100play"` with 403 before delegating, and add the same assertion inside `query100playKPIs/_Trend/_ChannelMix/_Campaigns/_DataBounds`. Five-minute change.
2. **Fix `agent_feedback` POST**: in `addFeedback`, `select agent_id from agent_runs where id = :runId` and reject on mismatch; add a length cap on `text`. Add the same length check at the DB level via a migration.
3. **Harden `aria/generate`**: validate `typeof prompt === "string" && prompt.length <= 2000`, drop the `body` field from the error response, add `await auth.protect()` (or an explicit `getUserId()` call) inside the route, ship a per-user rate limit, and either remove `HF_TOKEN` from preview env or include `/api/agents/(.*)` in the BQ-style preview-protected matcher.
4. **Decide on per-user client authorization** before the first external pilot. Add a `client_membership` table and `assertUserCanAccess(userId, client)` next to `assertClientAllowed`. Drives H1 and H3 closure.
5. **Add a CI guard** that production builds fail when `LUMEN_PREVIEW` is set.
6. **Decide what to do about Reports**: either gate the page behind a "demo only" banner that survives PDF export, or wire `generateReport` to BQ before any CSM uses it for a real client.
7. **Re-run `npm audit --omit=dev` weekly** until the bundled-postcss CVE inside `next/dist` is patched upstream. Do NOT accept the `--fix` recommendation to downgrade Next.
8. **Schedule the CSP nonce work** as part of the next API-surface growth — `'unsafe-inline'` is fine for closed alpha, not for launch.
9. **Tighten PostHog** capture: either disable `capture_pageview` and emit your own scrubbed events, or configure a property denylist on `client`/`from`/`to`.
10. **Verify Supabase RLS state out-of-band** (`select tablename, rowsecurity from pg_tables where schemaname='public'`) and configure the Clerk → Supabase JWT bridge so the dormant per-user policies become live defence-in-depth.

---

## Notes

- This review is read-only; no code was changed.
- `npm audit` was run against production deps only (`--omit=dev`) for signal:noise reasons. Re-run with dev deps for completeness before launch.
- I did not validate the Supabase RLS state at runtime (no direct DB access from this session). The SQL in the migration is correct; whether RLS is actually `enabled` on the live project is the out-of-band check above.
- I did not run a TypeScript build or the Playwright suite.
