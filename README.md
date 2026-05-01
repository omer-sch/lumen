# Lumen

**An AI-native performance marketing dashboard for yellowHEAD — a ~130-person agency running paid and organic marketing for clients in Gaming, eCommerce, Fintech, and Health & Fitness.**

Lumen replaces Looker Studio as the primary work surface for the User Acquisition team. Looker shows what happened. Lumen tells you what it means and what to do next.

> Built with Next.js 15, TypeScript, Clerk, Tailwind, Recharts, and the Anthropic Claude API. Deployed on Vercel with Sentry + PostHog observability.

---

## Why this project exists

yellowHEAD's analysts spend hours every day staring at dashboards trying to figure out *why* a number moved. The tool gives them charts. It does not give them answers, and it does not help them decide what to do next.

Lumen is a different category of product:

1. **Intelligence layer** — AI reads the data continuously and surfaces what matters. Not "here is a chart" but "your iOS UA CPI on Meta dropped 18% since Tuesday, which is unusual for this client at this time of month."
2. **Natural language interface** — "Show me last week's organic keywords by install volume for gaming clients." No more pinging the data team for every custom slice.
3. **Institutional memory** — The agency's knowledge layer. New analyst joins, asks "what worked for gaming clients in Q4," and Lumen already knows.

---

## The product surface

Six pages, each with a single clear job:

| Page | What it does |
|------|--------------|
| **Dashboard** | Daily home base. KPI tiles, trend chart with metric switcher, channel mix, pinned tiles. Toggle into "Lumen Dashboard" mode where the AI rebuilds the entire view from scratch and tells you why each tile is there. |
| **Campaigns** | Drill-down. Sortable, filterable campaign table with deltas and sparklines, with per-campaign profile pages for investigation. |
| **Ask** | Full-screen NL query workspace. Ask in plain English, get a chart, pin it to your dashboard. |
| **Reports** | AI-generated, editable, shareable client reports with PDF export. |
| **Feed** | Anomalies, spikes, drops, and recommendations the AI noticed without being asked. |
| **Knowledge** | The AI's brain — connected sources, learned patterns, internal playbooks. |

A **global filter bar** (date range + client) is shared state across Dashboard, Campaigns, Ask, and Reports — change it once, it follows you.

---

## Engineering highlights

This is what I'd want a recruiter to know about how it's built.

### Security as a first-class priority
- **Clerk auth at the edge** — `middleware.ts` protects every route before the page or API handler runs. No client-trusted identity.
- **Server-only secrets** — Anthropic, Clerk, and DB credentials never touch the browser. Strict `NEXT_PUBLIC_` discipline.
- **Hardened headers** — CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` configured per environment.
- **Read-only by design** — Lumen never writes back to ad platforms.
- **Preview-mode source guard** — `LUMEN_PREVIEW` is hard-gated behind `NODE_ENV !== "production"` with regression tests to prove it.
- **49 security-focused E2E tests** in Playwright covering auth flows, route protection, header policies, and source-guard regressions.

### Architecture
- **Next.js 15 App Router** with TypeScript end-to-end. Routes split between an unauthenticated `(auth)` group and an authenticated `(app)` group with shared layout, sidebar, and topbar.
- **Component architecture** organized by feature (`analytics`, `ask`, `campaigns`, `dashboard`, `feed`, `reports`) plus a shared `ui` primitive layer (`GlassCard`, `CountUpNumber`, `LivePulse`, `Skeleton`, `EmptyState`, `SectionBreak`).
- **Brand-token system** — every color, radius, and shadow flows from CSS custom properties in `globals.css`. No raw hex in components, no off-brand shortcuts. Team accent colors (`--color-ua`, `--color-organic`, `--color-creative`) drive role-aware UI.
- **Mock data layer** decoupled from the UI so the real DB can be wired in without frontend changes.

### Observability and operations
- **Sentry** for client, server, and edge error tracking with CSP-compatible configuration.
- **PostHog** for product analytics.
- **Vercel** deployment with preview/prod separation and proper environment isolation.

### Design system
A custom dark-mode-first design language with glass-morphism cards, mint-led UA accents, restrained yellow brand moments, and count-up + stagger motion as the baseline interaction grammar. Every component is role-aware via a `team` prop.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Auth | Clerk + Clerk Themes |
| Styling | Tailwind CSS + CSS custom properties |
| Charts | Recharts |
| Fonts | Bricolage Grotesque (display) + Montserrat (body) |
| AI | Anthropic Claude API (server-side only) |
| Testing | Playwright (E2E, security-focused) |
| Observability | Sentry + PostHog |
| Hosting | Vercel |

---

## Running locally

```bash
# Install
npm install

# Configure environment
cp .env.local.example .env.local
# Fill in Clerk keys, Anthropic key, Sentry DSN, PostHog key

# Develop (Turbopack)
npm run dev

# Type-check + lint
npm run lint

# E2E tests
npm run test:e2e
npm run test:e2e:ui   # interactive
```

---

## Project structure

```
src/
  app/
    (app)/           # Authenticated app — dashboard, campaigns, ask, reports, feed, knowledge
    sign-in/         # Clerk auth pages
    sign-up/
    welcome/         # First-login cinematic + once-per-day light greeting
    globals.css      # Brand tokens + design system
    layout.tsx
  components/
    analytics/       # KPI tiles, trend charts, channel mix
    ask/             # NL query workspace
    auth/
    campaigns/       # Campaign table, row, profile pages
    dashboard/
    feed/
    reports/
    shell/           # Sidebar, topbar, app frame
    ui/              # GlassCard, CountUpNumber, LivePulse, Skeleton, EmptyState, ...
  lib/               # cn(), data adapters, helpers
  middleware.ts      # Edge auth + route protection
tests/e2e/           # Playwright security + flow tests
```

---

## Status

Phase 0 — UA team only. Visual shell, mock data, full auth, end-to-end design system, security baseline, and observability stack are all live. Real data integration with Rivery + the agency warehouse is the next milestone.

---

## About me

Built by **Omer Schreiber** as the product engineer and product owner for this internal yellowHEAD tool. Every decision in this repo — from "do not put yellow accents on routine pages" to "global filters are one piece of state, not four" — is documented in [`CLAUDE.md`](./CLAUDE.md) and [`SPEC.md`](./SPEC.md) so future contributors (and recruiters) can read the *why* behind the code, not just the code.

Reach me at **schreiber.omer@gmail.com**.
