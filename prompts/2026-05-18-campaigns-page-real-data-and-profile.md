# Campaigns page: wire index to real BQ data + build profile page (2026-05-18)

Owner: Omer. Single PR on a new branch off `main` named `campaigns-real-data-and-profile`. Five workstreams. Closes the "Campaigns page is still on mock data" lurking gap and builds out the per-campaign profile route to be the actual drill-down layer the team needs.

This work is independent of the dashboard rework (`dashboard-full-rework`). If both PRs are in flight, the Campaigns work has no merge conflict with dashboard work — they touch different files. Ship in any order.

## Why this is happening

The Campaigns surface today:
- `/campaigns` index renders a table backed by `@/lib/mock/campaigns` — mock data, mock IDs.
- `/campaigns/[id]` profile route renders a developed 404-line component, also entirely on mock data.
- Column model still uses the pre-WS1.C shape (`roas` / `deltaRoas`) — the post-WS1.C `CampaignRow` in `src/types/dashboard.ts` already carries `roi_d7`, `cpa_d7`, `sub_d7`, `sub_start_d7` for real GlobalComix data.
- No real BQ-backed data, no OS / Platform filter awareness, no campaign-level drill-down beyond what mock provides.

The data layer is ready. The previous PR (`globalcomix-full-implementation`) fixed the cohort `_Campaign_ID` join, so `_queryGlobalComixCampaigns` now returns real ROI D7, CPA D7, Sub D7, Sub Start D7 per campaign. The cohort table also exposes `_Country`, `_Ad_ID`, `_Creative_Attribution`, `_Adgroup_Attribution` per the WS3 expansion. The pieces are there — we just need to wire them through.

## Spec sources

- Audit + plan: chat conversation 2026-05-18 ("plan for the campaign page and profile page of each campaign").
- yellowhead-brand skill at `.claude/skills/yellowhead-brand/SKILL.md`.
- Gold-standard components: `KpiCard`, `TrendChart`, `NetworkBreakdown`, `ClientSelector` (TopBar pattern).
- Existing campaigns scaffolding: `src/components/campaigns/{CampaignsView,CampaignsTable,CampaignProfile,RowSparkline}.tsx`.
- Existing data: `_queryGlobalComixCampaigns`, `_queryGlobalComixCreatives`, `_queryGlobalComixGeo` in `src/lib/globalcomix-queries.ts`. Reused, extended in this PR.
- BQ investigation report: `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md` for column locations and per-table shape.

## Target shape

### `/campaigns` index — the table

The page you go to when a number on the dashboard moves. One row per campaign.

**Columns:** Campaign Name (parsed) · Network · Spend · Installs · CPI · CPA D7 · ROI D7 · Δ Spend · 7d sparkline.

Secondary columns behind a "Show more" toggle (matching NetworkBreakdown's pattern): Sub Start D7 · Sub D7 · Δ ROI D7.

**Filter chips above the table:**
- Channel (existing) — Meta / Google / TikTok / ASA / AppLovin / All
- Family (new) — Romance / Manga / AllCategories / UGC / Other (parsed via classifier)
- Geo (new) — US / WW-NonEU / WW-Top / ... (parsed via classifier)
- Status (new) — Running / Paused (from `campaign_status` column on spend tables)

**TopBar filters that apply:** Date, OS, Platform, Client. Same wiring as the dashboard.

**Row interaction:** Click a row to navigate to `/campaigns/[campaign_id]` with current TopBar filters preserved in the URL.

### `/campaigns/[campaign_id]` profile — the drill-down

The page you go to when you've identified WHICH campaign you want to understand.

**Sections, in order:**

1. **Header.** Parsed campaign name as a chip row (channel · platform · family · geo · type) plus the raw name below. Status pill (running / paused). Client + window context.

2. **KPI strip.** Four `KpiCard` tiles, CPA D7 as the hero with mint highlight. Order: CPA D7 / Spend / Installs / ROI D7. Deltas vs previous equal-length period. Sparkline from the daily trend below.

3. **Daily trend chart.** Reuse the dashboard's `TrendChart`. Metric switcher (spend / installs / CPA D7 / ROI D7). Maturity-gated: last 6 days of D7 metrics render as `—`.

4. **Adset breakdown.** Per-adset table inside this campaign. Same column shape as the index but scoped. Adset dimension comes from the cohort `_Adgroup_Attribution` and from the spend `breakdown_type='Country'` slice (which carries adset_id/adset_name per the BQ investigation). New query needed.

5. **Creative breakdown.** Per-ad table where data exists. Meta has thumbnails via `ods_fb2_creatives_globalcomix`. TikTok and AppLovin have ad-level cohort data. Reuse `queryGlobalComixCreatives` filtered by `campaign_id`. Show ad thumbnail where Meta provides it; parse archetype / format / version from structured ad names.

6. **Geographic breakdown.** Per-country table for this campaign. Reuse `queryGlobalComixGeo` filtered by `campaign_id`. Top 10 countries + Other row. Choropleth is a future polish.

7. **Peer comparison.** Up to 5 other campaigns in the same family + geo, side-by-side on CPA D7 and ROI D7. Computed client-side from the index's campaign list — NO new BQ query. Simple table with mint-highlighted "this campaign" row.

8. **Coverage warnings.** Inline callouts where relevant — AppLovin campaigns before 2026-05-05 show "Limited coverage: AppLovin data starts 2026-05-05" using `InfoCallout`.

**TopBar filters on profile:**
- Date range: applies (window for the profile data).
- OS / Platform: HIDDEN. A campaign is one campaign — narrowing by OS/Platform is incoherent. Same unmount-from-DOM trick as the Lifecycle tab on the dashboard.
- Client: visible but switching client navigates away (campaign IDs are per-client).

## TL;DR

Five workstreams, single PR, strict commit order:

1. **WS1 — Index wire-up.** Replace mock with `/api/bq/campaigns` fetch. Adopt the post-WS1.C column shape. Thread OS / Platform from TopBar.
2. **WS2 — Index enrichment.** Family / Geo / Status chips above the table. Show More columns toggle. Status column. Classifier-enriched rows.
3. **WS3 — Data layer for profile.** New unified `queryGlobalComixCampaignProfile(campaignId, from, to)`. Extends two existing queries (`creatives`, `geo`) to accept `campaign_id` filter. New mini-queries for `campaign_status`, `daily_trend`, `adsets`. New API route `/api/bq/campaigns/[campaign_id]/profile/route.ts`.
4. **WS4 — Profile UI wire-up.** Drop `generateStaticParams`. Replace mock with the unified profile fetch. Fill the existing scaffold (header / KPI strip / trend) with real data. Adapt to new column shape.
5. **WS5 — Profile new sections.** Adset breakdown, creative breakdown, geographic breakdown, peer comparison, coverage warnings. Plus the TopBar filter-hiding logic for the profile route.

Estimated PR size: 15-25 files touched. ~800-1,200 lines added, ~300-400 lines removed (mock-data imports and the mock-shaped column references). Test budget: +40-60 unit, +3 E2E.

---

## WS1 — Index wire-up

### File touchpoints

```
src/lib/campaigns/use-campaigns-data.ts     // new — hook over /api/bq/campaigns
src/components/campaigns/CampaignsView.tsx  // drop getCampaigns import, use hook
src/components/campaigns/CampaignsTable.tsx // column model swap
src/lib/mock/campaigns.ts                   // keep file (Playw3 / 100play still use it); narrow exports
```

### Change

**New hook.** `src/lib/campaigns/use-campaigns-data.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { CampaignRow } from "@/types/dashboard";
import type { OsFilter, PlatformFilter } from "@/lib/filters/types";

type Args = {
  from: Date;
  to: Date;
  client: string;
  os: OsFilter;
  platforms: PlatformFilter[];
};

type State = {
  rows: CampaignRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useCampaignsData(args: Args): State {
  // mirror useDashboardData shape: AbortController, URLSearchParams that omit
  // default os/platforms so cache keys collapse, effect deps include
  // platforms.join(",") for stable identity.
}
```

URL pattern: `/api/bq/campaigns?client=globalcomix&from=...&to=...&os=ios&platforms=meta,google`. The route already exists and accepts these params (WS6 of the prior PR).

**CampaignsView consumes the hook.** Replace the mock import:

```ts
// before
import { getCampaigns } from "@/lib/mock/campaigns";
// ...
const rows = useMemo(() => getCampaigns({ from, to, client }), [from, to, client]);

// after
import { useCampaignsData } from "@/lib/campaigns/use-campaigns-data";
// ...
const { os, platforms } = useGlobalFilters();
const { rows, loading, error, refetch } = useCampaignsData({ from, to, client, os, platforms });
```

**Loading and error states.** While `loading && rows === null`, render a `CampaignsTableSkeleton` (add it to `src/components/ui/Skeleton.tsx`). On error, render a `SectionError` with a Retry button calling `refetch`. Match the dashboard's loading and error patterns.

**CampaignsTable column model.** Update column keys from the mock vocabulary to the BQ vocabulary:

```ts
// before (mock)
type SortKey = "name" | "channel" | "spend" | "installs" | "cpi" | "roas" | "deltaRoas";

// after (BQ)
type SortKey =
  | "campaign_name"
  | "network"
  | "spend"
  | "installs"
  | "cpi"
  | "cpa_d7"
  | "roi_d7"
  | "spendDelta"
  | "sub_d7"          // behind Show More
  | "sub_start_d7";   // behind Show More
```

Update the `COLUMNS` array and the cell render functions. CPA D7 and ROI D7 render with the cell-tone treatment matching NetworkBreakdown (post-WS4 of the dashboard rework — if that PR hasn't landed yet, just render plain for now; it'll pick up tone styling for free when WS4 lands because `NetworkBreakdown.tsx` and `CampaignsTable.tsx` would import the same helper).

The mock `roas` field is gone — column header reads "ROI D7" with format `${n.toFixed(2)}x`. The mock `deltaRoas` becomes `Δ ROI D7` chip — but ROI D7 deltas aren't currently in the API response, only `spendDelta`. **For this PR, omit `Δ ROI D7` from the columns.** Add a TODO comment in the query for a future "trailing ROI D7 baseline" extension.

### Acceptance

- `/campaigns` renders real BQ data instead of mock.
- Clicking OS / Platform / Date in TopBar refetches the table.
- Columns reflect the new model (CPA D7, ROI D7, Sub D7, Sub Start D7).
- Loading state shows a skeleton, not a blank page.
- Error state shows a SectionError with retry.
- Sortable on every column.
- Channel filter (existing) continues to work.
- Unit tests cover: URL shape with default filters, URL shape with narrowed filters, sort by each column, click row navigates to `/campaigns/[id]?...filters`.

---

## WS2 — Index enrichment

### File touchpoints

```
src/components/campaigns/CampaignsTable.tsx
src/components/campaigns/CampaignsView.tsx
src/lib/globalcomix-queries.ts              // add campaign_status to existing query
```

### Change

**Add `campaign_status` to the campaigns query.** In `_queryGlobalComixCampaigns` (`src/lib/globalcomix-queries.ts` around line 1207), the spend UNION already touches each `dwh_*_adjust` table. Project `campaign_status` through:

```sql
WITH curr AS (
  SELECT
    campaign_id,
    ANY_VALUE(campaign_name)   AS campaign_name_raw,
    ANY_VALUE(campaign_status) AS campaign_status,  -- NEW
    ANY_VALUE(network) AS network,
    SUM(cost_usd) AS spend,
    SUM(installs) AS installs
  FROM ${spendSub}
  WHERE date BETWEEN ${FROM} AND ${TO}
  GROUP BY campaign_id
),
```

`buildSpendSubquery` already projects `campaign_status` from the spend tables (verify with a quick grep; if not, add it — every `dwh_*_adjust` table has this column per the BQ investigation). Add `campaign_status: string | null` to `CampaignRow` in `src/types/dashboard.ts`.

**Classifier enrichment.** Use `classifyCampaignName` from `src/lib/analyst/campaign-classifier.ts` to enrich each row client-side after the fetch:

```ts
import { classifyCampaignName } from "@/lib/analyst/campaign-classifier";

const enriched = rows.map((row) => ({
  ...row,
  ...classifyCampaignName(row.campaign_name),
}));
```

(The analyst layer also exports `enrichCampaignRow` — check if reusable. If the analyst's enrichment shape matches, use that.)

**Filter chips above the table.** Three new chip groups, matching the visual language of the dashboard's Platform filter (mint accent when active, brand tint when neutral):

- **Family**: Romance / Manga / AllCategories / UGC / Other / All. Active value(s) filter the visible rows client-side.
- **Geo**: US / WW-Top / WW-NonEU / NH+UK / APAC / Other / All. Same.
- **Status**: Running / Paused / All. Same.

Selection state lives in component-local React state for now (not URL state — the filters above the table are scratch filters, not deep-linkable). If the team wants deep-linkable scratch filters in a future PR, that's a clean extension.

**Show More columns toggle.** A small "Show more" button at the right of the header row. When clicked, reveals Sub Start D7 + Sub D7 + Δ ROI D7 columns. State in component-local React. Mirror the pattern used by NetworkBreakdown (verify with a grep — there's an existing pattern there).

### Acceptance

- Family / Geo / Status chip groups render above the table.
- Selecting a chip filters the table client-side without a refetch.
- "Show more" reveals secondary columns.
- Status pill renders per-row (mint LivePulse for running, muted for paused).
- Unit tests: classifier enrichment shape, chip filter logic, show-more toggle.

---

## WS3 — Data layer for profile

### File touchpoints

```
src/lib/globalcomix-queries.ts                                  // extensions
src/lib/analyst/types.ts                                        // 3 new ANALYST_QUERY_IDS
src/app/api/bq/campaigns/[campaign_id]/profile/route.ts         // new route
```

### Change

**Unified profile query.** New export in `globalcomix-queries.ts`:

```ts
export const queryGlobalComixCampaignProfile = (
  client: string,
  campaignId: string,
  from: string,
  to: string,
) =>
  withRedisCache(
    {
      client,
      query: "campaign-profile",
      params: { campaignId, from, to },
      ttlSeconds: 12 * 60 * 60,
    },
    () => _queryGlobalComixCampaignProfile(client, campaignId, from, to),
  );

async function _queryGlobalComixCampaignProfile(
  client: string,
  campaignId: string,
  from: string,
  to: string,
): Promise<CampaignProfileData> {
  // Orchestrate: summary + daily trend + adsets + creatives + geo, in parallel
  const [summary, trend, adsets, creatives, geo] = await Promise.all([
    fetchSummary(client, campaignId, from, to),
    fetchDailyTrend(client, campaignId, from, to),
    fetchAdsets(client, campaignId, from, to),
    fetchCreatives(client, campaignId, from, to),
    fetchGeo(client, campaignId, from, to),
  ]);
  return { summary, trend, adsets, creatives, geo };
}
```

Each `fetch*` helper is a small dedicated query function inside the same file. Some reuse existing patterns:

- `fetchSummary`: filter `_queryGlobalComixCampaigns` shape to one campaign_id. New helper or inline.
- `fetchDailyTrend`: GROUP BY date for one campaign_id across the spend UNION + cohort. New query, ~30 lines of SQL.
- `fetchAdsets`: GROUP BY `_Adgroup_Attribution` for one campaign_id on the cohort + spend `breakdown_type='Country'` slice. New query.
- `fetchCreatives`: existing `_queryGlobalComixCreatives` with a `WHERE _Campaign_ID = @campaignId` predicate added — extend the function signature to accept an optional `campaignId` filter.
- `fetchGeo`: same pattern — extend `_queryGlobalComixGeo` to accept an optional `campaignId` filter.

**Type shape.** New types in `src/types/dashboard.ts`:

```ts
export type CampaignProfileData = {
  summary: CampaignSummary;                  // single-campaign aggregates + deltas
  trend: CampaignTrendPoint[];               // per-day for this campaign
  adsets: AdsetRow[];
  creatives: CreativeRow[];
  geo: GeoRow[];
};

export type CampaignSummary = {
  campaign_id: string;
  campaign_name: string;
  network: string;
  campaign_status: string | null;
  // Current period:
  spend: number;
  installs: number;
  cpi: number;
  cpa_d7: number | null;
  roi_d7: number;
  sub_start_d7: number | null;
  sub_d7: number | null;
  // Period-over-period deltas:
  spend_delta: number | null;
  installs_delta: number | null;
  cpa_d7_delta: number | null;
  roi_d7_delta: number | null;
};
// ... AdsetRow, CreativeRow, GeoRow, CampaignTrendPoint
```

**ANALYST_QUERY_IDS additions.** In `src/lib/analyst/types.ts`:

```ts
export const ANALYST_QUERY_IDS = {
  // ...existing...
  CAMPAIGN_PROFILE:    "campaign-profile",
  CAMPAIGN_DAILY:      "campaign-daily",         // if exposed as a sub-query
  CAMPAIGN_ADSETS:     "campaign-adsets",        // if exposed as a sub-query
} as const;
```

Only register the IDs that surface as cache keys. The internal sub-queries that happen inside `_queryGlobalComixCampaignProfile` don't need their own IDs unless they're separately cached.

**API route.** New `src/app/api/bq/campaigns/[campaign_id]/profile/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { queryGlobalComixCampaignProfile } from "@/lib/globalcomix-queries";
import { bqErrorResponse, requireParams } from "../../_lib/handle";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> }
) {
  const { campaign_id } = await params;
  const queryParams = requireParams(req.nextUrl.searchParams, ["client", "from", "to"]);
  if (queryParams instanceof NextResponse) return queryParams;
  try {
    const data = await queryGlobalComixCampaignProfile(
      queryParams.client,
      campaign_id,
      queryParams.from,
      queryParams.to,
    );
    return NextResponse.json(data);
  } catch (err) {
    return bqErrorResponse(err, "campaign-profile");
  }
}
```

### Acceptance

- `/api/bq/campaigns/<id>/profile?client=globalcomix&from=...&to=...` returns the unified shape.
- Each section of `CampaignProfileData` is populated correctly against fixture data.
- The route handles unknown campaign_id gracefully (returns empty sections, not 500).
- Unit tests against fixtures for each sub-fetch helper.

---

## WS4 — Profile UI wire-up

### File touchpoints

```
src/app/(app)/campaigns/[id]/page.tsx       // drop generateStaticParams
src/components/campaigns/CampaignProfile.tsx // replace mock fetch with real
src/lib/campaigns/use-campaign-profile.ts   // new hook
```

### Change

**Drop static generation.** The current page does:

```ts
import { ALL_CAMPAIGN_IDS } from "@/lib/mock/campaigns";

export function generateStaticParams() {
  return ALL_CAMPAIGN_IDS.map((id) => ({ id }));
}

export default async function CampaignProfilePage({ params }) {
  const { id } = await params;
  if (!ALL_CAMPAIGN_IDS.includes(id)) notFound();
  return <CampaignProfile id={id} />;
}
```

Replace with a dynamic page that doesn't try to enumerate IDs at build time:

```ts
export default async function CampaignProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignProfile campaignId={id} />;
}
```

The `notFound()` path moves into `CampaignProfile` itself — when the profile fetch returns empty `summary`, render a "Campaign not found in active window" empty state with a back link.

**New hook.** `src/lib/campaigns/use-campaign-profile.ts`:

```ts
export function useCampaignProfile(args: {
  campaignId: string;
  from: Date;
  to: Date;
  client: string;
}): {
  data: CampaignProfileData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  // mirror useCampaignsData / useDashboardData shape.
  // URL: /api/bq/campaigns/<campaignId>/profile?client=...&from=...&to=...
  // No os / platforms params — profile is one campaign, filter unmount on this route.
}
```

**CampaignProfile component rewrite.** Replace `getCampaignDetail(id, ...)` mock call with the new hook. The existing JSX scaffold (header, KPI strip, trend chart, platform split) stays — just sourced from `data.summary`, `data.trend` instead of `detail`. Adapt:

- KPI strip: ROAS becomes ROI D7 (mint-highlighted as hero), with CPA D7 / Spend / Installs / ROI D7 mapping (CPA D7 is the new hero per the GlobalComix vocab — adjust the order so CPA D7 is highlighted, not ROI D7).
- Trend chart: pass `data.trend` (already shaped to `BQTrendPoint[]` or compatible).
- The mock-data "Platform split" panel: REPLACE with WS5 sections (adset / creative / geo / peers). The platform split was a placeholder; the real sections are richer.

**TopBar filter unmount on profile route.** In `src/components/shell/TopBar.tsx`, extend the route-detection logic to hide OS + Platform chips when the path matches `/campaigns/[id]`. Same trick as the Lifecycle tab from the dashboard PR — actually unmount, not just CSS-hide.

### Acceptance

- `/campaigns/<real_id>` renders with real BQ data.
- `/campaigns/<bad_id>` renders an empty state with a back link.
- KPI strip shows real CPA D7 / Spend / Installs / ROI D7 with deltas.
- Trend chart renders per-day data for the active window.
- OS + Platform chips in TopBar are NOT in the DOM on this route.
- Date range filter applies and re-fetches the profile.
- Back link to `/campaigns` preserves the active filters.

---

## WS5 — Profile new sections

### File touchpoints

```
src/components/campaigns/CampaignProfile.tsx                // section orchestration
src/components/campaigns/profile/AdsetBreakdown.tsx         // new
src/components/campaigns/profile/CreativeBreakdown.tsx      // new
src/components/campaigns/profile/GeoBreakdown.tsx           // new
src/components/campaigns/profile/PeerComparison.tsx         // new
src/components/campaigns/profile/CoverageWarning.tsx        // new (or reuse existing InfoCallout patterns)
```

### Change

**Adset breakdown.** Read `data.adsets` from the profile payload. Render a table matching the index column shape (Adset name · Spend · Installs · CPI · CPA D7 · ROI D7) with row hover + cell tinting. Empty state if no adsets in the window. Maturity gating on D7 cells.

**Creative breakdown.** Read `data.creatives`. Render a table with thumbnail preview (where Meta provides it), ad name, archetype (parsed from naming convention), format (9x16 / 16x9 / Playable / etc.), spend, installs, CPA D7, ROI D7. Empty state for campaigns without creative-level data (Google, Apple — these are out of scope until ad-level data exists for those channels).

**Geographic breakdown.** Read `data.geo`. Render a simple table — Top 10 countries by spend with their per-country CPA D7 + ROI D7. The choropleth map is deferred to a future polish PR. Show Grand Total row at the bottom matching what NetworkBreakdown does.

**Peer comparison.** Read the current campaign's `family` and `geo` from the classifier. Filter the active campaigns list (from `useCampaignsData` — yes, this profile page fetches the index data too for peer comparison) to up to 5 other campaigns matching the same family + geo. Side-by-side table on CPA D7 + ROI D7. Highlight this-campaign row with mint background.

If `useCampaignsData` is too heavy to load on the profile page just for peers, expose a lighter `useCampaignPeers(campaignId, from, to, client)` hook that fetches the same `/api/bq/campaigns` endpoint and filters client-side. Either approach is fine.

**Coverage warnings.** Inline at the top of the profile (above the KPI strip), conditional on:
- AppLovin campaign with active window starting before 2026-05-05: "Limited coverage: AppLovin data starts 2026-05-05."
- Future: campaign with `campaign_status === "paused"` and zero spend in window: "This campaign is paused; metrics reflect prior activity."

Use `InfoCallout` for the visual.

**Section orchestration in CampaignProfile.tsx.** Insert the new sections in order between the existing scaffold:

```tsx
<CoverageWarnings summary={data.summary} />
<Header summary={data.summary} />
<KpiStrip summary={data.summary} />
<TrendChart trend={data.trend} />
<AdsetBreakdown adsets={data.adsets} />
<CreativeBreakdown creatives={data.creatives} />
<GeoBreakdown geo={data.geo} />
<PeerComparison campaignId={id} family={data.summary.family} geo={data.summary.geo} />
```

### Acceptance

- Each section renders with real data when available, empty-state card when not.
- Adset / Creative / Geo tables sort by their columns.
- Peer comparison shows up to 5 similar campaigns with this-campaign row mint-highlighted.
- Coverage warning renders for AppLovin pre-coverage windows.
- E2E: open a real campaign profile, see all 5+ sections render.

---

## Implementation notes

### Branch and PR shape

Single branch `campaigns-real-data-and-profile` off `main`. Commit per WS, numbered. Final commit is the housekeeping pass.

### Order inside the PR

Strict order:

1. WS1 — Index wire-up. Foundation. Index works against real data before profile touches anything.
2. WS2 — Index enrichment. Adds chips + Show More.
3. WS3 — Data layer for profile. New unified query + API route. No UI yet.
4. WS4 — Profile UI wire-up. Replaces mock with real.
5. WS5 — Profile new sections. The richer drill-down.
6. Housekeeping pass.

### Out of scope (explicitly)

- Anything outside `/campaigns`.
- Playw3 / 100play column updates. Those clients still use `roas` and the mock-style shape. They're agent-strategy clients that don't have the subscription funnel; the rename happens for those clients only when their data shape is reworked. For this PR, `roas` stays in their type and rendering paths.
- Choropleth map for geographic. Deferred.
- Anomaly detection on campaign profile (Anomstack hooks for "this campaign is trending badly"). Deferred to the analyst-layer follow-up.
- Shareable / exportable campaign profile (a future workstream, depends on the Reports infra).
- Editing budgets / bids / status. Read-only, per the no-write-back rule in CLAUDE.md.

### Housekeeping at PR close

1. `Lumen Vault/Status.md` — move "Campaigns page on mock data" from in-flight to shipped section. Add a follow-up entry for "anomaly detection on campaign profile (Anomstack hooks for this-campaign-trending-bad)".
2. `Lumen Vault/Decisions.md` — append a dated entry summarizing what shipped: index wire-up to BQ, new profile route shape, the new query, the profile sections.
3. `Lumen Vault/Technical/BigQuery Warehouse.md` — note the new query (`campaign-profile`) in the table of queries.
4. CLAUDE.md — the Campaigns section in the IA describes "Campaign breakdown table" but doesn't describe the profile route. Update to describe the per-campaign drill-down.
5. PR description — call out:
   - The mock data module is now unused by the multi-source pilot path but still imported by Playw3 / 100play. Don't delete the file.
   - The `generateStaticParams` removal means `/campaigns/[id]` is dynamic at request time, not pre-rendered. This is intentional — campaign IDs are dynamic.
   - The OS / Platform unmount on the profile route is a deliberate IA decision, not a bug. Cross-reference the dashboard tab Lifecycle pattern.

### Test budget

- WS1: +8 unit, +1 E2E
- WS2: +6 unit
- WS3: +12 unit (per-fetcher tests + the orchestrator)
- WS4: +6 unit, +1 E2E (profile page renders with real data)
- WS5: +10 unit, +1 E2E (new sections render and respect data)

Target: +42 unit, +3 E2E. Existing suite continues to pass.

### Open questions (not blocking, flag in PR description)

1. **Family / Geo classifier coverage.** The classifier handles canonical `YH_*` names; legacy names fall through to `family: "Other"`. The Family chip filter on the index will show a large "Other" bucket for legacy clients. Acceptable for now; revisit when the BI team migrates legacy names.
2. **Profile route for non-GlobalComix clients.** Playw3 / 100play campaigns will navigate to the same `/campaigns/[id]` route. The dispatch in `queryGlobalComixCampaignProfile` is GlobalComix-specific. For Playw3 / 100play, the profile fetch should fall back to a minimal shape (summary + trend only — no adsets / creatives / geo). Add the dispatch in `bq-queries.ts` matching the pattern for the other queries.
3. **Peer comparison performance.** If a client has 500+ campaigns, the peer-comparison filter runs over all of them client-side. Today GlobalComix has roughly 80 distinct names; not a concern. Flag for if a future client onboards with a much larger campaign list.

### Reference

- Existing scaffolding: `src/components/campaigns/{CampaignsView,CampaignsTable,CampaignProfile,RowSparkline}.tsx`
- Existing route: `src/app/(app)/campaigns/page.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`
- Existing API: `src/app/api/bq/campaigns/route.ts` (index)
- Server type: `src/types/dashboard.ts` `CampaignRow`
- Data queries: `src/lib/globalcomix-queries.ts` (`_queryGlobalComixCampaigns`, `_queryGlobalComixCreatives`, `_queryGlobalComixGeo`)
- Classifier: `src/lib/analyst/campaign-classifier.ts` (`classifyCampaignName`, `enrichCampaignRow`)
- BQ investigation report: `Lumen Vault/Technical/BQ Investigation - GlobalComix Data Coverage (2026-05-17).md`
- Brand skill: `.claude/skills/yellowhead-brand/SKILL.md`
- Gold-standard components: `KpiCard`, `TrendChart`, `NetworkBreakdown`, `ClientSelector`

### Files most likely to be touched

```
src/lib/campaigns/use-campaigns-data.ts                      (WS1 new)
src/lib/campaigns/use-campaign-profile.ts                    (WS4 new)
src/components/campaigns/CampaignsView.tsx                   (WS1, WS2)
src/components/campaigns/CampaignsTable.tsx                  (WS1, WS2)
src/components/campaigns/CampaignProfile.tsx                 (WS4, WS5)
src/components/campaigns/profile/AdsetBreakdown.tsx          (WS5 new)
src/components/campaigns/profile/CreativeBreakdown.tsx       (WS5 new)
src/components/campaigns/profile/GeoBreakdown.tsx            (WS5 new)
src/components/campaigns/profile/PeerComparison.tsx          (WS5 new)
src/components/campaigns/profile/CoverageWarning.tsx         (WS5 new)
src/components/ui/Skeleton.tsx                               (WS1 — CampaignsTableSkeleton)
src/components/shell/TopBar.tsx                              (WS4 — route detection)
src/app/(app)/campaigns/[id]/page.tsx                        (WS4)
src/app/api/bq/campaigns/[campaign_id]/profile/route.ts      (WS3 new)
src/lib/globalcomix-queries.ts                               (WS2, WS3)
src/lib/bq-queries.ts                                        (WS3 — dispatch)
src/lib/analyst/types.ts                                     (WS3 — ANALYST_QUERY_IDS)
src/types/dashboard.ts                                       (WS2, WS3 — type extensions)
Lumen Vault/Status.md                                        (housekeeping)
Lumen Vault/Decisions.md                                     (housekeeping)
CLAUDE.md                                                    (housekeeping)
```
