# Geo breakdown with interactive choropleth at /campaigns/geo (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `campaigns-geo-route`. Five workstreams. New client-wide route mirroring the pattern of `/campaigns/creatives`.

## Why

Looker Studio's GlobalComix UA dashboard has a dedicated GEO page per network section (TikTok / AppLovin / etc.) with the same structural elements: top-5-countries donut, world choropleth, country detail table. Lumen's existing `GeoBreakdown` component lives only inside the per-campaign profile and renders the table without a map; the queued campaigns prompt explicitly deferred the choropleth as "future polish."

This PR brings the polish forward and changes the IA in the same step. Instead of replicating Looker's per-section GEO pages, Lumen exposes a single client-wide `/campaigns/geo` route. The TopBar filter spine (Date + OS + Channels + Client) means "TikTok Android + iOS GEO" is the same page with TikTok selected in the Channels chip. One page covers every combination Looker needs five separate pages for.

The user is the UA analyst. The question this page answers in one sentence: "Where is my spend going, and where are subscribers coming from?"

## Spec sources

- Looker reference: the GlobalComix UA Dashboard GEO page screenshot dated 2026-05-19 (top-5 donut, choropleth, scale bar, country table with 12 metrics).
- yellowhead-brand skill at `.claude/skills/yellowhead-brand/SKILL.md`. **Read this first.** All colors and typography come from here. Color scale uses mint (`var(--color-ua)`) as the high-intensity end and a neutral muted gray as the low end. No raw hex values.
- Sibling route as pattern reference: `src/components/campaigns/CreativeBreakdownView.tsx`, `src/components/campaigns/creatives/CreativeTable.tsx`, `src/components/campaigns/creatives/CreativeFilterChips.tsx`, `src/components/campaigns/creatives/TopAdTrend.tsx`. Mirror their file organization, hook patterns, GlassCard composition, and table treatment.
- Existing data: `queryGlobalComixGeo` in `src/lib/globalcomix-queries.ts`. Already aggregates per-country across the active window. Verify it returns the column set the table needs (Country, Spend, Impressions, Clicks, Installs, CPI, SubStart, CP SubStart, Sub D0, CPA D0, Sub D7, CPA D7). If it does not, extend it within this PR.
- BQ investigation report at `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md` for column locations on the cohort table's `_Country` dimension.

## Out of scope

- Do NOT touch `src/components/campaigns/profile/GeoBreakdown.tsx`. The per-campaign Geo section stays as-is in this PR; if the per-campaign profile eventually wants a mini-map, that is a separate follow-up.
- No click-to-filter on the map. Hover tooltip only. Country chip filter is NOT in this PR.
- No zoom / pan controls. Static choropleth.
- No new BQ queries unless `queryGlobalComixGeo` truly lacks columns the table needs. Extending an existing query is fine; building a new one from scratch is out of scope.
- No mobile-specific layout beyond the existing `md:` / `lg:` breakpoints. Desktop responsive.
- No `/campaigns/[id]/geo` per-campaign route. The path is `/campaigns/geo`, client-wide, period.

## TL;DR

Five workstreams, single PR.

1. **WS1 — Route + data hook.** New `src/app/(app)/campaigns/geo/page.tsx` plus `src/lib/campaigns/use-geo-data.ts`. Reuse or extend `queryGlobalComixGeo`. Wire to TopBar global filter.
2. **WS2 — Map library + TopoJSON.** Add `react-simple-maps` and `world-atlas` to package.json. Build `ChoroplethMap.tsx` rendering a hover-tooltip world map colored by spend intensity.
3. **WS3 — Top-5 donut.** `TopCountriesDonut.tsx` mirroring `ChannelMix.tsx` visual treatment. Top 5 countries by spend plus an "Others" segment.
4. **WS4 — Country detail table.** `GeoCountryTable.tsx` with 12 columns. Mirror `CreativeTable.tsx` treatment (sortable, cell tinting on rate columns, thousands-comma formatting). Inline-flag iOS attribution gap on Google rows (existing data quality issue per Status.md).
5. **WS5 — Layout, color scale, sidebar nav.** `GeoBreakdownView.tsx` orchestrator with the 1/3-plus-2/3 split row at the top and the full-width table below. `GeoColorScale.tsx` legend bar. Add a `Geo` entry to `src/components/shell/Sidebar.tsx`.

Estimated PR size: 10 to 14 files added, 1 to 2 modified. ~700 to 1,000 lines added. Two new npm dependencies. Test budget: +30 to +50 unit tests, +1 E2E.

---

## WS1 — Route + data hook

### File touchpoints

```
src/app/(app)/campaigns/geo/page.tsx           // new
src/lib/campaigns/use-geo-data.ts              // new
src/app/api/bq/campaigns/geo/route.ts          // new OR confirm existing endpoint shape
src/lib/globalcomix-queries.ts                 // verify queryGlobalComixGeo; extend columns only if needed
```

### Page

`src/app/(app)/campaigns/geo/page.tsx` is a thin server component that renders `<GeoBreakdownView />` inside the standard app layout. No data fetching at the page level (the client orchestrator owns fetch state).

### Hook

`src/lib/campaigns/use-geo-data.ts` follows the `use-campaigns-data.ts` / `use-creatives-data.ts` pattern: takes the global-filter primitives (`from`, `to`, `client`, `os`, `platforms`), calls the BQ endpoint, returns `{ rows, loading, error, refetch }`. Rows match the wire shape `GeoCountryRow` (defined in `src/types/dashboard.ts` if missing — add it there, do not invent a new type file).

### API route

If `/api/bq/campaigns/geo` already exists serving `queryGlobalComixGeo`, reuse it. If not, create it following the exact pattern of `/api/bq/campaigns/route.ts`: BQ query call, multi-source spend UNION handling already inside the query helper, JSON response shaped as `GeoCountryRow[]`. Wrap with `withRedisCache`. Standard 12-hour TTL.

### Wire shape

`GeoCountryRow` columns the table consumes:

```ts
type GeoCountryRow = {
  country_code: string;     // ISO-3166-1 alpha-2 (e.g. "US", "GB")
  country_name: string;     // "United States", "United Kingdom"
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  cpi: number;              // spend / installs, null when installs == 0 (use 0 then guard at render)
  sub_start: number;        // SubStart count
  cp_sub_start: number;     // spend / sub_start
  sub_d0: number;
  cpa_d0: number;           // spend / sub_d0
  sub_d7: number;
  cpa_d7: number;           // spend / sub_d7, maturity-gated when window tail < 7 days
};
```

If `queryGlobalComixGeo` does not currently return `country_code`, add it to the query. The choropleth needs ISO-2 codes to match countries against the TopoJSON. Country name is for display only and can be derived from a small static map if BQ does not return it, but if BQ already returns a country_name use that as the source of truth.

If `queryGlobalComixGeo` returns ISO-3 codes today (some Looker pipelines do), convert to ISO-2 at the query layer or via a small `iso3to2` helper in `src/lib/geo/iso-codes.ts`. Do not push the conversion into the React component.

---

## WS2 — Choropleth map

### File touchpoints

```
src/components/campaigns/geo/ChoroplethMap.tsx     // new
src/lib/geo/topology.ts                            // new — TopoJSON loader + memoization
public/world-110m.json                             // new — bundled TopoJSON OR via world-atlas package
package.json                                       // add react-simple-maps + world-atlas
```

### Dependencies

Add `react-simple-maps` and `world-atlas` to dependencies. Verify the current latest stable versions against the npm registry before pinning — do not pick a version from memory. Both packages are MIT-licensed, lightweight (combined ~20kb gzipped excluding the TopoJSON itself), and React-native.

`react-simple-maps` is a D3-based choropleth wrapper. `world-atlas` ships TopoJSON files at multiple resolutions; use `countries-110m.json` (the 1:110-million resolution) for a desktop dashboard — higher resolutions are oversized for this use.

If the team prefers vendoring the TopoJSON instead of adding `world-atlas`, drop `countries-110m.json` into `public/` and load via fetch on the client. Either path works; pick `world-atlas` for ergonomics unless there's a bundle-size reason to avoid it.

### Map component

`ChoroplethMap.tsx` is a client component (`"use client"` directive) that:

1. Loads the TopoJSON once via `useEffect` and caches it in module-level state (or a small `useTopology()` hook in `src/lib/geo/topology.ts`). Subsequent mounts read from the cache.
2. Accepts `rows: GeoCountryRow[]` and `metric: "spend" | "sub_d7" | "cpa_d7"` props (default `"spend"` to match Looker).
3. Builds a `Map<countryCode, value>` keyed on the active metric. Computes quantile thresholds (4 buckets + zero bucket) over the non-zero values.
4. Renders `<ComposableMap>` with a `Mercator` projection (Looker uses something close to it) and `<Geographies>` iterating the TopoJSON countries. Each `<Geography>` is filled per its quantile bucket.
5. On hover (`onMouseEnter` / `onMouseLeave`), surfaces a tooltip with: country name, spend (formatted as `$X,XXX`), installs, sub_d7, cpa_d7. Tooltip is a small `GlassCard`-styled element positioned via `onMouseMove` coordinates. Use the same tooltip primitive `TrendChart` uses; if there isn't one, build a minimal `MapTooltip.tsx` in the same geo folder.
6. Countries not in the data render as the lowest bucket color (a near-neutral muted gray) with no tooltip on hover. Do NOT render them invisible — the user needs to see the country outline to know the country has zero spend.

### Color scale

5 buckets, sequential ramp from near-neutral to mint:

```
bucket 0 (zero/no data):  var(--surface-hover)
bucket 1 (lowest 25%):    color-mix(in oklab, var(--color-ua) 18%, var(--surface-base))
bucket 2:                 color-mix(in oklab, var(--color-ua) 38%, var(--surface-base))
bucket 3:                 color-mix(in oklab, var(--color-ua) 60%, var(--surface-base))
bucket 4 (highest 25%):   var(--color-ua)
```

These are illustrative tokens — match what yellowhead-brand exposes. If a sequential 5-step UA ramp is already defined in the brand skill, use those tokens directly.

Bucket thresholds: quantile-based on the non-zero rows in the current dataset. Quantile is the right choice (not linear) because spend is heavily skewed (US dwarfs every other country in the screenshot — 38.7% of spend) and a linear scale would put 95% of countries in the lowest bucket.

### Performance

Memoize the TopoJSON parse (`useMemo` on the loaded data, with no dependencies — load once). Memoize the country-to-value map keyed on `rows` reference. The full TopoJSON has ~250 country polygons; re-rendering all of them on every hover is wasteful. Use `React.memo` on the per-country `<Geography>` component if hover causes visible jank.

---

## WS3 — Top-5 countries donut

### File touchpoints

```
src/components/campaigns/geo/TopCountriesDonut.tsx     // new
```

### Component

Mirror `ChannelMix.tsx`'s visual treatment. Donut with center label showing the total spend and "Spend" caption underneath. Around the donut: a legend with the five highest-spend country names plus an "Others" rollup for the remainder.

Slice order: top 5 by spend descending, then Others. Color per slice from a small categorical palette (mint, mint-soft, organic, organic-soft, yellow, neutral for Others); match `ChannelMix` if it already has a palette helper.

Hover behavior: hover a slice to highlight it and emphasize the legend row. No tooltip with numbers — the legend row already shows the country name and percentage.

This component shares no logic with the choropleth; both consume the same `rows` array independently.

---

## WS4 — Country detail table

### File touchpoints

```
src/components/campaigns/geo/GeoCountryTable.tsx       // new
```

### Component

Mirror `CreativeTable.tsx`. Sortable columns, default sort: Spend descending. Columns in order:

1. Country (left-aligned, country flag emoji optional but nice — derive from country code if implemented)
2. Spend (right-aligned, money formatting, blue intensity bar background per cell same as `CreativeTable`'s Spend column)
3. Impressions (right, count with thousands separator, optional shorthand `1.2m`)
4. Clicks (right, count)
5. Installs (right, count)
6. CPI (right, money, two-decimal, cell tone vs grand-total average via the existing `cellTone` helper)
7. SubStart (right, count)
8. CP SubStart (right, money, cell tone vs average)
9. Sub D0 (right, count)
10. CPA D0 (right, money, cell tone vs average)
11. Sub D7 (right, count, maturity-gated cells render `—` when the window tail is < 7 days)
12. CPA D7 (right, money, cell tone vs average)

`cellTone` is a load-bearing helper for this PR. If it does not exist in a shared place (`src/lib/utils/cell-tone.ts` or similar), it does for `NetworkBreakdown` per the queued dashboard rework. Reuse that. Do not invent a new tinting helper.

No virtualization needed — even the longest realistic country list is ~200 rows and `CreativeTable` doesn't virtualize. If render perf is an issue, defer optimization to a follow-up.

Row count limit: render the top 100 by Spend descending. Append a single "Others" rollup row if more than 100 countries are present in the window (very unlikely; ~250 countries exist total and most won't have spend).

---

## WS5 — Orchestrator, color scale, sidebar nav

### File touchpoints

```
src/components/campaigns/geo/GeoBreakdownView.tsx      // new
src/components/campaigns/geo/GeoColorScale.tsx         // new
src/components/shell/Sidebar.tsx                       // add Geo nav entry
src/components/ui/Skeleton.tsx                         // add GeoBreakdownSkeleton if not factored
```

### Layout

```
GeoBreakdownView
├── Page header (matches CreativeBreakdownView's header pattern)
│
├── Row 1 (grid: 1/3 + 2/3 on lg, stacked on md)
│   [ TopCountriesDonut ]  [ ChoroplethMap                 ]
│                            ChoroplethMap is taller; align
│                            donut to vertical center
│
├── GeoColorScale (full width, ~480px max, centered)
│
└── GeoCountryTable (full width)
```

Section spacing: same `gap-6 md:gap-8` rhythm as Performance and the queued Lifecycle redesign.

### Color scale legend

`GeoColorScale.tsx` renders the 5 buckets as a horizontal gradient bar with thresholds labeled at the breakpoints. Match the screenshot's spend scale bar visual: a thin gradient strip with a small triangle marker on the left and the maximum value labeled on the right. Width capped at ~480px, centered.

Threshold labels: format the quantile cutoffs as money (`$X,XXX` truncated to ~4 chars wide). If the highest bucket maxes out at $32,798 (per the screenshot), the right-end label reads `$32.8k`.

### Sidebar nav

`src/components/shell/Sidebar.tsx` line 31 already has `{ href: "/campaigns/creatives", label: "Creatives", icon: Film }`. Add a sibling entry directly below:

```tsx
{ href: "/campaigns/geo", label: "Geo", icon: Globe },
```

Import `Globe` from `lucide-react`. The longest-prefix routing logic the file already documents handles the active-state highlight correctly.

### Loading / empty / error states

Each top-level component owns its own skeleton. Render skeletons in place rather than blanking the whole page on filter change. Empty state ("No geographic data for this window") on the table when `rows.length === 0`; the donut and map both render empty visuals (donut shows just the "Others" placeholder, map renders all countries at bucket 0).

### Inline coverage warning

Per the Status.md data quality note: Google iOS install attribution is broken (CPIs of $4k-$29k are artifacts). The Geo view doesn't break this down by network — it's already aggregated — but if the active TopBar selection has `os=ios` AND `platforms` includes `google`, surface a small `CoverageWarning`-style callout above the map: "Google iOS install attribution is unreliable in BQ; iOS CPI / CPA in this view exclude Google rows." Use the same callout primitive Coverage Warnings on Attribution use. If that primitive isn't built yet, build a minimal inline-warning callout here and accept the small duplication.

---

## Cross-cutting visual rules

Same rules as the Lifecycle + Attribution upgrade:

1. `GlassCard` rhythm across all top-level sections.
2. yellowhead-brand tokens only — no raw hex.
3. Section spacing `gap-6 md:gap-8`.
4. Per-section loading skeletons, not a full-tab blanking skeleton.
5. Mint accent (`var(--color-ua)`) is the primary accent (UA team) since the user is the UA analyst.

## Acceptance

Manual:

1. `/campaigns/geo` loads with the layout above: donut + map split row, color scale below, full table below.
2. Hover any country on the map. Tooltip surfaces with country name, spend, installs, sub_d7, cpa_d7.
3. Countries with zero data render at bucket 0 (neutral gray) and show no tooltip on hover.
4. Resize to md and sm breakpoints. Donut and map stack vertically. Table remains horizontally scrollable.
5. Change TopBar Channels chip from "All" to "TikTok" — the map, donut, and table all update to show TikTok-only geo distribution. Same for OS chip and Date range.
6. Sort any column in the table. Rows reorder.
7. The Sidebar shows a new "Geo" entry below "Creatives", active when on `/campaigns/geo`.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes. Test count delta reported in PR description.
3. `npm run build` is clean. Verify the bundle size delta is acceptable (TopoJSON adds ~100kb gzipped to the geo route; should code-split so it doesn't bloat the main bundle).
4. E2E in `tests/e2e/`: new `campaigns-geo.spec.ts` navigates to `/campaigns/geo`, asserts the three sections render with their data-testids (`geo-top-countries-donut`, `geo-choropleth-map`, `geo-country-table`), and that switching the TopBar Channels chip triggers re-fetches.

## Commit shape

Suggested commits in order:

1. `WS1: /campaigns/geo route + use-geo-data hook + API route`
2. `WS2: ChoroplethMap with react-simple-maps + TopoJSON`
3. `WS3: TopCountriesDonut`
4. `WS4: GeoCountryTable with 12-column shape + cell tinting`
5. `WS5: GeoBreakdownView orchestrator + GeoColorScale + Sidebar nav entry`

PR title: `Client-wide Geo breakdown at /campaigns/geo with interactive choropleth`

PR description should include:
- Two screenshots: full page + map tooltip on hover.
- Bundle size delta (note specifically the geo-route chunk size).
- Test count delta.
- Note that `react-simple-maps` and `world-atlas` are the new deps; both MIT, both lightweight.
- Note that the per-campaign `GeoBreakdown` is intentionally not touched.

## Follow-up not part of this PR

- **Click-to-filter the rest of the page by country.** Adds a `country` chip to the global filter spine. Has implications for what "active country" means on Dashboard, Campaigns index, Ask, Reports. Not blocking; defer until someone asks for it.
- **Per-campaign mini-map** at `/campaigns/[id]/geo` (or as a section inside the profile). Reuses the choropleth with `campaign_id`-scoped data. Defer until a real user asks.
- **Mercator vs equal-area projection.** Mercator distorts area badly at high latitudes (Greenland looks bigger than Africa). An equal-area projection like `geoEqualEarth` is more honest. Default to Mercator for familiarity in this PR; a follow-up can switch if anyone flags it.
- **Country code mapping coverage.** If the BQ data ever surfaces a country code the TopoJSON doesn't know (rare — most edge cases are disputed territories or microstates), log it once and fall through to "Others" in the donut. Don't crash the map.
