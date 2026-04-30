# Lumen — App Spec

yellowHEAD's AI-powered performance dashboard. Replaces Looker Studio.

---

## Priorities

1. **Security** — non-negotiable, no exceptions. Every feature, route, API call, and data access must be locked down before it ships. If something isn't secure, it doesn't go in.
2. **Design** — the brand is the product. Every pixel follows the yellowHEAD brand system. No raw colors, no off-brand components, no shortcuts.

---

## Security

Security is the first thing to get right, not the last. These rules apply everywhere, always.

**Authentication**
- All routes are protected by Clerk. No page, no API route, no data is accessible without a valid authenticated session.
- Middleware (`middleware.ts`) enforces auth at the edge — before any page or API handler runs.
- Never trust the client for identity. Always verify server-side using Clerk's server SDK.

**API routes**
- Every `app/api/` route checks the session at the top before doing anything else.
- No route exposes data without confirming who is asking and that they're allowed to see it.
- Never expose raw DB queries, internal errors, or stack traces to the client.
- All Claude API calls happen server-side only. The Anthropic API key never touches the browser.

**Environment variables**
- All secrets (Clerk keys, Anthropic API key, DB credentials) live in `.env.local` only.
- `.env.local` is in `.gitignore` — it never gets committed.
- No secret is ever imported in a client component or passed to the frontend.
- Prefix convention: only `NEXT_PUBLIC_` variables are safe for the browser. Everything else is server-only.

**Data**
- Lumen is read-only. No write operations to any external platform, ever.
- Role-based access: users only see data for their team. This is enforced server-side, not just hidden in the UI.
- When real data is wired in: all DB queries are parameterized — no string interpolation, no SQL injection risk.

**Dependencies**
- Keep dependencies minimal. Every package added is a potential attack surface.
- No packages that require client-side access to secrets.

**Headers**
- Vercel deployment includes security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP.

---

## Stack

- **Framework:** Next.js 15 (App Router) + TypeScript + React
- **Auth:** Clerk (sign in, sign up, user management, org support)
- **Styling:** Tailwind CSS + CSS custom properties (brand tokens in `globals.css`)
- **Fonts:** Bricolage Grotesque (display) + Montserrat (body)
- **AI:** Anthropic Claude API (for analysis, natural language queries, anomaly detection)
- **Data:** Demo/mock data for now — real DB TBD, wired in later without frontend changes
- **Deployment:** Vercel

---

## Three Capabilities

### 1. Dashboards
Unified performance views across ad platforms (Meta, TikTok, Google, AppsFlyer). KPI cards, charts, trend lines. Role-aware: each team (UA, Organic, Creative, CSM) sees their own view with their accent color.

### 2. Natural Language Queries
A text input where the user asks a question — "how did our Meta spend perform this week?" — and gets back a chart or data table. Powered by Claude.

### 3. AI Analysis Feed
A live feed of anomalies, trends, and recommendations surfaced automatically. No manual digging. The AI watches the data and flags what matters.

---

## Phase 0 Goal

Get a working visual shell with:
- Clerk auth (sign in / sign up working)
- App shell: sidebar nav, top bar, main content area
- UA dashboard page with demo data (KPI cards + one chart)
- Empty states for Natural Language and AI Feed pages
- Brand fully applied (dark navy theme, yellow accents, UA mint)

No real data. No API calls to external platforms. Just the vision on screen.

---

## Design

Design is the second priority and it's not negotiable either. The brand is how yellowHEAD shows up — Lumen has to look like it belongs to the same family as the brand book.

Always read `.claude/skills/yellowhead-brand/SKILL.md` before touching any UI. That skill is the source of truth for every visual decision.

Dark theme by default (`--surface-base: #0A1428`). Never use raw hex — always CSS custom properties or Tailwind brand classes.

Team accent colors:
- UA: `--color-ua` (`#54F0A3`)
- Organic: `--color-organic` (`#926FDE`)
- Creative: `--color-creative` (`#F88673`)

---

## Conventions

- `cn()` from `src/lib/utils.ts` for conditional classnames
- Components live in `src/components/`
- Pages in `src/app/` (App Router)
- Keep components small and composable
- Every component that relates to a team takes a `team` prop
