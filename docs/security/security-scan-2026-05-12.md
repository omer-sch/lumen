# Lumen Security Scan

**Date:** 2026-05-12
**Scope:** Full Lumen codebase at `/Users/omer/Desktop/Lumen`
**Reviewer:** Claude (PM/strategist), reading files directly. Agents were rate-limited mid-scan so I finished the review by hand against the security-critical surfaces.
**Method:** Read every file under `src/middleware.ts`, `src/lib/bq*`, `src/lib/env*`, `src/lib/db/*`, `src/app/api/**`, `next.config.ts`, `package.json`, plus a sweep for `dangerouslySetInnerHTML`, `eval`, `fetch(`, `localStorage`, and share-link plumbing.

---

## TL;DR

Lumen's security posture is, on the whole, much better than I expected for an early-stage product. The hard parts (SQL injection on a BigQuery layer with user-controlled client slugs and date ranges, secret handling, CSP, server-only enforcement, auth middleware) are done thoughtfully and with code comments that show the threat model was considered. There is no exploitable critical issue I can confirm right now.

Three things deserve attention before launch:

1. The `/api/bq/100play/*` routes accept any allowlisted `client` slug but always query 100play's hardcoded table. Not a true data-leak (every authenticated user can already query every allowlisted client through the regular `/api/bq/*` routes), but the route should reject `client !== "100play"` to keep the access model coherent.
2. `lucide-react` is pinned at `^1.14.0`, which is not a real release line for that package (real versions live in `0.x`). This needs verification, either a typo or a supply-chain concern.
3. The `aria/generate` route echoes raw Hugging Face error bodies to the client, has no rate limit, no prompt length cap, and accepts non-string prompt values past the truthy check.

The most important architectural gap is that **every authenticated user can query every allowlisted client**. There is no per-user client authorization. That is a product decision more than a vulnerability, but it is worth making explicit before yellowHEAD opens this beyond a small alpha.

---

## Critical

None confirmed exploitable.

---

## High

### H1. `/api/bq/100play/*` routes ignore the requested client and always serve 100play data

**Files:** `src/app/api/bq/100play/dashboard-kpis/route.ts`, `trend`, `channel-mix`, `campaigns`, `data-bounds` (all under the same folder)
**Code path:** route calls `query100playKPIs(params.client, ...)` -> `_queryDashboardKPIs` -> `assertClientAllowed(client)` -> queries the hardcoded `dwh_fb2_ios14_appsflyer_100play` table regardless of the slug.

**Behaviour today:** if a logged-in user GETs `/api/bq/100play/dashboard-kpis?client=globalcomix&from=...&to=...`, they get **100play's** spend numbers back, served under a globalcomix-flavoured cache key (`bq:kpis:100play, "globalcomix", ...`).

**Severity:** Currently "high" rather than "critical" only because every authenticated Lumen user is already allowed to see every allowlisted client (see "Per-user authorization gap" below). If you ever add per-user client scoping, this path becomes a hard authorization bypass.

**Fix:** in each 100play route, reject `params.client !== "100play"` with 403 before delegating. One line per route, plus a 100play-specific assertion inside `query100playKPIs` for defence in depth.

### H2. `lucide-react` pinned at `^1.14.0` — version line does not match the real package

**File:** `package.json` line 25
**Why this matters:** lucide-react's real release line is `0.x` (latest versions in May 2025 are around 0.400+). `1.14.0` is not a version I can place on that package. Two plausible explanations: (a) you meant `^0.14.0` or `^0.x` and it was a typo; (b) something installed from a different registry, or a malicious typosquat made it in. Either way, this needs eyes before the next `npm install`.

**Fix:** `npm view lucide-react versions --json` in a clean environment, confirm what is actually resolved, and pin to a real published version. Audit `package-lock.json` for the resolved tarball URL and integrity hash.

---

## Medium

### M1. `aria/generate` echoes Hugging Face raw error body to the client

**File:** `src/app/api/agents/aria/generate/route.ts` line 65: `return NextResponse.json({ error: errMsg || "Hugging Face request failed", body }, ...)`.
**Risk:** when HF returns a non-loading error, the unparsed JSON or text body is sent back to the browser. That can include model names, account routing info, or upstream diagnostics. Low value to an attacker, but it does narrow the "what is Lumen doing under the hood" question for free.
**Fix:** drop the `body` field from the response; keep logging it server-side.

### M2. `aria/generate` has no rate limit, no prompt length cap, no auth on the prompt itself

**File:** same route.
**Risk:** a logged-in user can call it repeatedly and burn through `HF_TOKEN` budget. Prompts of unbounded length flow straight into the HF API. The `prompt` field is typed `string` but the runtime check is just `if (!prompt)` so any truthy value (number, object) makes it through to `JSON.stringify`.
**Fix:** add `typeof prompt === "string" && prompt.length <= 2000` validation. Add a per-user IP or `userId` rate limit. Both are 10-20 line additions.

### M3. CSP includes `'unsafe-inline'` on `script-src` and `style-src`

**File:** `next.config.ts` line 10.
**Status:** known and commented (`// TODO Phase 1`). Calling it out so it does not get forgotten before a real launch. Next.js App Router can run nonce-based CSP via middleware; this is the right time to wire it before the API surface grows.

### M4. PostHog captures pageviews including URL query params

**File:** `src/components/analytics/PostHogProvider.tsx`. `capture_pageview: true` means PostHog receives full URLs including `?client=globalcomix&from=...&to=...`. With `person_profiles: "identified_only"` it does not auto-create profiles, but the URL itself is captured per session.
**Risk:** PostHog now sees which client a Lumen user is viewing and over what date range. Likely fine internally, but worth knowing before yellowHEAD adds an external user.
**Fix:** either set `capture_pageview: false` and emit your own scrubbed pageview events, or configure PostHog property denylists for `client`, `from`, `to`.

### M5. Reports persist to `localStorage`

**File:** `src/lib/reports/store.ts`. Acknowledged as Phase 1 in the comments (Phase 2 swaps to authenticated REST). Once Reports contain real BQ numbers and client names, those will sit on the user's device unencrypted, surviving logout. Not a leak across users on a single machine, but it is data residency that an enterprise customer will ask about.
**Fix:** Phase 2 migration is already planned; note it on the launch checklist.

### M6. No per-user authorization on which clients a user can query

**Files:** middleware + every `/api/bq/*` route.
**Behaviour:** auth is "are you logged in to Lumen at all". Once you are, every allowlisted client is queryable. There is no notion of "this analyst is on the GlobalComix team and should not see Playw3's spend."
**Severity:** This is a product decision more than a code defect, but yellowHEAD has client confidentiality obligations. Worth deciding consciously before the first external pilot.
**Fix:** add a `client_membership` table (user_id, client_slug), plumb a `assertUserCanAccess(userId, client)` check next to `assertClientAllowed`. Cache keys would need to remain per-client (not per-user) for hit rate.

---

## Hardening / low

- **`/api/bq/freshness`** has no params and is reachable by any authenticated user. It queries a hardcoded `rivery_activity_anlytics.v_rivery_activity_check` view. Not sensitive (just a max date), but it bypasses the allowlist machinery and uses a dataset that is hardcoded outside `BQ_DATASET`. If `BQ_PROJECT` is ever pointed at a non-yellowHEAD project, the freshness query will fail or hit an unintended view.
- **`/monitoring`** Sentry tunnel is public by design (Clerk cannot authenticate the Sentry SDK). Sentry tunnels can in principle be abused as a generic proxy; in practice `@sentry/nextjs`'s tunnel handler restricts forwarding to the configured DSN. Worth eyes on a SDK upgrade.
- **`getUserId()`** in non-prod falls back to `PREVIEW_USER_ID = "seed_user_dev"` if auth is missing and `LUMEN_PREVIEW=1`. The guard `NODE_ENV !== "production" && LUMEN_PREVIEW === "1"` is correct, but the convention to "fail closed" if either is wrong relies on Vercel never setting `LUMEN_PREVIEW=1` in prod. Add a CI check that production builds reject `LUMEN_PREVIEW` set to anything.
- **Mock data leakage check:** `src/lib/mock/*` is imported only by frontend components (TopBar client selector, Pinned visualizations, AI mode panel). No production API route serves mock data as real. The `client` field on mock data uses readable slugs, not realistic-looking secrets. Clean.
- **No `dangerouslySetInnerHTML`, no `eval`, no `new Function`** anywhere under `src/`. Verified by grep.
- **All outbound `fetch` calls** in server code target hardcoded URLs (`HF_MODEL_URL` only) or relative `/api/*` paths (browser fetches). No SSRF surface.

---

## Looks good (verified)

- **BigQuery query construction** correctly separates user-controlled values (dates, via `assertIsoDate` regex + parameterized query) from server-controlled identifiers (`spendCol`, `revenueCol`, `dedupePredicate`, table names — all from `CLIENT_SCHEMA`/`CLIENT_TO_TABLE` static maps, never client input). `bq-queries.ts` uses `params: { from, to }` everywhere. `bq-security.ts` resolves the table from a static record after an allowlist check. SQL injection is not reachable.
- **`bqErrorResponse`** translates errors to generic 400/403/500 codes and never echoes the raw BQ error to the browser. `bq-queries.ts` `InvalidDateError` is the right shape for "user sent garbage" vs. "BigQuery failed."
- **`server-only` import** is present on every module that touches secrets: `env.server.ts`, `bq.ts`, `bq-security.ts`, `bq-queries.ts`, `bq-queries-100play.ts`, `db/user.ts`, `db/client.ts`, `db/pins.ts`. Belt-and-braces against client bundle leaks.
- **Security headers in `next.config.ts`** are real and complete: HSTS with preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy with camera/mic/geo/cohort denied, COOP same-origin, CORP same-site, `poweredByHeader: false`, no production source maps. CSP is restrictive aside from the documented `'unsafe-inline'` script TODO.
- **PREVIEW bypass is double-gated** (`NODE_ENV !== "production"` AND `LUMEN_PREVIEW === "1"`) and BQ routes stay behind Clerk even in preview. Comment on lines 6-9 of `middleware.ts` shows the failure mode was thought through.
- **Per-user data scoping is correct where it exists.** Pins, ask history, and agent feedback all filter by the Clerk `userId` from `getUserId()`. `removePinForUser` filters by `eq("user_id", userId).eq("id", pinId)` so a user cannot delete someone else's pin by guessing an id.

---

## Recommended next actions, in order

1. **Verify `lucide-react@^1.14.0`.** This is the only finding that could be active right now. Resolve the version, check the lockfile integrity hash, repin to a real published version.
2. **Patch the four `/api/bq/100play/*` routes** to reject any `client !== "100play"`. Five-minute change, removes the confusing access shape.
3. **Decide on per-user client authorization** before the first external pilot. This is a product/contract decision, not a code one, but the answer drives a non-trivial implementation.
4. **Harden `aria/generate`**: drop the echoed HF error body, validate `prompt` is a string with a length cap, add a per-user rate limit. Half a day of work.
5. **Add a CI guard** that production builds fail if `LUMEN_PREVIEW` is set. Trivial.
6. **Schedule CSP nonce work** alongside the next API growth — `'unsafe-inline'` is acceptable for a closed alpha, not for a launched product.

---

## Notes on what was not covered

- **Live dependency CVE scan.** I do not have a real-time CVE feed; the dependency observations above are based on my knowledge cutoff. Run `npm audit --production` and `npm outdated` against the lockfile and treat that as authoritative.
- **Clerk dashboard configuration.** Things like password policy, allowed callback URLs, social provider scopes, and session lifetimes live in the Clerk admin console, not in code. They need a separate review.
- **GCP IAM on the service account.** `GOOGLE_APPLICATION_CREDENTIALS_JSON` ships a service account into the Lumen runtime. The account's IAM scope in BigQuery (which datasets, which tables, read vs write) is a GCP-side review, not visible in this repo.
- **Sentry DSN scope and project access.** Same logic, lives outside the repo.
- **The 130-person yellowHEAD network.** Anyone on the corporate VPN who can reach the Lumen deployment will be subject to whatever Clerk allows. Whether sign-up is restricted to `@yellowhead.com` emails is a Clerk dashboard setting.
- **The two parallel agent scans I tried to launch hit the per-window rate limit before they finished.** This report is mine alone. If you want a second pair of eyes from a separate agent run, retry after the 6pm reset and point them at this file as the baseline.
