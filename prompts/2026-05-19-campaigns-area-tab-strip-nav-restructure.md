# Nest Creatives + Geo under Campaigns as sub-tabs (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `campaigns-area-tabs`. Two workstreams. IA restructure with no new data work.

## Why this exists

Today the Sidebar lists `Campaigns` and `Creatives` as separate top-level nav items, even though the URL is hierarchical (`/campaigns` and `/campaigns/creatives`). A queued Geo PR would add a third sibling entry (`Geo` at `/campaigns/geo`), bringing the top-level nav to 8 items, of which three are drill-down lists that share the same underlying data shape.

This PR groups the three drill-down lists under one top-level nav slot (`Campaigns`) and surfaces them as a tab strip inside the Campaigns area, mirroring how the dashboard already groups Performance / Lifecycle / Attribution as tabs.

Conceptual frame: Lumen's surfaces split into two mental modes. The Dashboard is "overview mode" (aggregate lenses, narrative). The Campaigns area is "drilldown mode" (sortable filterable lists, hunt for rows). Each mode has its own tab grammar. Top-level nav is a flat list of modes, not a flat list of every page.

## What changes

After this PR:

- Sidebar `Creatives` entry is removed. (No `Geo` entry is added — that's a separate PR.)
- A new `CampaignsAreaTabs` component renders below the page header on each of the three list pages (`/campaigns`, `/campaigns/creatives`, `/campaigns/geo` once it exists).
- The tab strip uses URL routing, not query params. Clicking "Creatives" navigates to `/campaigns/creatives`; clicking "Campaigns" navigates to `/campaigns`. Mirrors how the dashboard's URL works today (the dashboard uses `?tab=` for tabs INSIDE one route, but the Campaigns area uses actual route segments since the three views are already separate pages).
- The campaign profile route (`/campaigns/[id]`) does NOT show the tab strip. The profile is a fundamentally different surface (drill into one campaign) and the cross-area tabs would be confusing there.
- Longest-prefix nav highlighting in the Sidebar continues to work as today: any URL starting with `/campaigns` lights up the single `Campaigns` entry.

Visual structure:

```
Top-level Sidebar (6 items):
  Dashboard
  Campaigns       ← single nav slot for all drill-downs
  Ask
  Reports
  Feed
  Knowledge

Inside /campaigns/* (excluding the profile route):
  ┌─────────────────────────────────────────────────────┐
  │ TopBar (Date + OS + Channels + Client)              │
  ├─────────────────────────────────────────────────────┤
  │ [ Campaigns ] [ Creatives ] [ Geo ]   ← tab strip   │
  ├─────────────────────────────────────────────────────┤
  │ <list content for active tab>                       │
  └─────────────────────────────────────────────────────┘
```

## Out of scope

- Do NOT touch the dashboard's own tab strip (`DashboardTabs.tsx`). That's a separate component for a different purpose.
- Do NOT touch the campaign profile route `/campaigns/[id]`. It stays as-is, without any tab strip.
- Do NOT change any data fetching, query, or filter wiring on the three list pages. The TopBar + global filter behavior carries across tabs unchanged.
- Do NOT add the Geo page itself (that's the separate Geo prompt). This PR only prepares the structural shell.
- Do NOT add a Sidebar `Geo` entry. (Important — this is the IA decision.)
- Do NOT rename `Campaigns` to `Explore` or `Breakdowns` or anything else. The default tab is still the campaigns list; the label reinforces yellowHEAD analysts' existing vocabulary.

## TL;DR

Two workstreams, single PR.

1. **WS1 — Build the `CampaignsAreaTabs` component.** Mirror `DashboardTabs.tsx` in structure (keyboard nav, active styling, focus ring) but emit `<Link href="..." />` to route segments instead of updating a query param. Render it at the top of each list view.
2. **WS2 — Remove the Sidebar `Creatives` entry.** Single-line removal from `src/components/shell/Sidebar.tsx`.

Estimated PR size: 4 to 6 files touched. ~200 lines added, ~30 lines removed. Test budget: +10 to +15 unit, +1 E2E.

---

## WS1 — `CampaignsAreaTabs` component

### File touchpoints

```
src/components/campaigns/CampaignsAreaTabs.tsx          // new
src/components/campaigns/CampaignsView.tsx              // render <CampaignsAreaTabs activeTab="campaigns" />
src/components/campaigns/CreativeBreakdownView.tsx     // render <CampaignsAreaTabs activeTab="creatives" />
src/components/campaigns/geo/GeoBreakdownView.tsx       // (exists or will exist via Geo PR — same render call with activeTab="geo")
```

### Component shape

`CampaignsAreaTabs` accepts an explicit `activeTab` prop rather than reading from `usePathname()`. Reasons: it's easier to test, the call site already knows which view it is, and it avoids a runtime regex on every render.

```tsx
type CampaignsAreaTab = "campaigns" | "creatives" | "geo";

type CampaignsAreaTabsProps = {
  activeTab: CampaignsAreaTab;
};

export function CampaignsAreaTabs({ activeTab }: CampaignsAreaTabsProps) {
  // Render a horizontal strip of three links. Active tab gets the mint
  // underline + cloud-white text; inactive tabs get muted text + hover
  // brightening. Keyboard: ArrowLeft / ArrowRight cycles focus across
  // tabs, Enter / Space activates focused tab.
  ...
}
```

Visual rules (read `.claude/skills/yellowhead-brand/SKILL.md` first):
- Underline color on active tab: `var(--color-ua)` mint.
- Active text: `var(--text-primary)` (cloud-white).
- Inactive text: `var(--text-muted)`.
- Hover on inactive: `var(--text-secondary)`.
- Section spacing above the strip matches `DashboardTabs` rhythm.
- The strip respects URL state — landing directly on `/campaigns/creatives` shows "Creatives" as active without any client-side logic.

The strip uses Next.js `<Link>` for navigation, NOT `router.push` in an onClick handler. Reasons: SSR-friendly, no client-side JS dependency for the navigation itself, prefetching for free on hover.

### Pattern reference

`src/components/dashboard/DashboardTabs.tsx` is the visual reference for the tab strip styling. The query-param logic inside it is NOT copied — Campaigns tabs use real route segments. But the underline treatment, active state, keyboard handling, and accessibility attributes (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`) all mirror what's there.

### A11y

- Outer container has `role="tablist"` and `aria-label="Campaigns drill-down lens"`.
- Each tab link has `role="tab"`, `aria-selected={activeTab === thisTab}`.
- Each list view below the strip wraps its content in an element with `role="tabpanel"` and `aria-labelledby` pointing back at the active tab id.

### List view integration

In `CampaignsView.tsx`, render the tabs immediately below the existing header (the "UA · {client} · last {N} days" badge + h2 + paragraph block). Same insertion point in `CreativeBreakdownView.tsx` and `GeoBreakdownView.tsx`.

The three list views share a near-identical page structure: header, tab strip, content. Optional small cleanup: extract a `CampaignsAreaHeader` component if the header repetition feels heavy. NOT required for this PR.

### What about `app/(app)/campaigns/layout.tsx`

A Next.js shared layout would be a slightly cleaner home for the tab strip, but it would apply to the profile route `/campaigns/[id]` too — and we explicitly don't want that. There are two ways to handle this:

- (a) Use a route group: `app/(app)/campaigns/(list)/layout.tsx` wraps the three list routes, the profile route lives outside. Cleaner but introduces a new route group folder.
- (b) Render the tab strip explicitly inside each list view's component.

Pick (b) for this PR. The duplication is three lines per file (one import, one component render), and avoiding the route-group refactor means lower risk and less file churn. If a future PR finds the duplication painful, the route-group move is easy.

---

## WS2 — Remove `Creatives` from Sidebar

### File touchpoints

```
src/components/shell/Sidebar.tsx
```

### Change

In the `NAV` array (around line 28-33), delete this line:

```tsx
{ href: "/campaigns/creatives", label: "Creatives", icon: Film },
```

The longest-prefix matching logic that's already documented in the file continues to highlight `Campaigns` correctly when the user is on `/campaigns/creatives` or `/campaigns/geo`. No code change required there.

If `Film` is no longer imported from `lucide-react` after this deletion, remove it from the imports too. (Verify with a grep before deleting.)

That's the entire WS2 change. Done.

---

## Tests

- Unit test for `CampaignsAreaTabs`: render with each of the three `activeTab` values, assert the right tab has `aria-selected="true"` and the right `var(--color-ua)` styling.
- Unit test for keyboard nav: ArrowRight on a focused tab moves focus to the next tab.
- Unit test for the Sidebar: after deletion, `getByText("Creatives")` returns nothing. The existing Sidebar tests probably already assert the NAV array contents; update those.
- E2E in `tests/e2e/`: navigate to `/campaigns`, assert tab strip renders with "Campaigns" active. Click "Creatives" tab, assert URL becomes `/campaigns/creatives` and "Creatives" is active. Navigate to `/campaigns/123` (profile route, any valid campaign id from mock data), assert the tab strip does NOT render.

## Acceptance

Manual:

1. Open the Sidebar. There are 6 top-level items, no `Creatives`.
2. Navigate to `/campaigns`. The Campaigns tab strip renders below the header with "Campaigns" active. Below it, the same table that renders today.
3. Click "Creatives" in the tab strip. URL becomes `/campaigns/creatives`. Tab strip stays visible with "Creatives" now active. Content swaps to the Creative Breakdown view.
4. (Once Geo ships) Click "Geo" tab. URL becomes `/campaigns/geo`. Tab strip stays visible with "Geo" active. Content swaps to the Geo Breakdown view.
5. Click any campaign row to land on `/campaigns/[id]`. The tab strip is NOT visible. Profile renders as today.
6. Use the browser back button. Returns to `/campaigns/creatives` with the tab strip intact and "Creatives" active.
7. Keyboard tab through the tab strip. Focus indicators visible. Arrow keys cycle.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes. Test count delta reported.
3. `npm run build` is clean.
4. E2E specs run green.

## Commit shape

Suggested commits in order:

1. `WS1: CampaignsAreaTabs component (tab strip for /campaigns/* list routes)`
2. `WS1: render CampaignsAreaTabs from CampaignsView and CreativeBreakdownView`
3. `WS2: remove Creatives entry from Sidebar (Campaigns is the umbrella now)`

PR title: `Nest drill-down lenses under Campaigns as a tab strip`

PR description should include:
- Before / after Sidebar screenshot.
- Before / after Campaigns area screenshot showing the tab strip.
- Note that the Geo PR ships separately and will use the same tab strip.

## Coordination with the Geo PR

The Geo prompt at `prompts/2026-05-19-geo-breakdown-with-interactive-map.md` originally spec'd a Sidebar `Geo` entry. After this nav-restructure PR ships, the Geo PR no longer adds anything to the Sidebar; instead it renders `<CampaignsAreaTabs activeTab="geo" />` from its top-level view. Omer will update the Geo prompt to reflect this. Claude Code does NOT need to update the Geo prompt as part of THIS PR.

## Follow-up not part of this PR

- If a future drill-down (Adsets, Audiences, Keywords) is added, it slots in as a fourth tab in the same strip. The route shape is already `/campaigns/<lens>`, so adding `/campaigns/adsets` is structurally the same change.
- If the campaigns-area header content (the "UA · {client} · last {N} days" badge + h2 + paragraph) starts to drift across the three list views, extract a `CampaignsAreaHeader` component. Not required now.
- The dashboard's existing `?tab=` query param pattern and the Campaigns area's route-segment pattern are both valid choices for tab state. They coexist deliberately — dashboard tabs share most of their data (it's the same dashboard, three lenses), while campaigns tabs are fully separate pages with different queries. If the team ever wants to unify them onto one pattern, that's a bigger refactor.
