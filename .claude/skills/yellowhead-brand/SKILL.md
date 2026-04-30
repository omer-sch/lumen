---
name: yellowhead-brand
description: |
  yellowHEAD brand design system and visual guidelines. Use this skill whenever building, designing, or reviewing any UI for yellowHEAD — including the dashboard, any web app, presentations, or any component. Trigger phrases include "design the dashboard", "what colors", "how should this look", "brand", "UI for yellowHEAD", "style this", "make it match the brand", "apply yellowHEAD design". This skill is the single source of truth for how everything visual at yellowHEAD should look and feel. Use it even when the user does not say "brand" explicitly — if they are asking about the look of any yellowHEAD product, this skill applies.
---

# yellowHEAD Brand System — 2025 Refresh

You are building for yellowHEAD, an Israeli performance marketing agency. This document is the complete design authority for any yellowHEAD product, app, or presentation. Apply these guidelines precisely and consistently. When in doubt, refer to the detailed token reference at `references/design-tokens.md`.

---

## Core Design Philosophy

These principles drive every decision:

- **Yellow is intentional, not abundant.** Use it for emphasis, CTAs, and key moments — not as a fill color everywhere. Yellow on deep navy creates the brand's signature clarity and hierarchy.
- **No decoration for its own sake.** Every visual element must serve the message. Remove anything that doesn't earn its place.
- **Flow and energy over static information.** In digital products, prioritize motion, breathing space, and interaction — not walls of content.
- **Real and human, not corporate and polished.** Imagery, tone, and UI should feel authentic. Avoid stock-photo stiffness.
- **Precision with flexibility.** The system is tightly defined so anyone on the team can use it with confidence, but it's designed to scale.

---

## Typography

Use these two font families and nothing else.

| Role | Font | Weight |
|------|------|--------|
| Page titles / hero text | Bricolage Grotesque | ExtraBold (800) |
| Section headings | Bricolage Grotesque | Bold (700) |
| Sub-headers | Montserrat | SemiBold (600) |
| Body text | Montserrat | Regular (400) |
| Text highlights / links | Montserrat | Regular (400) + accent color |

**Loading fonts:**
- Bricolage Grotesque: Google Fonts (`https://fonts.google.com/specimen/Bricolage+Grotesque`)
- Montserrat: Google Fonts (`https://fonts.google.com/specimen/Montserrat`)

**Hierarchy principle:** Big contrast between title and body. Bricolage Grotesque has natural personality and weight — let it breathe with generous line height. Montserrat reads cleanly at small sizes.

---

## Color System

### Primary Colors

| Name | Hex | Use |
|------|-----|-----|
| yellowHEAD Yellow | `#FFDD0C` | CTAs, highlights, brand moments, key metrics |
| Navy Blue | `#0A1428` | Primary background, dark surfaces, card backgrounds |
| Cloud White | `#FAFAFA` | Light background variant, data-heavy layouts, text on dark |

### Secondary / Team Colors

| Name | Hex | Team association | Use |
|------|-----|-----------------|-----|
| Coral Red | `#F88673` | Creative | Creative team badges, creative-related UI elements |
| Vivid Violet | `#926FDE` | Organic (ASO/SEO) | Organic team badges, organic metrics |
| Mint Green | `#54F0A3` | UA (Paid) | UA team badges, paid channel metrics |

### Color Usage Rules

- **Default app surface:** Navy `#0A1428` background with `#FAFAFA` text. This is the primary look.
- **Data/analytics layouts:** Can use Cloud White `#FAFAFA` background with dark text and navy separators.
- **Yellow usage:** Buttons, active states, key KPI numbers, chart highlights, selected nav items. Never use yellow as a large background except for specific branded moments (e.g., a hero section or loading screen).
- **Team colors:** Use consistently for team-specific sections, filter tags, chart lines per team, legend dots.
- **Avoid:** Random accent colors not in this palette. No gradients unless they use palette colors.

---

## Backgrounds

Three canonical background styles, all with a subtle sand-grain texture and soft light flares:

### 1. Deep Navy (Primary)
- Base: `#0A1428`
- Feel: Confident, premium, perfect for presentations and dashboards
- Use: Default app background, presentation slides, modal overlays

### 2. Light Gray (Data)
- Base: `#F5F5F5` / `#FAFAFA`
- Feel: Clean, minimal, readable
- Use: Data-heavy pages, tables, report views where high contrast text readability matters most

### 3. yellowHEAD Yellow (Brand moments)
- Base: `#FFDD0C`
- Feel: Bold, warm, unmistakably yellowHEAD
- Use: Loading screens, onboarding intros, celebration states, very limited hero sections

**All backgrounds share:** Subtle branded light flares in corners, soft sand-grain texture overlay (low opacity noise). This gives depth without clutter.

---

## Iconography

### Style: 3D Glass Icons

All icons use a glass-like 3D style. Key characteristics:
- Slightly flattened 3D form
- Physically accurate glass material — transparent, heavy, reflective
- Subtle realistic refraction with soft chromatic edges
- Natural photographic light reflections and highlights
- Smooth rounded edges, thick glass contours
- Premium, hyper-realistic finish
- Placed on dark navy background (`#0B1020`)
- Accent glow in yellow `#FFDD0C` or team accent color

**The light bulb is the primary brand icon** — it appears throughout yellowHEAD materials and represents insight, ideas, and performance.

**AI prompt for generating new icons:**
> "A slightly flattened 3D glass icon of [SHAPE]. Designed with real, physically accurate glass material — transparent, heavy, and reflective. Subtle realistic refraction with soft chromatic edges. The icon should look like an actual glass object photographed with a professional camera: natural light reflections, real photographic highlights, and believable surface imperfections. Smooth rounded edges, thick glass contours, and a premium, high-end finish. Placed on a removable dark blue background (#0B1020). Accented with bright highlights and a dynamic inner glow in [yellow #FFDD0C / coral #F88673 / violet #926FDE / mint #54F0A3]. Clean, sharp, luxurious, and hyper-realistic."

**Team icon color mapping:**
- General / brand: Yellow `#FFDD0C`
- UA: Mint `#54F0A3`
- Creative: Coral `#F88673`
- Organic: Violet `#926FDE`

---

## Photography & Imagery

- **Feel:** Authentic office moments, real people, warm light, soft yellow tones
- **Technique:** Main subject in sharp focus, environment gently blurred
- **Framing:** Images inside rounded shapes (border-radius: 16px–24px typical). Sometimes the subject "breaks out" of the shape boundary for a dynamic look.
- **Avoid:** Stock photo stiffness, overly staged corporate imagery, cold blue tones

In the dashboard/app context, use this style for team member avatars, client spotlight sections, and any human-facing imagery.

---

## UI Layout Patterns

### Dashboard / App (Dark Theme — Primary)

Follow these rules for the main product:

1. **Dark navy base.** `#0A1428` background everywhere by default.
2. **Cards:** Slightly lighter navy (`#0D1B35` or similar), 1px border `rgba(255,255,255,0.08)`, border-radius `12px`–`16px`.
3. **Key numbers / KPIs:** Large, bold, in `#FFDD0C` (yellow) or `#FAFAFA`. Yellow for the most important metric on a card, white for secondary.
4. **Charts:** Use team accent colors for data series. Yellow for totals or highlights. White/light gray for grid lines (very low opacity).
5. **Navigation:** Dark sidebar or top bar. Active item gets yellow left border or yellow text. Inactive items: `rgba(255,255,255,0.5)`.
6. **Buttons:** Primary = yellow `#FFDD0C` with dark text `#0A1428`. Secondary = outlined white or navy with white text. Danger = coral `#F88673`.
7. **Typography on dark:** Headings `#FAFAFA`, body `rgba(255,255,255,0.75)`, muted/labels `rgba(255,255,255,0.45)`.
8. **Spacing:** Generous. Don't pack elements. Use 24px–32px gaps between sections.

### Data / Report Layouts (Light Theme — Alternate)

1. Background: `#FAFAFA` or white
2. Dark navy separators and borders
3. Text: `#0A1428` on white
4. More focus on content density and readability than visual drama
5. Keep branded elements (logo, accent colors) present but subtle
6. Generous white space between sections

---

## Presentation Decks

### Brand / Pitch Decks (Dark)
1. Dark background always (`#0A1428`)
2. Minimal text — short, sharp messaging
3. Large, bold imagery
4. Clean, concise infographics
5. Brand logo visible on every slide
6. Dramatic, visually driven look

### Client / Data Decks (Light)
1. Light background (`#FAFAFA` or light gray)
2. Dark navy separators for structure and clarity
3. Distribute text across multiple slides — don't overload a single slide
4. Branded infographic elements (glass-style design language)
5. Fewer images, more focus on content and insights
6. Generous white space
7. Logo strip: yellowHEAD logo + client logo side by side

---

## Team & Service Structure (Context)

Understanding the teams helps design role-specific views correctly:

| Team | Color | Services |
|------|-------|---------|
| UA (Paid Media) | Mint `#54F0A3` | Paid UA, Influencers, Programmatic |
| Organic | Violet `#926FDE` | ASO, SEO, CRO |
| Creative | Coral `#F88673` | In-house studio, UGC, 2D/3D, AI video |
| CSM | (use yellow) | Client success, cross-team coordination |

The dashboard will have role-specific views. Apply the team color as the accent for that view's charts, active states, and section headers.

---

## Component Quick Reference

| Component | Spec |
|-----------|------|
| Card | Background `#0D1B35`, border `rgba(255,255,255,0.08)`, radius `12px`–`16px` |
| Primary button | BG `#FFDD0C`, text `#0A1428`, radius `8px`, font Montserrat SemiBold |
| Secondary button | Border `rgba(255,255,255,0.3)`, text `#FAFAFA`, radius `8px` |
| Input field | BG `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.15)`, text `#FAFAFA` |
| Chart line (UA) | `#54F0A3` |
| Chart line (Organic) | `#926FDE` |
| Chart line (Creative) | `#F88673` |
| Chart total/highlight | `#FFDD0C` |
| Nav active state | Yellow `#FFDD0C` left border or text |
| Badge / tag | Team color at 20% opacity BG, team color text |
| Divider | `rgba(255,255,255,0.08)` |

---

## What yellowHEAD Is NOT

Avoid these patterns — they conflict with the brand:

- Heavy use of yellow everywhere (dilutes impact)
- Decorative elements that don't serve information
- Cold blue or green color palettes (not yellowHEAD)
- Sans-serif fonts other than Montserrat/Bricolage Grotesque
- Flat, icon-only icon sets (should be glass-3D style)
- Busy, cluttered layouts with no breathing room
- Corporate stock-photo imagery

---

## Reference Files

For the full token list, CSS variables, and spacing scale, read `references/design-tokens.md`.
