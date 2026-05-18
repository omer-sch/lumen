# Creative Breakdown view: per-ad drilldown at /campaigns/creatives + full per-ad spend join (2026-05-18)

Owner: Omer. Single PR on a new branch off `main` named `creative-breakdown-view`. Five workstreams. Builds Lumen's equivalent of the GlobalComix Looker dashboard's "Creative Breakdown" page (one of Limor's #1 asks per Status.md, 2026-05-17) at `/campaigns/creatives`.

This work is independent of the dashboard rework (`dashboard-full-rework`) and the campaigns profile work (`campaigns-page-real-data-and-profile`). If any combination of those PRs is in flight, this one has no merge conflict with them — they touch different files. The Creative Breakdown reuses `queryGlobalComixCreatives` (which exists from the prior PR's WS5) but extends its data shape; no other shared touchpoints.

## Why this is happening

Looker's GlobalComix dashboard has a "Creative Breakdown" page under each platform-specific section (TikTok Android + iOS, AppLovin Android + iOS). The team uses it to spot winning vs losing ads, rank creative archetypes (Romance / Manga / Comics fans / UGC), and decide which to scale / kill. It's one of two surfaces Limor explicitly named on 2026-05-17 ("end-to-end creative workflow agent" was the other).

The data layer is half-built. `queryGlobalComixCreatives` (shipped in WS5 of `globalcomix-full-implementation`, 2026-05-17) returns cohort-side metrics per ad (`sub_start_d7`, `sub_d7`, `rev_d7`, ad name, Meta thumbnails via LEFT JOIN) but **hardcodes `spend: 0`, `installs: 0`, `cpa_d7: 0`** because per-ad spend was deferred. The function's own inline comment names this: *"Phase 1: spend not joined yet — populate 0 so consumers can render the table; CPA / ROI surfaces as 0 until Phase 2 wires per-ad spend."*

Without per-ad spend, the team can see which ads produced the most subs but cannot see which ads are EFFICIENT — and efficiency is the question creative decisions hinge on. This PR closes the gap on the data side and ships the UI on top.

## Spec sources

- **Looker target screenshot** captured in chat conversation 2026-05-18. The exact columns, filter chips, trend chart, conditional cell coloring, and ordering all come from that view.
- **Prior art doc** — `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md` Frame 9 (Creative Drilldown).
- **BQ investigation report** — `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md` Bucket 2 ("per-ad spend lives on the `breakdown_type='Creatives'` slice of the spend tables").
- **yellowhead-brand skill** at `.claude/skills/yellowhead-brand/SKILL.md`.
- **Gold-standard components** — `NetworkBreakdown`, `KpiCard`, `TrendChart`, `ClientSelector` for visual grammar.
- **Existing query** — `queryGlobalComixCreatives` in `src/lib/globalcomix-queries.ts`. Extended in WS2 here.

## Target shape

### Route: `/campaigns/creatives`

Sibling to the per-campaign profile route (`/campaigns/[id]`) under the Campaigns top-level page. Reachable from the Campaigns index via a "Creatives" sub-link in the header, and from breadcrumbs.

### Layout, top to bottom

1. **Header** — Title "Creative Breakdown", a one-line subtitle ("Per-ad performance across the active window"), and a window context chip ("UA · GlobalComix · last 30 days") matching the index's pattern.

2. **Filter chip row** — Six chips, matching Looker's row:
   - Campaign (multi-select campaign_name)
   - Campaign Status (Running / Paused / All)
   - Adset (multi-select adset_name)
   - Ad Name (text search OR multi-select if list is short)
   - Ad Status (Active / Paused / All) — if column exists, see WS1
   - Country (multi-select country code)

   Filter state is local to this page (NOT URL state — these are scratch filters; deep-linking via URL would expand into a future workstream). The global TopBar filters (Date, OS, Platform, Client) DO apply and ARE URL-driven.

3. **Top Ad trend chart** — `Top Ad by spend (current period vs previous)`. Auto-picks the #1 creative by total spend in the active window. Two lines: current period (mint, solid) and equivalent prior 30 days (mint, dashed at lower opacity). X-axis: dates. Y-axis: spend. Reuses the dashboard's `TrendChart` shape or a thin variant.

4. **Per-ad table** — One row per ad, top 100 by spend. Columns in this exact order matching Looker:

   `ad_name | Spend | Impr | clicks | installs | CPI | SubStart | CP SubStart | Sub D0 | CPA D0 | Sub D7 | CPA D7`

   Visual treatments:
   - **Spend column**: blue intensity bar background (same as `NetworkBreakdown`'s spend column).
   - **Rate metrics** (CPI, CP SubStart, CPA D0, CPA D7): cell-tone coloring via the existing `src/lib/dashboard/cell-tone.ts` helper. Baseline is the table's grand-total average for each metric. Lower-is-better polarity.
   - **Row hover**: mint tint background, same pattern as `NetworkBreakdown`.
   - **Thumbnail preview**: small inline image for Meta ads where `thumbnail_url` is present from the `ods_fb2_creatives_globalcomix` join. Other networks show a placeholder.
   - **Ad name**: truncate long names with title-attribute tooltip showing the full name. The naming convention encodes archetype / format / version — preserve readability.
   - **Empty rate cells**: render `—` when CPA D7 / ROI D7 can't be computed (e.g., Google or Apple rows where per-ad spend is unavailable).

5. **Coverage warning panel** (inline, below the table) — When Google / Apple ads are in the table with `—` on efficiency metrics, surface a small `InfoCallout`: *"Google and Apple Search Ads don't expose per-ad spend in BigQuery. Their rows show subscriber counts only; CPA / ROI columns render as `—`."*

### Filter semantics

- **Date range (TopBar)**: cohort install window. Sub D7 cells maturity-gate the last 6 days.
- **OS (TopBar)**: narrows to ads serving that OS. AppLovin column-strategy means iOS / Android filters work cleanly. Meta + TikTok narrow via `campaign_name` token inference (per WS1.A of the prior PR). Google ads → `—` for OS narrowing. Apple = iOS only by definition.
- **Platform (TopBar)**: narrows to ads from that channel. Selecting `Platform=TikTok` shows TikTok-only creatives, matching Looker's per-platform Creative Breakdown page exactly.
- **Client (TopBar)**: GlobalComix only for now. Other clients show the empty state.

## TL;DR

Five workstreams, single PR. Strict commit order.

1. **WS1 — Adset dimension + ad_status verify.** Extend `buildCohortSubquery` to support `groupBy: ["adset"]` projecting `_Adgroup_Attribution AS adset_name`. Verify whether `ad_status` column exists on the spend tables' `breakdown_type='Creatives'` slice via one BQ probe; if yes, project it.
2. **WS2 — Per-ad spend join.** The biggest data work. Extend `_queryGlobalComixCreatives` to JOIN per-ad spend / clicks / impressions from the `breakdown_type='Creatives'` slice on Meta + TikTok + AppLovin spend tables. Compute real CPI, CPA D7, ROI D7. Google + Apple rows render `null`. Handle the Creatives-slice fan-out math (different dedupe than `No Breakdown`).
3. **WS3 — Top Ad trend query.** New `queryGlobalComixTopAdTrend(client, from, to, filter)` returning per-day spend for the #1 creative by total spend in the active window, plus the equivalent prior 30-day series. Cached.
4. **WS4 — Route + page shell.** New route `/campaigns/creatives` with breadcrumb back to `/campaigns`. Reuses TopBar (all four global filters apply). Loading skeleton matching the final layout shape.
5. **WS5 — UI surface.** Filter chip row (6 chips, local state). Top Ad trend chart at top. Per-ad table with all 12 columns, cell tinting, spend intensity bar, row hover, Meta thumbnail. Empty state. Coverage warning. Mobile-responsive (table horizontal-scrolls below 1024px).

Estimated PR size: 10-15 files touched. ~700-1,000 lines added. Test budget: +30-45 unit, +2 E2E.

---

## WS1 — Adset dimension + ad_status verify

### Files

```
src/lib/globalcomix-queries.ts          // extend buildCohortSubquery
scripts/discover-ad-status-column.ts    // new — one-off BQ probe
```

### Change

**Extend `buildCohortSubquery` to support adset dimension.** The cohort subquery in `globalcomix-queries.ts` already accepts `groupBy` per WS3 of the prior PR (`"date" | "network" | "os" | "country" | "campaign_id" | "ad_id" | "creative"`). Add `"adset"`:

```ts
type CohortGroupBy = "date" | "network" | "os" | "country" | "campaign_id" | "ad_id" | "creative" | "adset"; // <- added

// Inside buildCohortSubquery, when "adset" is in groupBy:
//   Project `_Adgroup_Attribution AS adset_name` and add it to the GROUP BY.
```

The cohort table's `_Adgroup_Attribution` is the per-adset attribution string. Verify with a one-line BQ probe that it's populated for the active networks (Meta / TikTok / AppLovin); the prior investigation noted it exists but didn't confirm population rates.

**Verify ad_status column existence.** Add a one-off discovery script `scripts/discover-ad-status-column.ts`:

```ts
import { BigQuery } from "@google-cloud/bigquery";
// ... boilerplate matching the existing discover-bq-*.ts files

const bq = buildBq();
const probe = async (table: string) => {
  const [rows] = await bq.query({
    query: `
      SELECT column_name, data_type
      FROM \`yellowhead-visionbi-rivery.yellowhead_prod.INFORMATION_SCHEMA.COLUMNS\`
      WHERE LOWER(table_name) = LOWER(@table)
        AND LOWER(column_name) LIKE '%status%'
      ORDER BY ordinal_position
    `,
    params: { table },
    location: "US",
  });
  return rows;
};

const TABLES = [
  "dwh_fb2_globalcomix_adjust",
  "dwh_tik_tok_globalcomix_adjust",
  "dwh_apple_globalcomix_adjust",
  "dwh_google_ads_globalcomix_adjust",
  "dwh_applovin_globalcomix_adjust",
];

for (const t of TABLES) {
  console.log(t, await probe(t));
}
```

Run it once (`npx tsx scripts/discover-ad-status-column.ts`), save output to `tmp/bq-discovery/2026-05-18-ad-status-probe.json`, and based on results:
- If `ad_status` exists on the supporting networks → project it in WS2's spend join.
- If not → drop the `Ad Status` filter chip from WS5 and add a TODO comment.

### Acceptance

- `buildCohortSubquery({ groupBy: ["adset"] })` produces SQL that includes `_Adgroup_Attribution AS adset_name` in the SELECT and GROUP BY.
- Unit test against a fixture: a cohort row with `_Adgroup_Attribution = "Adset_Romance_v1"` produces an output row with `adset_name = "Adset_Romance_v1"`.
- `scripts/discover-ad-status-column.ts` runs cleanly and emits JSON to `tmp/bq-discovery/2026-05-18-ad-status-probe.json`.
- Based on the probe result, WS2's spend SQL either includes or omits `ad_status` projection.

---

## WS2 — Per-ad spend join

The data heart of this PR.

### Files

```
src/lib/globalcomix-queries.ts          // extend _queryGlobalComixCreatives
src/lib/bq-security.ts                  // add spend-Creatives-slice helpers
src/types/dashboard.ts                  // extend CreativeRow shape
```

### Today

`_queryGlobalComixCreatives` reads ad-level aggregates from the cohort table (`_Ad_ID`, `_Creative_Attribution`, sub events, revenue). It LEFT JOINs `ods_fb2_creatives_globalcomix` for Meta thumbnails. It does NOT read per-ad spend.

```ts
// Today's return shape (CreativeRow in src/types/dashboard.ts):
{
  ad_id, ad_name, creative_name, network, thumbnail_url,
  sub_start_d7, sub_d7,
  spend: 0,         // hardcoded
  installs: 0,      // hardcoded
  cpa_d7: 0,        // hardcoded
  roi_d7: rev_d7,   // returns revenue, not real ROI
}
```

### Change

**Build a Creatives-slice spend subquery.** Mirror `buildSpendSubquery` (the existing No-Breakdown one) but read from `breakdown_type='Creatives'`:

```ts
function buildSpendCreativesSubquery(client: string): string {
  const cfg = getMultiSourceConfig(client);

  // Only Meta + TikTok + AppLovin have per-ad spend.
  // Google + Apple ASA: omit from this UNION (their rows will fall out
  // of the LEFT JOIN with NULL spend / installs / clicks / impressions).
  const SUPPORTED_NETWORKS = ["Meta", "TikTok", "AppLovin"];

  const legs = cfg.spendSources
    .filter((src) => SUPPORTED_NETWORKS.includes(src.network))
    .map((src) => {
      const fq = qualifyTable(src.table);
      // Each per-network Creatives slice carries (date, ad_id, cost_usd,
      // installs, clicks, impressions). The Creatives slice's own dedupe
      // predicate is the row-uniqueness key — VERIFY with a quick probe:
      // `SELECT date, ad_id, COUNT(*) FROM <table> WHERE breakdown_type
      // = 'Creatives' GROUP BY date, ad_id HAVING COUNT(*) > 1 LIMIT 5`.
      // If duplicate rows exist, identify the fan-out dimension and
      // restrict the WHERE further.
      return `SELECT
        date,
        '${src.network}' AS network,
        ad_id,
        cost_usd,
        installs,
        clicks,
        impressions
        ${/* ad_status only if WS1 probe confirmed it */ ""}
      FROM ${fq}
      WHERE breakdown_type = 'Creatives'`;
    })
    .join("\n      UNION ALL\n      ");

  return `(${legs})`;
}
```

**Extend `_queryGlobalComixCreatives` to JOIN the spend subquery.** The new shape:

```sql
SELECT
  c.ad_id                                                AS ad_id,
  COALESCE(c.creative_name, c.ad_id)                     AS ad_name,
  c.creative_name                                        AS creative_name,
  c.network                                              AS network,
  f.thumbnail_url                                        AS thumbnail_url,
  -- Aggregate spend side (NULL for Google / Apple rows that don't UNION in):
  SUM(s.cost_usd)                                        AS spend,
  SUM(s.installs)                                        AS installs,
  SUM(s.clicks)                                          AS clicks,
  SUM(s.impressions)                                     AS impressions,
  -- Aggregate cohort side:
  SUM(c.sub_start_d7)                                    AS sub_start_d7,
  SUM(c.sub_d7)                                          AS sub_d7,
  SUM(c.rev_d7)                                          AS rev_d7,
  -- Derived rate metrics (NULL when denominator is zero):
  SAFE_DIVIDE(SUM(s.cost_usd), NULLIF(SUM(s.installs), 0))  AS cpi,
  SAFE_DIVIDE(SUM(s.cost_usd), NULLIF(SUM(c.sub_d7), 0))    AS cpa_d7,
  SAFE_DIVIDE(SUM(c.rev_d7),    NULLIF(SUM(s.cost_usd), 0)) AS roi_d7
FROM ${cohortSub} c
LEFT JOIN ${spendCreativesSub} s
  ON s.network = c.network
  AND s.ad_id  = c.ad_id
  AND s.date   = c.date
LEFT JOIN ${qualifyTable("ods_fb2_creatives_globalcomix")} f
  ON c.ad_id = CAST(f._creative_id AS STRING)
WHERE c.date BETWEEN ${FROM} AND ${TO}
  AND c.ad_id IS NOT NULL
  AND c.network IS NOT NULL
GROUP BY c.ad_id, c.creative_name, c.network, f.thumbnail_url
ORDER BY SUM(s.cost_usd) DESC NULLS LAST
LIMIT 100
```

**Critical: ORDER BY changes from `sub_d7 DESC` to `cost_usd DESC NULLS LAST`** to match Looker's "top by spend" ordering. Rows without spend (Google / Apple) sort to the bottom.

**Update `CreativeRow` type** in `src/types/dashboard.ts`:

```ts
export type CreativeRow = {
  ad_id: string;
  ad_name: string;
  creative_name: string;
  network: string;
  thumbnail_url: string | null;
  // Spend side (NULL for Google / Apple — no per-ad spend in BQ):
  spend: number | null;
  installs: number | null;
  clicks: number | null;
  impressions: number | null;
  // Cohort side (always available):
  sub_start_d7: number;
  sub_d7: number;
  rev_d7: number;
  // Derived rate metrics (NULL when spend or denominator is zero):
  cpi: number | null;
  cpa_d7: number | null;
  roi_d7: number | null;
};
```

**Maturity gate on Sub D7 / CPA D7.** Reuse `COHORT_D7_MATURITY_THRESHOLD` from `src/lib/analyst/maturity-gates.ts`. When `sub_d7` is below threshold for an ad, return `sub_d7: null` and `cpa_d7: null` so the UI renders `—`. Don't fabricate a number when the cohort isn't mature.

**Filter threading.** The function already accepts `filter: GlobalComixFilter`. The `os`, `platforms`, `campaignId` filters propagate via `buildCohortSubquery`. Verify the same filters propagate to `buildSpendCreativesSubquery` — if not, add the same predicate-emission logic.

### Acceptance

- Per-ad rows for Meta / TikTok / AppLovin show real spend, installs, clicks, impressions, CPI, CPA D7, ROI D7.
- Google + Apple rows render with `spend: null`, `installs: null`, etc. The UI surfaces `—` for those cells.
- ORDER BY produces a list ranked by spend DESC, NULLS at the bottom.
- Maturity gate applies: ads with `sub_d7` below threshold show `cpa_d7: null`.
- Unit test against a fixture: Meta ad with `cost_usd=1000`, `installs=100`, `sub_d7=20` produces `cpi=10`, `cpa_d7=50`, `roi_d7` computed from `rev_d7 / spend`.
- Unit test: Google ad with no spend rows produces `spend: null`, `cpi: null`, `cpa_d7: null`.
- Cache key unchanged (the query string changed but the (client, from, to, filter) tuple is the same).

---

## WS3 — Top Ad trend query

### Files

```
src/lib/globalcomix-queries.ts          // new query function
src/lib/analyst/types.ts                // new ANALYST_QUERY_IDS entry
src/app/api/bq/creatives/top-ad-trend/route.ts   // new API route
```

### Change

**New query `_queryGlobalComixTopAdTrend(client, from, to, filter)`** returning the per-day spend series for the #1 creative + the equivalent prior-30-day series:

```ts
type TopAdTrendPoint = {
  date: string;        // ISO YYYY-MM-DD
  spend: number;
  is_current: boolean; // true for current period rows, false for prior
};

type TopAdTrendResponse = {
  top_ad: {
    ad_id: string;
    ad_name: string;
    network: string;
  };
  points: TopAdTrendPoint[];
};

async function _queryGlobalComixTopAdTrend(
  client: string,
  from: string,
  to: string,
  filter: GlobalComixFilter = {},
): Promise<TopAdTrendResponse>;
```

Implementation:

1. Find the #1 ad by spend in the current period. Reuse the spend Creatives subquery, aggregate by ad_id, ORDER BY spend DESC LIMIT 1.
2. Pull daily spend for that one ad_id in the current period.
3. Pull daily spend for the same ad_id in the equivalent prior 30-day window.
4. Return both series with `is_current` flag.

If no ad meets a minimum-spend threshold (say, $100 total in the period — guard against showing a noise trend), return `{ top_ad: null, points: [] }` and let the UI render an empty state.

**Register `TOP_AD_TREND: "top-ad-trend"`** in `ANALYST_QUERY_IDS` in `src/lib/analyst/types.ts`.

**API route** at `src/app/api/bq/creatives/top-ad-trend/route.ts`:

```ts
export async function GET(req: NextRequest) {
  const params = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (params instanceof NextResponse) return params;
  try {
    const filter = parseGlobalComixFilter(req.nextUrl.searchParams);
    const data = await queryGlobalComixTopAdTrend(
      params.client, params.from, params.to, filter,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "top-ad-trend");
  }
}
```

### Acceptance

- `/api/bq/creatives/top-ad-trend?client=globalcomix&from=...&to=...` returns the top ad's name + per-day spend for current period + prior period.
- Filter (os, platforms, campaignId) narrows which ad qualifies as #1.
- When no ad meets the spend threshold, returns `{ top_ad: null, points: [] }`.
- Cached with 12h TTL.
- Unit tests for: top-ad selection, prior-period date math, threshold guard.

---

## WS4 — Route + page shell

### Files

```
src/app/(app)/campaigns/creatives/page.tsx              // new route
src/components/campaigns/CreativeBreakdownView.tsx     // new top-level component
src/components/campaigns/CampaignsView.tsx              // add sub-link to /campaigns/creatives
src/components/ui/Skeleton.tsx                          // add CreativeBreakdownSkeleton
```

### Change

**New route** `src/app/(app)/campaigns/creatives/page.tsx`:

```tsx
import { CreativeBreakdownView } from "@/components/campaigns/CreativeBreakdownView";

export const metadata = { title: "Creative Breakdown — Lumen" };

export default function CreativeBreakdownPage() {
  return <CreativeBreakdownView />;
}
```

**Sub-link from `/campaigns`.** In `CampaignsView.tsx`, add a small "Creative Breakdown" link in the header area next to the title, styled as a secondary action (matches the "Reports" page's link pattern if there is one — otherwise a simple `<Link>` with text-muted styling).

**`CreativeBreakdownView` shell** at `src/components/campaigns/CreativeBreakdownView.tsx`:

- Wraps in `<Suspense>` (the existing pattern in this codebase for client components reading URL state).
- Reads global filters via `useGlobalFilters()`.
- Calls two hooks (defined in WS5): `useCreativeBreakdown(filter)` for the table and `useTopAdTrend(filter)` for the chart.
- Renders: header + filter chip row + top-ad trend chart + table + coverage warning.
- Loading state: render `<CreativeBreakdownSkeleton />`.

**Skeleton** added to `src/components/ui/Skeleton.tsx`:

```tsx
export function CreativeBreakdownSkeleton() {
  // Header placeholder, 6 chip-shaped placeholders, line chart placeholder,
  // 10 table-row placeholders. Matches the eventual content layout.
}
```

**Breadcrumb back to `/campaigns`.** Same shape as the breadcrumb on the per-campaign profile page (`ArrowLeft + "Back to campaigns"` link, preserves URL filters).

### Acceptance

- `/campaigns/creatives` loads without errors.
- Header renders with "Creative Breakdown" title and the client / window context chip.
- Loading state shows a skeleton matching the final layout.
- Breadcrumb navigates back to `/campaigns` preserving the active TopBar filters.

---

## WS5 — UI surface

### Files

```
src/components/campaigns/CreativeBreakdownView.tsx           // section orchestration
src/components/campaigns/creatives/CreativeFilterChips.tsx   // 6-chip row
src/components/campaigns/creatives/TopAdTrend.tsx            // line chart at top
src/components/campaigns/creatives/CreativeTable.tsx         // the main 12-column table
src/lib/campaigns/use-creative-breakdown.ts                  // data hook
src/lib/campaigns/use-top-ad-trend.ts                        // trend chart hook
```

### Change

**`useCreativeBreakdown` hook** at `src/lib/campaigns/use-creative-breakdown.ts`:

```ts
export function useCreativeBreakdown(args: {
  from: Date; to: Date; client: string;
  os: OsFilter; platforms: PlatformFilter[];
}): {
  rows: CreativeRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

Mirrors `useCampaignsData` and `useDashboardData` shape: AbortController, URLSearchParams that omit default os/platforms, effect deps include `platforms.join(",")` for stable identity. Fetches `/api/bq/creatives?client=...&from=...&to=...&os=...&platforms=...`.

**`useTopAdTrend` hook** at `src/lib/campaigns/use-top-ad-trend.ts`: same shape, fetches `/api/bq/creatives/top-ad-trend?...`.

**Filter chip row** `CreativeFilterChips.tsx`:

Six chip groups, rendered above the table. State is component-local:

```ts
type LocalFilters = {
  campaignNames: string[];        // multi-select from table data
  campaignStatuses: string[];     // ["Running", "Paused"]
  adsetNames: string[];           // multi-select from table data
  adNameSearch: string;           // text input for partial match
  adStatuses: string[];           // ["Active", "Paused"] — only if WS1 confirmed column
  countries: string[];            // multi-select from table data (top 20 by spend)
};
```

The available options for the multi-select chips come from the table data itself (after the BQ fetch). For Campaign / Adset / Country, populate the chip dropdown from the distinct values present in the current `rows`. For Ad Name search, allow free-text input that filters the table client-side via substring match.

Active chips use mint accent matching the global Platform filter on the dashboard. Empty selection = all (no filter).

Filter logic applies client-side after the fetch — the BQ query returns up to 100 rows, and the filters narrow that visible set further. No refetch on chip change.

**Top Ad trend chart** `TopAdTrend.tsx`:

Reads from `useTopAdTrend(filter)`. Renders a line chart matching the dashboard's `TrendChart` shape but simpler — no metric switcher, just spend over time. Two lines:
- Current period (mint, solid, full opacity)
- Prior 30 days (mint, dashed, 50% opacity)

Title above: "Top Ad by spend (current period vs previous)". Below the chart, a small caption naming the top ad: e.g., "YH_TT_APP_FULL_Sub_iOS_Seasonal_US" (clickable — links to the campaign profile if available).

Empty state when `top_ad: null` returned: "No top creative for this window."

**Per-ad table** `CreativeTable.tsx`:

12 columns in exact order from Looker:

`Ad Name | Spend | Impr | Clicks | Installs | CPI | SubStart | CP SubStart | Sub D0 | CPA D0 | Sub D7 | CPA D7`

Render rules:

- **Ad Name column**: width-constrained with title-tooltip on hover for the full name. Show Meta thumbnail (40x40 rounded) inline before the name when `thumbnail_url` present. Other networks show a placeholder icon (the `Megaphone` lucide icon faded out).
- **Spend column**: blue intensity bar background (clone the `NetworkBreakdown` Spend cell renderer). Money formatted as `$X,XXX` or `$XX.XX`.
- **Numeric columns** (Impr, Clicks, Installs, SubStart, Sub D0, Sub D7): tabular-nums, right-aligned, `n.toLocaleString()`. Maturity-gate Sub D7 to `—` when below threshold.
- **Rate metric columns** (CPI, CP SubStart, CPA D0, CPA D7): cell-tone tinting via `cellTone(value, baseline, "lower-better")`. Baseline is the table's grand-total average for that metric.
- **NULL values** (Google / Apple per-ad spend gaps): render `—` in muted text. No tone.
- **Row hover**: mint tint background.
- **Row interaction**: clicking a row navigates to the (future) per-ad detail route `/campaigns/creatives/[ad_id]`. For now, no-op or link to the parent campaign profile if available.
- **Empty state**: when `rows.length === 0`, render an empty-state card explaining filter narrowness ("No creatives match the current filters. Try widening date range or removing filters.").

**Coverage warning** below the table (always present if Google or Apple ads are in the data):

```tsx
<InfoCallout tone="neutral" icon="info">
  Google Ads and Apple Search Ads don't expose per-ad spend in BigQuery.
  Their rows show subscriber counts only; CPA and ROI columns render as "—".
</InfoCallout>
```

Use the existing `InfoCallout` primitive in `src/components/ui/InfoCallout.tsx`. Verify the component accepts `icon` + `tone` props; if not, extend the API minimally.

### Mobile / responsive behavior

- Below 1024px viewport: the table horizontal-scrolls inside its container (overflow-x-auto). All columns remain visible; user scrolls right.
- Filter chip row wraps to 2-3 rows on narrow screens.
- Top Ad trend chart scales to viewport width.

### Acceptance

- `/campaigns/creatives` renders the full layout: header, filter chips, top-ad trend, table, coverage warning.
- Top 100 ads by spend display in the table, ordered Spend DESC NULLS LAST.
- Filter chips narrow the visible rows without re-fetching.
- Hovering a row tints it mint.
- Meta ads show thumbnails inline; other networks show a placeholder icon.
- CPA D7 / CPI / CP SubStart cells have cell-tone tinting against the table baseline.
- Google / Apple rows show `—` on per-ad efficiency metrics, and the coverage warning is visible below the table.
- Top-ad trend chart renders the #1 creative's spend with current + prior 30-day series.
- Empty state renders when no creatives match.
- Mobile viewport: table horizontal-scrolls, no horizontal page scroll.
- E2E: load page, verify table populates with real data, filter by one campaign, verify table narrows.

---

## Implementation notes

### Branch and PR shape

Single branch `creative-breakdown-view` off `main`. Commit per WS, numbered. Final commit is the housekeeping pass.

### Order inside the PR

1. WS1 — Adset dimension extension + ad_status probe. Foundation.
2. WS2 — Per-ad spend join in the data layer. Standalone work; tests against fixtures.
3. WS3 — Top Ad trend query. Independent of WS2 conceptually.
4. WS4 — Route + page shell.
5. WS5 — Full UI on top of WS2 + WS3.
6. Housekeeping pass.

### Out of scope (explicitly)

- **Per-ad detail route** (`/campaigns/creatives/[ad_id]` drill-down). Row click is a no-op for now. Future PR.
- **Top N selector on the trend chart** (currently auto-picks #1). The Looker version is also auto-pick.
- **Choropleth for country filter**. The country filter is a chip-multi-select for now.
- **Editing creatives** (pause / un-pause). Read-only per the no-write-back rule in CLAUDE.md.
- **Per-creative anomaly detection** (analyst-layer integration). Future.
- **Creative workflow agent** (Limor's larger ask) — that's a separate, agent-shaped workstream.
- **Google / Apple per-ad spend**. The investigation confirmed these don't exist in BQ. Their rows render `—` honestly; not a gap we can close from the data layer.
- **Smart Reports learning about creative-level deltas in prose**. Future follow-up to the analyst-layer integration prompt.

### Housekeeping at PR close

1. **`Lumen Vault/Status.md`** — Move "Creative drilldown view (Limor #1)" from in-flight to shipped. Add a follow-up entry for "per-creative anomaly detection" and "per-ad detail route".
2. **`Lumen Vault/Decisions.md`** — Append a dated entry summarizing what shipped: per-ad spend join across 3 networks, new `/campaigns/creatives` route, the top-ad trend, the 6-chip filter row, coverage warning for Google / Apple.
3. **`Lumen Vault/Technical/BigQuery Warehouse.md`** — Document the new `Creatives` slice usage. Add the `top-ad-trend` query to the query catalogue.
4. **CLAUDE.md** — IA section: the Campaigns page now has a sub-route. Update the Campaigns description to name the per-creative drill-down at `/campaigns/creatives`.
5. **PR description** — surface:
   - The Creatives-slice fan-out math is non-trivial; document the dedupe predicate chosen.
   - Google and Apple per-ad spend not reachable — flagged as a structural BQ gap, not a bug.
   - The 6-chip filter row is local-only state; URL deep-linking deferred.
   - Open question for Gabby: confirm `_Adgroup_Attribution` population rates across the supporting networks; the prior investigation noted it exists but didn't quantify.

### Test budget

- WS1: +5 unit
- WS2: +12 unit (per-network spend joins, NULL handling, rate metric formulas, fan-out dedupe)
- WS3: +6 unit
- WS4: +4 unit
- WS5: +12 unit, +2 E2E (page loads with real data; filter chip narrows rows)

Target: +39 unit, +2 E2E.

### Open questions (flag in PR description; do NOT block)

1. **Fan-out on the Creatives slice.** The investigation report named `breakdown_type='No Breakdown'` as the dedupe predicate for `buildSpendSubquery`. The Creatives slice has its own fan-out shape — likely (date, ad_id) is the natural row key, but verify with the probe in WS1 that there aren't duplicate rows per (date, ad_id) requiring further restriction (e.g., a placement or geo sub-breakdown stacked on top of Creatives).
2. **Top Ad spend threshold.** I picked $100 in the period as the minimum for a creative to qualify as "the top ad". Below threshold the trend chart shows empty state. Reasonable for GlobalComix scale (3 of 5 networks have ad-level spend); adjustable.
3. **Per-network ad_id canonical form.** Meta uses `ad_id`, TikTok uses `ad_id`, AppLovin uses `ad_id` per the investigation. Confirm with a one-line probe during WS2 that the column name is identical across all three; if any uses an aliased name (e.g., `creative_id`), normalize in the leg's SELECT.

### Reference

- Looker target screenshot — chat 2026-05-18 (Creative Breakdown page under TikTok Android + iOS section)
- Prior art doc: `Lumen Vault/Research/Prior Art - GlobalComix UA Looker Dashboard (2026-05-17).md` Frame 9
- BQ investigation: `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md` Bucket 2 (per-ad spend on Creatives slice)
- Existing data: `_queryGlobalComixCreatives` in `src/lib/globalcomix-queries.ts`
- Spend table config: `src/lib/bq-security.ts` `spendSources`
- Cohort subquery: `buildCohortSubquery` in `src/lib/globalcomix-queries.ts` (extended in WS1)
- Brand skill: `.claude/skills/yellowhead-brand/SKILL.md`
- Gold-standard components: `NetworkBreakdown.tsx` (table treatment), `TrendChart.tsx` (line chart shape), `KpiCard.tsx` (cell tinting precedent), `ClientSelector.tsx` (chip-popover pattern for the multi-select filters)
- UI primitives: `GlassCard`, `Skeleton`, `EmptyState`, `InfoCallout`, `SectionError`

### Files most likely to be touched

```
src/app/(app)/campaigns/creatives/page.tsx                      (WS4 new)
src/app/api/bq/creatives/top-ad-trend/route.ts                  (WS3 new)
src/components/campaigns/CreativeBreakdownView.tsx              (WS4 new)
src/components/campaigns/CampaignsView.tsx                      (WS4 — sub-link)
src/components/campaigns/creatives/CreativeFilterChips.tsx      (WS5 new)
src/components/campaigns/creatives/TopAdTrend.tsx               (WS5 new)
src/components/campaigns/creatives/CreativeTable.tsx            (WS5 new)
src/components/ui/Skeleton.tsx                                  (WS4)
src/components/ui/InfoCallout.tsx                               (WS5 — extend if needed)
src/lib/campaigns/use-creative-breakdown.ts                     (WS5 new)
src/lib/campaigns/use-top-ad-trend.ts                           (WS5 new)
src/lib/globalcomix-queries.ts                                  (WS1, WS2, WS3)
src/lib/bq-security.ts                                          (WS2 — Creatives-slice helper)
src/lib/analyst/types.ts                                        (WS3 — ANALYST_QUERY_IDS)
src/types/dashboard.ts                                          (WS2 — CreativeRow extension)
scripts/discover-ad-status-column.ts                            (WS1 new)
Lumen Vault/Status.md                                           (housekeeping)
Lumen Vault/Decisions.md                                        (housekeeping)
CLAUDE.md                                                       (housekeeping)
```
