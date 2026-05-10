# Lumen Security Review — 2026-05-10

**Reviewer:** Claude Code (Opus 4.7) acting as product-partner reviewer
**Scope:** Full repo at `main@39456ec` — Next.js 15 app, Clerk auth, Sentry/PostHog
telemetry, mock data layer, Playwright e2e suite. No `/api` routes ship yet, no
real DB queries reach production yet.
**Method:** Static review of source, `npm audit`, git-history scan for
secret-shaped strings, route-and-middleware enumeration, CSP/headers analysis.
No live pentest, no fuzzing, no dynamic auth-bypass attempts.

---

## TL;DR

This is a hardened-by-default codebase. The security posture is well above
the median for an early-stage Next.js project: explicit CSP with all the
expected headers, Clerk middleware on every non-public route, server-only
markers on sensitive modules, env validation helpers, no `dangerouslySetInnerHTML`,
no `eval`, no inline secrets in committed source (after the rotation today),
and a dedicated unauthenticated security-test project in Playwright.

The findings below are mostly hardening polish and one real authn boundary
issue (open sign-up). Nothing critical is currently exploitable in a way
that would justify a hot-fix push tonight.

| Severity | Count | Already remediated |
|----------|-------|--------------------|
| Critical | 0     | —                  |
| High     | 1     | 1 (password leak)  |
| Moderate | 3     | 0                  |
| Low      | 4     | 0                  |
| Info     | 3     | 0                  |

---

## What's already strong

- **Headers.** CSP, X-Frame-Options DENY, HSTS preload, COOP/CORP,
  Permissions-Policy, X-Content-Type-Options nosniff, no `X-Powered-By`. CSP
  notably drops `unsafe-eval` already — `unsafe-inline` is the only relaxation
  left, and it's TODO-tracked in `next.config.ts:6`.
- **Auth.** `clerkMiddleware` with a tight public-route allowlist
  (`/sign-in`, `/sign-up`, `/welcome`, `/monitoring`). PREVIEW bypass is
  hard-gated to `NODE_ENV !== "production"` — even a leaked `LUMEN_PREVIEW=1`
  in prod env can't bypass auth.
- **Source-map exposure.** `productionBrowserSourceMaps: false`. Sentry gets
  the maps, the public bundle doesn't.
- **Env handling.** `src/lib/env.server.ts` is `server-only` and uses lazy
  getters; `env.client.ts` only exposes `NEXT_PUBLIC_*`. No accidental client-
  side leakage of server keys.
- **No custom API surface yet.** Zero `/api` routes, zero Server Actions
  (`grep '"use server"'` is empty). The attack surface is genuinely small.
- **Test discipline.** Auth flow goes through Clerk's testing token (no
  password handling in browser code paths); storageState path
  (`/tests/.auth/`) is gitignored.

---

## Findings

### F-1 · Leaked test password persists in git history
- **Severity:** High pre-rotation → **Low** post-rotation (already mitigated)
- **Location:** `scripts/create-e2e-user.mjs:36` in commit `8fc5ce4`
- **What:** A static Clerk test-user password was committed in plaintext.
  GitHub Generic-Password scanner flagged it.
- **Status:** Source fixed in `39456ec` (env-var only). Clerk user
  `lumen-e2e@example.com` deleted today, killing the live credential.
- **Residual risk:** The literal password is still readable in commit
  `8fc5ce4` forever. Without the Clerk user, it has no value — but if you
  ever recreate a user with the same password, the leak goes live again.
- **Recommendation:** Don't reuse the leaked string. Optionally rewrite git
  history to scrub it (force-push required, breaks others' checkouts, doesn't
  undo GitHub scanner cache — usually not worth it).

### F-2 · Open public sign-up against the production Clerk instance
- **Severity:** Moderate (assumes prod Clerk; informational if every env uses
  a separate dev Clerk org)
- **Location:** `src/middleware.ts:13` and `src/app/sign-up/[[...sign-up]]/page.tsx`
- **What:** `/sign-up` is in the public-routes allowlist. yellowHEAD is an
  internal agency tool — anyone with the deploy URL can create an account
  and reach `/dashboard`.
- **Why this matters:** Clerk allows allowlist/blocklist by email domain at
  the instance level; without it, the only thing keeping outsiders out is
  obscurity of the URL. That's not a security boundary.
- **Recommendation:** One of:
  1. **Best:** In Clerk dashboard, set sign-up restrictions
     (domain allowlist for `@yellowhead.com` / known partner domains).
  2. **Or:** Remove the `/sign-up` route entirely from this app — invite-only
     via Clerk's admin-create flow. Drop the route from
     `src/app/sign-up/...` and from `isPublicRoute` in middleware.
  3. **Or:** Add an application-level allowlist check in middleware that
     redirects unknown emails to a "request access" page after Clerk auth.

### F-3 · `fast-uri` transitive vulnerability (high CVSS 7.5)
- **Severity:** Moderate (high CVSS, but reachability is limited — used only
  by Clerk SDK URL parsing)
- **Location:** `node_modules/fast-uri` (transitive via `@clerk/nextjs`)
- **What:** GHSA-q3j6-qgpj-74h6 (path traversal via percent-encoded dots)
  and GHSA-v39h-62p7-jpjc (host confusion).
- **Recommendation:** `npm audit fix` will bump to `fast-uri >3.1.1`. Verify
  Clerk still passes its e2e tests after the bump.

### F-4 · `'unsafe-inline'` in `script-src`
- **Severity:** Moderate (already TODO-tracked, but worth calling out)
- **Location:** `next.config.ts:9-10`
- **What:** Next.js App Router still ships inline bootstrap scripts at the
  top of every HTML response, requiring `'unsafe-inline'` in `script-src`.
  This neutralizes most of the XSS protection CSP would otherwise provide.
- **Recommendation:** Implement nonce-based CSP via middleware before the
  first `/api` route ships. Pattern: generate a per-request nonce in
  `src/middleware.ts`, set it on the response header, read it from
  `headers()` in `src/app/layout.tsx`, pass to `<Script nonce={...} />`.
  Documented as Phase-1 TODO already.

### F-5 · `Math.random()` for ID generation
- **Severity:** Low
- **Location:** `src/lib/pins/store.ts:39`, `src/lib/reports/generate.ts:15`
- **What:** Pin and report IDs are built from `Date.now() +
  Math.random().toString(36)`. These IDs are **not** auth tokens, just UI
  state keys, so the practical risk is collisions / predictability of which
  pin a user just pinned — not a confidentiality boundary.
- **Recommendation:** Swap to `crypto.randomUUID()` for cleanliness and
  Edge-runtime parity. Five-line change, no behavior delta.

### F-6 · Sentry tunnel `/monitoring` is unauthenticated by design
- **Severity:** Low (accepted)
- **Location:** `src/middleware.ts:18`, `next.config.ts` `tunnelRoute`
- **What:** The route accepts any POST body and forwards to Sentry. Anyone
  who knows the path can submit forged events to your Sentry project.
- **Why low:** Sentry validates the DSN server-side; forged events get
  attributed to the project but can't access user data or escalate.
  Worst-case is noise/cost on the Sentry plan.
- **Recommendation:** Accept as-is unless you start seeing Sentry quota
  abuse. If that happens, add basic rate limiting + DSN match in middleware.

### F-7 · No CSP `report-uri` / `report-to`
- **Severity:** Low
- **Location:** `next.config.ts`
- **What:** If a CSP violation happens in production, no signal is captured.
  You'll only learn about CSP regressions from broken pages.
- **Recommendation:** When the first `/api` route ships, add
  `/api/csp-report` and a `report-to` directive in CSP. Sentry's
  `Sentry.captureMessage` is fine as the receiver.

### F-8 · `test-results/.last-run.json` tracked despite `.gitignore`
- **Severity:** Low (hygiene, not security)
- **Location:** repo root
- **What:** Already added to `.gitignore` but the file is still in the index
  from a prior commit, so every Playwright run dirties the working tree.
- **Recommendation:** `git rm --cached test-results/.last-run.json && git commit`.
  The .gitignore rule will then take effect.

### F-9 · CSP `connect-src` and `script-src` use broad Clerk wildcards
- **Severity:** Info
- **Location:** `next.config.ts:11,16`
- **What:** `https://*.clerk.accounts.dev` and `https://*.clerk.com` are
  required for Clerk's preview/dev deploys. In production with a stable
  Clerk frontend domain, these can be tightened to a single origin.
- **Recommendation:** Tighten when you commit to a Clerk frontend API host
  for prod (e.g., `https://clerk.lumen.yellowhead.com`).

### F-10 · `Cross-Origin-Resource-Policy: same-site`
- **Severity:** Info
- **Location:** `next.config.ts` `securityHeaders`
- **What:** `same-site` is appropriate when third-party widgets load
  resources cross-subdomain. `same-origin` is stricter but may break Clerk's
  hosted UIs.
- **Recommendation:** Try `same-origin` in a preview deploy; if Clerk still
  works, ship the tighter value.

### F-11 · Sentry `widenClientFileUpload: true`
- **Severity:** Info (accepted)
- **Location:** `next.config.ts`
- **What:** More than the default set of compiled JS files is uploaded to
  Sentry for symbolication. Trade-off: better stack traces vs. more code
  surface visible inside your Sentry org.
- **Recommendation:** Leave on — Sentry org is already a trusted boundary.

---

## Out of scope for this review

- **No /api routes** → no SQL injection, SSRF, IDOR, or rate-limiting
  surface to test. When the first BigQuery-backed route ships, this review
  needs a follow-up focused on input validation, parameterized queries, and
  per-user authorization.
- **No real PII handling** → mock data only. PII review needed when
  client/agency data starts flowing from Rivery.
- **No CI/CD review** → no `.github/workflows/` files visible at scan time.
  When CI is wired, audit secret usage in actions, OIDC for Vercel, and
  third-party action pinning.

---

## Phase 2 — proposed fix plan

Triage, then dispatch in this order. Numbers map to findings above.

**Wave A — quick wins, no auth-flow risk (do first):**
- F-3 `npm audit fix` for `fast-uri`
- F-5 `Math.random` → `crypto.randomUUID`
- F-8 untrack `test-results/.last-run.json`

**Wave B — auth boundary (medium risk, needs dashboard work + code):**
- F-2 lock down sign-up. Recommend option 1 (Clerk dashboard email-domain
  allowlist) — zero code change, fastest to ship. Option 2 (delete
  `/sign-up` route) is the most defensive and worth doing if the Clerk
  dashboard option isn't available on your plan.

**Wave C — hardening, needs care:**
- F-4 nonce-based CSP. Touches middleware + root layout + every `<Script>`.
  Defer until first `/api` route ships, do both at once.
- F-7 CSP report endpoint. Wire alongside F-4.
- F-9 CSP origin tightening. Defer until production Clerk frontend host
  is fixed.

**Won't fix this round:**
- F-1 history rewrite (rotation already neutralized the leak).
- F-6 unauthenticated `/monitoring` (working as designed).
- F-10/F-11 (informational).

---

## Test updates needed

For each Wave A/B fix that lands, add or update an e2e spec:

- **F-3:** No new test — existing suite covers Clerk sign-in; if the
  fast-uri bump breaks Clerk URL parsing, the existing `auth.setup.ts`
  fails loudly.
- **F-5:** Unit-style assertion in a small Playwright spec (or just visual
  inspection) — IDs should match the new UUID shape, not the old
  `pin_*` / `rpt_*` shape. Worth updating any specs that grep for the old
  prefix.
- **F-2 (option 2 — remove route):** Add a security spec that asserts
  `GET /sign-up → 404` in the unauthenticated chromium project.

---

## Re-review trigger conditions

Schedule a follow-up audit when **any** of these happen:
- First `/api` route ships
- First real BigQuery query path ships
- Any new third-party SDK joins the CSP allowlist
- Clerk plan changes (sign-up restrictions become available/unavailable)
- Any new file under `scripts/` gets committed (regression check on
  hardcoded credentials)

---

*End of review.*
