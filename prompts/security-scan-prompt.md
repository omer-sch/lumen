# Prompt: Full security scan on Lumen

Paste the block below into Claude Code from inside the Lumen repo.

---

You are doing a full security review of this codebase. The repo is Lumen, a Next.js 15 + TypeScript app for yellowHEAD (a performance marketing agency). It queries BigQuery on behalf of authenticated marketers and shows them campaign performance. Read CLAUDE.md first for product context.

## Stack you'll be looking at

- Next.js 15 App Router, React 19, TypeScript
- Clerk for auth (`src/middleware.ts` + `src/app/sign-in`, `sign-up`)
- BigQuery via `@google-cloud/bigquery` (`src/lib/bq*.ts`)
- Supabase service-role for user-scoped storage (`src/lib/db/*`)
- Sentry (`@sentry/nextjs`, tunneled through `/monitoring`)
- PostHog analytics (`src/components/analytics/PostHogProvider.tsx`)
- Hugging Face for image generation (`src/app/api/agents/aria/generate/route.ts`)
- A `LUMEN_PREVIEW=1` env-gated auth bypass for non-prod design work

## Scope

In scope: everything under `src/`, `next.config.ts`, `package.json`, `.env.local.example`, `middleware.ts`, any auth/data/env config.

Out of scope (mention but do not deep-dive): Clerk dashboard config, GCP IAM, Sentry project settings, anything that lives outside the repo. Note them as "needs out-of-band review."

## What to look for

Cover these areas. The starred items are the highest-leverage:

1. **Auth and middleware (high priority)**
   - Is the Clerk gate applied to every sensitive route?
   - Is the `LUMEN_PREVIEW` bypass watertight (gated on both `NODE_ENV !== "production"` AND `LUMEN_PREVIEW === "1"`)? Could production accidentally enable it?
   - Public routes (`/sign-in`, `/sign-up`, `/welcome`, `/monitoring`) — confirm none of them expose sensitive data.

2. **BigQuery / SQL injection (high priority)**
   - Trace every query in `src/lib/bq-queries.ts` and `src/lib/bq-queries-100play.ts`.
   - For every user-controllable input (`client`, `from`, `to`, anything from `request.nextUrl.searchParams`), confirm it flows through parameterized queries (`params: {...}`) and NOT string interpolation.
   - For every interpolated identifier (column names, table names, dedupe predicates), confirm it comes from a server-side static map, never user input.
   - The `client` slug allowlist in `src/lib/bq-security.ts` — verify it is actually airtight.

3. **Per-tenant / horizontal authorization (high priority)**
   - Does any `/api/*` route trust an ID from the request without scoping it to the current user?
   - Pins, ask history, agent feedback — confirm every Supabase query filters by `userId` from `getUserId()`.
   - The 100play routes — do they enforce `client === "100play"`, or do they accept any allowlisted client and silently serve 100play data?

4. **Secrets and env handling**
   - Anything secret leaking into `NEXT_PUBLIC_*`?
   - Are server-only modules properly marked with `import "server-only"`?
   - Hardcoded tokens or service-account JSON anywhere outside `.env.local.example` and `node_modules`?
   - `env.server.ts` and `env.client.ts` — verify the split is clean.

5. **External calls (SSRF / prompt injection)**
   - Every `fetch(` in server code — confirm URL is hardcoded or from a fixed allowlist. No `fetch(userControlledUrl)`.
   - `aria/generate` — does it validate `prompt` is a string with a length cap? Does it leak HF error bodies back to the client? Does it rate-limit?
   - Any other LLM/AI call that concatenates user input with system instructions?

6. **Frontend / XSS**
   - Grep for `dangerouslySetInnerHTML`, `eval(`, `new Function(`. Should be zero.
   - Reports are described as editable and shareable, Ask renders LLM output — confirm React's default escaping is doing its job and nothing is injecting raw HTML.
   - `localStorage` / `sessionStorage` usage — is anything sensitive being persisted that shouldn't be?
   - Open redirects: `router.push`, `redirect`, `window.location` assignments that take user input.

7. **Headers and CSP**
   - `next.config.ts` headers block. Confirm HSTS, X-Frame-Options, COOP/CORP, Permissions-Policy, Referrer-Policy are all set.
   - CSP — is `'unsafe-inline'` / `'unsafe-eval'` present, and if so, scoped tightly? Source maps disabled in prod?

8. **Sharing model**
   - The product spec says Reports get shareable links. Find the implementation. If links exist, are they unguessable (high-entropy tokens) or sequential IDs?
   - If sharing is not implemented yet, say so.

9. **Analytics / PII**
   - PostHog config: does it capture URL query params (`?client=globalcomix&from=...`)? Is session replay enabled with masking? Is `person_profiles` set to `"identified_only"`?
   - Sentry: is PII scrubbing on? What's in `/monitoring` traffic?

10. **Dependencies**
    - Read `package.json`. Flag anything pinned to a version line that doesn't match real published versions (typo or supply-chain risk).
    - Specifically verify `lucide-react`'s version — a prior report claims `^1.14.0` is suspicious. Confirm or refute by running `npm view lucide-react versions --json` and checking `package-lock.json` for the resolved tarball and integrity hash.
    - Run `npm audit --production` and report results.

## What's already been found (verify, don't just rediscover)

A prior report is at `docs/security/security-scan-2026-05-12.md`. Read it first. Your job is to:
- **Verify** each finding it lists. Confirm whether each is still accurate, and add a line saying so.
- **Push back** on anything you disagree with. If a "looks good" item is actually broken, say so.
- **Find what it missed.** That report was time-constrained. Be more thorough on dependency CVEs, on the Supabase RLS posture, on every API route's input validation, and on Sentry/PostHog config details.

Specifically dig deeper on:
- The `lucide-react@^1.14.0` pin (highest-priority finding to confirm or refute)
- The 100play route authorization shape
- Whether `aria/generate` has any rate limiting
- Whether any production code path imports from `src/lib/mock/*`
- Whether Supabase RLS is enabled on the tables `pinned_tiles`, `ask_history`, `agent_feedback`. Check `supabase/migrations` or schema if present. If not present, flag that.

## Output format

Produce a single markdown file at `security-scan-<today>.md` in the repo root. Structure:

1. **TL;DR** — three to five sentences. Posture, top risks, urgency.
2. **Critical** — exploitable right now. Each finding: file:line, one paragraph of explanation, one-line fix.
3. **High** — likely exploitable or close to it. Same format.
4. **Medium** — hardening / latent risk. Shorter.
5. **Low / informational** — short list.
6. **Looks good (verified)** — three to five specific things you confirmed are done right. No generic "uses TypeScript" entries.
7. **Delta from prior report** — what you confirmed, what you disagreed with, what you found that it missed.
8. **Out-of-repo items needing review** — Clerk dashboard, GCP IAM, Sentry config, Supabase RLS migrations.
9. **Recommended actions, in order.** Numbered. Each one a single sentence of work.

## Rules

- Tie every finding to a real file path (and line number where it makes sense). No generic boilerplate.
- Do not edit any code. This is a read-only review.
- If you cannot determine something with certainty (e.g. Supabase RLS state without seeing migrations), say so explicitly rather than guessing.
- Be terse. Reports get read; essays get skimmed.
