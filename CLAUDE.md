# Lumen — yellowHEAD AI Dashboard

## What is this project

Lumen is a web application that replaces Google Looker Studio for yellowHEAD, an Israeli performance marketing agency. It connects to yellowHEAD's existing data infrastructure and adds an AI intelligence layer on top.

## The three core capabilities

1. **Analysis** — AI-powered trend detection, anomaly alerts, and performance recommendations across campaigns
2. **Natural language dashboards** — build and query charts and KPIs through free-text questions
3. **AI brain** — knowledge system that learns from internal data and serves as the foundation for future agents and automations

## Tech stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + CSS custom properties (brand tokens in `src/app/globals.css`)
- **Fonts:** Bricolage Grotesque (display) + Montserrat (body) via next/font/google

## Brand & Design

This project uses the **yellowhead-brand** skill located at `.claude/skills/yellowhead-brand/SKILL.md`.

Always read that skill before making any design or UI decisions. It contains:
- The full color system (primary + team accent colors)
- Typography rules (Bricolage Grotesque for titles, Montserrat for body)
- Component specs (cards, buttons, inputs, nav, badges)
- Layout patterns for dark-theme dashboards and light-theme data views
- Team color associations: UA = mint `#54F0A3`, Organic = violet `#926FDE`, Creative = coral `#F88673`

**Never use raw hex values in components.** Always use CSS custom properties from `globals.css` or Tailwind classes from `tailwind.config.ts`.

## Data infrastructure (context)

- **Rivery** pulls data from Meta, TikTok, Google, AppsFlyer (MMP), AppTweak, Google Search Console, Apple Console
- Data lands in yellowHEAD's database (type TBD — likely BigQuery or PostgreSQL)
- The app only READS data, never writes back to platforms
- Teams: UA, Organic (ASO/SEO/CRO), Creative, CSM

## Folder structure

```
src/
  app/           # Next.js App Router pages
  components/    # Shared UI components
  lib/           # Utilities (cn, api helpers, etc.)
  types/         # TypeScript type definitions
.claude/
  skills/
    yellowhead-brand/   # Brand skill — read before any UI work
```

## Key conventions

- Use `cn()` from `src/lib/utils.ts` for conditional classnames
- Dark theme is the default (`--surface-base: #0A1428`)
- Light theme is for data-heavy/report views only
- Every component should be role-aware (UA, Organic, Creative, CSM) using team accent colors
- Keep components small and composable
