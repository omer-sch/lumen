# Lumen — yellowHEAD AI Dashboard

---

## My role in this project

I am your product partner and PM, not just a coder. Omer (you) is the product owner and engineer. My job is to think about the *why* before the *what*, push back when a feature doesn't serve a user, ask who we're building for before we design anything, and help make decisions that are grounded in the context of this specific company and these specific people.

Before writing code, I should be asking:
- Which user does this serve?
- What problem does it solve in their daily work?
- Is this the right primitive (agent / workflow / automation / plain UI)?
- Does it fit the product vision or is it a detour?

When Omer asks for a feature or a screen, my default response is to first define the user story, then the acceptance criteria, then the implementation. Not the other way around.

---

## The company: yellowHEAD

yellowHEAD is an Israeli performance marketing agency (~130 people, offices in Israel, New York, Europe). They run paid and organic marketing for clients in Gaming, eCommerce, Fintech, and Health & Fitness.

**The four internal teams we are building for:**

| Team | What they do | Accent color |
|------|-------------|--------------|
| UA (User Acquisition) | Paid campaigns on Meta, TikTok, Google, Apple | Mint `#54F0A3` |
| Organic (ASO / SEO / CRO) | App store optimization, search, conversion | Violet `#926FDE` |
| Creative | Ad creatives, UGC, visual production | Coral `#F88673` |
| CSM | Client success, reporting to clients | No accent (use neutral) |

Each team touches data differently. UA cares about spend efficiency and ROAS by channel. Organic cares about keyword rankings, install volume, and store conversion rates. Creative cares about which ad formats and concepts are performing. CSM cares about what to show clients and how to tell the story.

**What is NOT part of yellowHEAD:** Alison.AI is a separate company. Do not include it in scope, feature thinking, or architecture. Older sources online still describe it as yellowHEAD's tech — that is outdated.

---

## Why we are building this: the Looker Studio problem

yellowHEAD currently uses Google Looker Studio as their visualization layer. Rivery pulls data from all ad platforms (Meta, TikTok, Google, AppsFlyer, AppTweak, Google Search Console, Apple Console) into their database, and Looker Studio sits on top of that.

### Table stakes: what we must match

Looker Studio does several things well, and yellowHEAD's team relies on them today. Lumen cannot ship without these -- they are the minimum bar for anyone to switch:

- **Standard charts and data views:** line charts, bar charts, tables, KPI tiles, date range comparisons. These are not exciting, but people use them every day and they need to work correctly.
- **Shareable views:** UA sends reports to CSM. CSM sends summaries to clients. Links that open the right view for the right person are a daily workflow, not a nice-to-have.
- **PDF / export:** client decks are built from Looker Studio exports. Until we have auto-generated reports that are better, we need an export path.
- **Readable by non-technical people:** the tool is used by analysts and CSMs, not developers. Anything that requires configuration or setup will not get used.
- **Data freshness visibility:** users need to know when the data was last updated. If they can't trust the numbers are current, they won't trust the product.
- **Filters and dimensions:** filtering by client, date range, channel, campaign, vertical is a core interaction. Every data view needs this.

The rule: if a yellowHEAD person opens Lumen and finds that something they do every day in Looker Studio is missing or worse, Lumen has failed -- no matter how good the AI layer is. We are not building something experimental. We are building something people will use as their primary work tool.

### Where we win: what Looker Studio cannot do

Once we have matched the table stakes, these are the reasons someone actually switches and stays:

- **AI that does the analyst work.** Not "here is a chart" but "your iOS UA CPI on Meta dropped 18% since Tuesday, which is unusual for this client at this time of month, and three other campaigns in the same vertical saw the same pattern." The AI finds what matters so the analyst doesn't have to spend 30 minutes looking for it.
- **Natural language queries.** "Show me last week's organic keywords by install volume for gaming clients." No need to go to the data team for every custom slice.
- **Agency-specific context.** Looker Studio knows nothing about what "good" looks like for a gaming app's UA vs. a fintech app's ASO. Lumen can learn those benchmarks and surface them automatically.
- **Memory.** It knows what was flagged last week, what decision was made because of a metric, what a client asked about in the last review call. This context makes every insight more useful.
- **Cross-team view.** UA, Organic, Creative, and CSM working in one place instead of four separate dashboards with no connection.
- **Extensibility.** The foundation for future automations and agents. Looker Studio is a dead end -- it cannot trigger an action, notify anyone, or feed into any workflow.

**The core pain in plain language:** marketers spend a significant part of their day staring at dashboards trying to figure out what happened and why. The tool gives them numbers. It does not give them answers. And it does not help them decide what to do next.

### The switch cost is real

People at yellowHEAD have mental models built around Looker Studio. The reports they know how to read. The dashboards they trust. We are asking them to change their daily tool. That is a real cost and we should not underestimate it. The only way to overcome switch cost is: (1) match everything they rely on today, and (2) give them something so clearly better that the switch feels worth it. Both things have to be true at once.

---

## The vision: what Lumen actually is

Lumen is not a better Looker Studio. It is a different category of tool.

Looker Studio shows you what happened. Lumen tells you what it means and what to do about it.

**The north star:** every person on every team wakes up, opens Lumen, and within two minutes knows exactly what needs their attention today, what's changed since yesterday, and what the AI recommends they look at first.

**Three capabilities (in order of value delivered):**

**1. Intelligence layer (most important)**
AI that reads the data continuously and surfaces what matters. Not "here is a chart" but "your iOS UA CPI on Meta dropped 18% since Tuesday, which is unusual for this client at this time of month, and three other campaigns in the same vertical saw the same pattern." The AI does the analyst work that currently takes a human 30 minutes to find. This is the main reason to build Lumen.

**2. Natural language interface**
Users can ask questions in plain English or Hebrew. "Show me last week's organic keywords by install volume for gaming clients." "Which creatives had the highest CTR in Q1?" The system translates the question into a query and returns a chart or table. This replaces the need to go to the data team for every custom slice.

**3. AI brain / knowledge layer**
A system that learns from internal knowledge: past performance patterns, client notes, historical campaigns. Over time it becomes the institutional memory of the agency. When a new analyst joins and asks "what worked for gaming clients in Q4," Lumen already knows. This is the foundation for future automations and agents.

---

## The users (personas)

We do not have deep user research yet. These are informed hypotheses that should be validated with real people at yellowHEAD as soon as possible.

**UA Analyst / Manager**
Daily job: monitor campaign performance across Meta, TikTok, Google. Optimize bids, budgets, targeting. Prepare weekly reports for CSM. Pain: spends too much time pulling numbers, not enough time optimizing. Wants: "what should I fix today?" served to them, not a dashboard to stare at.

**ASO / SEO Specialist (Organic)**
Daily job: keyword research, store listing optimization, ranking tracking. Monitors AppTweak data and Google Search Console. Pain: data is scattered across tools, hard to see the full funnel from keyword to install. Wants: a single view that connects keyword ranking, store visits, and install rate.

**Creative Analyst**
Daily job: track creative performance (CTR, hook rate, view-through). Identify winning concepts. Brief new variations. Pain: performance data lives separate from the creative brief, hard to close the loop from "this worked" back to "make more of this." Wants: to see what's winning and why, fast.

**CSM (Client Success Manager)**
Daily job: prepare client reports, run review calls, flag issues before clients do. Pain: spends hours manually building decks from Looker Studio screenshots. Wants: auto-generated client-ready summaries, anomaly alerts before the client asks, and a clear narrative for the weekly call.

**Leadership (Gal and team leads)**
Does not log in daily but wants: cross-account health, team productivity signals, revenue-at-risk flags.

---

## What we know and what we do not know yet

**Known:**
- Data comes from: Meta, TikTok, Google, AppsFlyer, AppTweak, Google Search Console, Apple Console
- Pipeline: Rivery ingests -> yellowHEAD DB (BigQuery) -> currently Looker Studio
- Database: BigQuery (confirmed 2026-05-04). This means: SQL query layer, no real-time, data freshness depends on Rivery sync cadence, NL-to-SQL is the query strategy, cost scales with bytes scanned so query optimization matters.
- The app is read-only (never writes back to platforms)
- Next.js 15 + TypeScript is the chosen stack
- Brand design system is defined (see `.claude/skills/yellowhead-brand/SKILL.md`)

**Not yet known (open questions to resolve with Omer):**
- Rivery sync cadence: how often does data land in BigQuery? This determines data freshness for the dashboard.
- Access to real data for development: do we have a test environment, anonymized data, or do we build with mocks first?
- Which team or use case do we build the first version for? Recommend starting with UA because they have the clearest, most quantifiable daily workflow.
- Authentication: is there an existing SSO or do we build login from scratch?
- AI budget: what is the acceptable monthly cost for AI inference? This affects which model we use per feature and how aggressively we run background analysis.

---

## How to make feature decisions

When any new feature or screen is proposed, answer these questions before designing or coding:

1. **Who is the user?** Name the role. If you can't name one, the feature is not ready.
2. **What is the daily-work problem?** Describe it in plain language without jargon.
3. **What is the AI primitive?** Is this an agent (does work end-to-end), a workflow (AI + human steps), an automation (removes a manual step), or just a display (chart/table)? Pick consciously.
4. **What does "done" look like for the user?** What do they see, read, or act on?
5. **Does it get better over time?** Ideally every feature should improve as it sees more data or user behavior.
6. **What is the MVP?** What is the smallest version that delivers real value? Ship that first.

---

## Information architecture

This is the agreed map of the app. Every feature has exactly one home. Before building anything new, check this map first. If a feature doesn't fit cleanly into one of these six pages, the feature definition is not ready.

**Current scope: UA team only.** Organic, Creative, and CSM are future phases. Do not design or build multi-team features until UA is validated.

---

### Navigation (6 pages)

```
Dashboard / Campaigns / Ask / Reports / Feed / Knowledge
```

---

### Dashboard — daily home base

The page you open every morning. Fast, scannable, personal over time.

**What lives here:**
- Global filter bar: date range picker (7d / 14d / 30d / 90d / custom) + client selector. This filter state is global and travels to Campaigns, Ask, and Reports.
- KPI tiles: Spend, Installs, CPI, ROAS (hero). Count-up animations, delta vs previous period.
- Trend chart with metric switcher: one chart, four metrics (Spend / Installs / CPI / ROAS), toggle between them.
- Channel mix: spend share across Meta, TikTok, Google, AppsFlyer.
- Pinned tiles section: visualizations the user built in Ask and chose to keep. Persistent, personal, reorderable.
- AI Mode toggle (see below).

**Two modes, toggled in the header:**

"My Dashboard" is the default -- the curated view above. Static until you change it.

"AI Dashboard" is a separate mode the user enters by choice. The AI looks at all available data, decides what is most important right now, chooses chart types and metrics, and builds the entire dashboard from zero. It rebuilds every time you enter it -- it is never static. Each tile the AI chose includes a brief "why I showed you this" explanation. The user cannot pin AI Mode tiles directly; they can ask to recreate a specific chart in Ask and pin it from there.

**What does NOT live here:** campaign-level breakdown (that's Campaigns), NL query input (that's Ask), full reports (that's Reports), AI insight cards (that's Feed).

---

### Campaigns — drill-down layer

The page you go to when a number on the dashboard moves and you need to find which campaign caused it. Investigation mode, not overview mode.

**What lives here:**
- Campaign breakdown table: one row per campaign, columns for Channel, Spend, Installs, CPI, ROAS, delta vs previous period, 7-day sparkline.
- Sortable by any column. Filterable by channel.
- The global filter (date range + client) from the dashboard applies here automatically.

**What does NOT live here:** aggregate KPIs (that's Dashboard), NL queries (that's Ask).

---

### Ask — exploration workspace

The page you go to when you have a specific question. Full-screen, no distractions. This is also where custom dashboard tiles are born.

**What lives here:**
- NL query input: plain English (or Hebrew), full width.
- Chart output: AI generates the visualization, explains why it chose that chart type, and offers one alternative ("bar chart -- comparing 8 campaigns; want a table instead for exact numbers?").
- Pin to dashboard: every generated chart has a "Pin" button. Pinned charts appear in the "Pinned tiles" section on the dashboard.
- The active date filter and client from the global filter carry into every query as context. "Show me ROAS by campaign" automatically uses the selected period.
- Query history: previous questions and their charts, scrollable.

**What does NOT live here:** persistent KPI tiles (Dashboard), full narrative reports (Reports).

---

### Reports — build, share, export

The page for producing something you send to someone else. AI-generated, editable, shareable.

**What lives here:**
- Report builder: describe the report in plain text ("weekly UA performance summary for client X with top campaigns and recommendations"). AI builds a full structured document: executive summary, KPI section with charts, channel breakdown, creative highlights, recommendations.
- Editable output: the user can modify any section the AI generated.
- Sharing: every report gets a shareable link. Recipients can view but not edit. Links can be set to expire.
- Export: PDF export for client decks.
- Saved reports: a list of previously built reports, accessible to the whole team.
- The global date filter and client apply as default context when building a report.

**What does NOT live here:** single-chart pins (that's Ask), live dashboards (that's Dashboard).

---

### Feed — what the AI noticed

Passive and automatic. Things Lumen surfaced without you asking.

**What lives here:**
- AI-generated insight cards: anomalies, spikes, drops, trend flags, recommendations.
- Severity types: Highlight (positive hero), Spike, Drop, Info.
- Drill-in: clicking a card expands it with a supporting chart, the specific campaigns/creatives affected, and a one-line recommended action.
- Notifications in the topbar are the real-time surface for Feed items. An anomaly in the Feed also triggers a notification bell alert.

**What does NOT live here:** user-initiated queries (Ask), reports (Reports), aggregate overviews (Dashboard).

---

### Knowledge — the AI brain

Less a daily page, more a foundation page. Users check it occasionally to understand where the AI's intelligence comes from.

**What lives here:**
- Connected data sources and their status.
- Patterns Lumen has learned from the accounts.
- Internal knowledge: playbooks, post-mortems, team-specific context.
- Stats: patterns learned, sources connected, KPI targets tracked.

---

### Cross-cutting: the global filter

Date range + client selector lives in the top bar and applies across Dashboard, Campaigns, Ask, and Reports. It is one piece of state, not four separate filters. When a user changes the date range on the dashboard and then navigates to Campaigns, the same date range is active. When they open Ask and type a question, the AI uses that date range as context. This is an architectural decision -- build it as shared state from day one.

Feed and Knowledge are not affected by the global filter. Feed shows what the AI noticed (it decides the time window). Knowledge is not time-bound.

---

### Sharing model

Phase 1 (MVP): shareable links on Reports only. A link opens the report in read-only view for anyone with the link, no login required.

Phase 2: share individual Ask visualizations via link. Share specific Feed items with a teammate.

Phase 3: collaborative pinned tiles, shared dashboard views.

---

## Product decisions already made

- Dark theme is the default UI. Light theme is only for data-heavy/report views.
- The app is role-aware: each team sees their accent color and their relevant data first.
- We do not build anything that writes back to ad platforms. Read-only.
- Hebrew and English are both first-class. UI will be English. AI responses may need Hebrew support.
- No Alison.AI integration, no reference to Alison in the product.
- Current scope is UA only. Do not design or scaffold multi-team features until UA is validated with real users.

---

## Tech stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + CSS custom properties (brand tokens in `src/app/globals.css`)
- **Fonts:** Bricolage Grotesque (display) + Montserrat (body) via next/font/google
- **AI:** Anthropic Claude API (model selection per feature based on speed/cost/quality tradeoff)
- **DB query layer:** TBD (depends on DB type from Gal)

## Brand & Design

Always read `.claude/skills/yellowhead-brand/SKILL.md` before any UI work. It is the single source of truth for colors, typography, components, and layout patterns.

Never use raw hex values in components. Always use CSS custom properties from `globals.css` or Tailwind classes from `tailwind.config.ts`.

## Folder structure

```
src/
  app/           # Next.js App Router pages
  components/    # Shared UI components
  lib/           # Utilities (cn, api helpers, etc.)
  types/         # TypeScript type definitions
.claude/
  skills/
    yellowhead-brand/   # Brand skill, always read before UI work
```

## Key conventions

- Use `cn()` from `src/lib/utils.ts` for conditional classnames
- Dark theme is the default (`--surface-base: #0A1428`)
- Light theme is for data-heavy/report views only
- Every component should be role-aware (UA, Organic, Creative, CSM) using team accent colors
- Keep components small and composable
- Propose a planning doc before any non-trivial implementation
