# Lumen ✨

> **AI-Powered Performance Marketing Dashboard for yellowHEAD**

[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=flat-square&logo=clerk&logoColor=white)](https://clerk.com)
[![Claude API](https://img.shields.io/badge/Claude_API-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Sentry](https://img.shields.io/badge/Sentry-362D59?style=flat-square&logo=sentry&logoColor=white)](https://sentry.io)
[![PostHog](https://img.shields.io/badge/PostHog-000?style=flat-square&logo=posthog&logoColor=white)](https://posthog.com)
[![Vercel](https://img.shields.io/badge/Vercel-000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)

**Lumen** is the AI-native replacement for Looker Studio at yellowHEAD — a ~130-person performance marketing agency running paid and organic campaigns for clients in Gaming, eCommerce, Fintech, and Health & Fitness. Built end-to-end as the new daily home base for the User Acquisition team.

---

## What It Does

Marketing analysts spend hours every day staring at dashboards trying to figure out *why* a number moved. Looker Studio shows what happened. Lumen tells you what it means and what to do next.

- **Surfaces what matters automatically** — AI reads spend, installs, CPI, and ROAS continuously and flags anomalies, spikes, and drops in plain language ("iOS UA CPI on Meta dropped 18% since Tuesday — unusual for this client at this time of month")
- **Answers questions in plain English** — "Show me last week's organic keywords by install volume for gaming clients." Get a chart back. Pin it to your dashboard.
- **Generates client-ready reports** — describe what you want, get a structured, editable, shareable document with PDF export
- **Drills from KPI to campaign** — every number on the dashboard is one click away from the campaign that caused it
- **Stays read-only by design** — Lumen never writes back to ad platforms. Zero risk of accidental campaign changes.

---

## Modules

### 📊 Dashboard
Your daily home base. Fast, scannable, personal over time.

- **KPI tiles** — Spend, Installs, CPI, ROAS with count-up animations and delta vs previous period
- **Swappable metric slots** — pick what you want in each tile
- **Trend chart with metric switcher** — one chart, four metrics, toggle live
- **Channel mix** — spend share across Meta, TikTok, Google, AppsFlyer
- **Pinned tiles** — visualizations you built in Ask, persistent and reorderable
- **Lumen Dashboard mode** — the AI rebuilds the entire view from zero, picks chart types, and tells you why each tile is there

### 🎯 Campaigns
Drill-down investigation layer. When a number moves, find which campaign caused it.

- Sortable, filterable campaign table — Channel, Spend, Installs, CPI, ROAS, deltas, 7-day sparklines
- Per-campaign profile pages with full historical context
- Global filter (date range + client) carries from the dashboard automatically

### 💬 Ask
Full-screen NL workspace. The exploration layer.

- Plain-English (or Hebrew) query input
- AI generates the chart, explains why it picked that chart type, and offers one alternative
- One-click pin to dashboard
- Active filter context flows into every query
- Query history scrollable

### 📄 Reports
Build, share, export. Client-ready output.

- Describe the report in plain text — AI builds executive summary, KPIs, channel breakdown, creative highlights, recommendations
- Edit any section
- Shareable links (read-only, optionally expiring)
- PDF export for client decks

### 📡 Feed
What the AI noticed without being asked.

- AI-generated insight cards — anomalies, spikes, drops, highlights
- Severity types (Highlight / Spike / Drop / Info)
- Drill-in with supporting chart, affected campaigns, recommended action
- Notification bell hooks into the topbar

### 🧠 Knowledge
The AI's brain.

- Connected data sources and live status
- Patterns Lumen has learned from accounts
- Internal playbooks and team-specific context
- Stats: patterns learned, sources connected, KPI targets tracked

---

## Security Architecture

Security is the first thing to get right, not the last. The whole product is built around this.

| Layer | Implementation |
|-------|---------------|
| **Auth** | Clerk + edge middleware on every route. No page or API runs without a verified session. |
| **Identity** | Server-side verification only. Client identity is never trusted. |
| **Secrets** | Anthropic, Clerk, and DB credentials are server-only. `NEXT_PUBLIC_` discipline enforced. |
| **Headers** | CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` configured per environment. |
| **Read-only** | Zero write paths to ad platforms. Architectural, not accidental. |
| **Preview guard** | `LUMEN_PREVIEW` hard-gated behind `NODE_ENV !== "production"` with a regression test to prove it. |
| **Test coverage** | 49 security-focused Playwright E2E tests across 4 spec files — auth flows, route protection, header policies, source-guard regressions. |

---

## AI Architecture

Lumen uses Claude (Anthropic) as the intelligence layer. All AI calls happen server-side — the Anthropic API key never touches the browser.

```
User question → /api/ask
                    │
                    ▼
            Context Builder ← global filter (date range + client)
                    │           pre-aggregated KPIs
                    │           recent anomalies from Feed
                    ▼
                Claude API
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    Chart spec              Narrative
    (Recharts JSON)         (why this chart, alternative)
        │                       │
        └───────────┬───────────┘
                    ▼
           Pinnable visualization
```

The AI consumes precomputed summaries — never raw records — to stay fast and cost-efficient. Each chart comes with a one-line "why I picked this" explanation and a suggested alternative.

### Hermes observability (LangSmith)

Hermes runs are traceable end-to-end through LangSmith when opted in. Every paste-to-draft (and Gmail-watch-to-draft) run shows up at app.smith.langchain.com as one clickable trace: the five-node graph (`parse_intent` → `analyze` → `quill` → `atelier` → `review_gate`), each Anthropic SDK call inside a node as a child span with the model id + prompt + response, and each BigQuery query (`bq.networks`, `bq.campaigns`, `bq.trend`) as a duration-bearing tool span.

To enable, get an API key at smith.langchain.com → Settings → API keys, then add to `.env.local`:

```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=lumen-hermes-dev
```

Restart the dev server. The runs surface under the configured project; filter by `run_id`, `client`, `platform`, or `channel` tags. Opt-out is the default (with `LANGSMITH_API_KEY` empty, the `traceable()` wrappers are no-ops and nothing phones home). Tests force tracing off in `tests/unit/setup.ts`.

---

## The Global Filter

Date range + client selector is shared state across Dashboard, Campaigns, Ask, and Reports — one source of truth, not four. Change it on the dashboard, navigate to Campaigns, the same filter is active. Open Ask, type a question, the AI uses that filter as context. This is an architectural decision, built as shared state from day one.

Feed and Knowledge are intentionally not affected — Feed picks its own time window, Knowledge isn't time-bound.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript — strict |
| Styling | Tailwind CSS + CSS custom properties (brand tokens) |
| Auth | Clerk + Clerk Themes |
| Charts | Recharts |
| Fonts | Bricolage Grotesque (display) + Montserrat (body) via next/font |
| AI | Anthropic Claude API (server-only) |
| Testing | Playwright (E2E, security-focused) |
| Error tracking | Sentry (client + server + edge) |
| Product analytics | PostHog |
| Hosting | Vercel |

---

## Design System

A custom dark-mode-first design language built on the yellowHEAD brand book.

| Surface | Token |
|---------|-------|
| Base background | `--surface-base` (`#0A1428`) |
| UA accent | `--color-ua` (`#54F0A3`) |
| Organic accent | `--color-organic` (`#926FDE`) |
| Creative accent | `--color-creative` (`#F88673`) |
| Brand yellow | reserved for hero moments — never on routine pages |

- **Glass-morphism cards** as the primary container primitive
- **Mint-led UA accents** with restrained yellow hero moments
- **Count-up + stagger motion** as the baseline interaction grammar
- **Role-aware components** — every team-touching component takes a `team` prop and renders in the right accent
- **Zero raw hex** in components — every color flows from CSS custom properties in `globals.css`

UI primitives: `GlassCard`, `GlassBulb`, `GlassIcon`, `CountUpNumber`, `LivePulse`, `Skeleton`, `EmptyState`, `SectionBreak`.

---

## Project Structure

```
src/
├── app/
│   ├── (app)/                # Authenticated app
│   │   ├── dashboard/        # KPIs, trends, channel mix, pinned tiles
│   │   ├── campaigns/        # Table + per-campaign profile pages
│   │   ├── queries/          # Ask — NL query workspace
│   │   ├── reports/          # AI-generated, editable, shareable
│   │   ├── feed/             # Anomalies + recommendations
│   │   └── knowledge/        # Sources, patterns, playbooks
│   ├── sign-in/              # Clerk auth
│   ├── sign-up/
│   ├── welcome/              # First-login cinematic + once-per-day greeting
│   ├── globals.css           # Brand tokens + design system
│   └── global-error.tsx      # Sentry error boundary
├── components/
│   ├── analytics/            # KPI tiles, trend charts, channel mix
│   ├── ask/                  # NL query workspace
│   ├── auth/                 # Clerk shells
│   ├── campaigns/            # Table, row, profile
│   ├── dashboard/
│   ├── feed/
│   ├── reports/
│   ├── shell/                # Sidebar, topbar, app frame
│   └── ui/                   # GlassCard, CountUpNumber, LivePulse, ...
├── lib/                      # cn(), data adapters, helpers
└── middleware.ts             # Edge auth + route protection
tests/e2e/                    # Playwright security + flow tests
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- A Clerk application
- An Anthropic API key
- (Optional) Sentry DSN + PostHog key

### Setup

```bash
git clone https://github.com/omer-sch/lumen.git
cd lumen
npm install
```

Copy `.env.local.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SENTRY_DSN=https://...
NEXT_PUBLIC_POSTHOG_KEY=phc_...
```

Start dev:

```bash
npm run dev          # Turbopack, http://localhost:3000
```

---

## Testing

```bash
npm run test:e2e        # Playwright — full E2E + security suite (49 tests)
npm run test:e2e:ui     # Interactive Playwright UI mode
npm run lint            # ESLint + Next.js rules
```

The security suite covers route protection, auth flows, CSP and header policies, and the `LUMEN_PREVIEW` source-guard regression.

---

## Status

**Phase 0 — UA team only.** Visual shell, mock data, full Clerk auth, end-to-end design system, security baseline, and observability stack are live. Real data integration with Rivery and the agency warehouse is the next milestone. Organic, Creative, and CSM team views are future phases.

---

## Built By

**Omer Schreiber** — sole developer. Designed, architected, and built end-to-end as the new performance marketing home base for yellowHEAD.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Omer_Schreiber-0077B5?style=flat-square&logo=linkedin)](https://linkedin.com/in/omer-schreiber-48b3912b6)
[![GitHub](https://img.shields.io/badge/GitHub-omer--sch-181717?style=flat-square&logo=github)](https://github.com/omer-sch)
[![Email](https://img.shields.io/badge/Email-schreiber.omer%40gmail.com-EA4335?style=flat-square&logo=gmail&logoColor=white)](mailto:schreiber.omer@gmail.com)
