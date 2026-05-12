# Lumen — BigQuery build plan

**Date:** 2026-05-11
**Reference:** `docs/data/bq_view_plan.md` (the warehouse map)
**Audience:** us. No BI dependency. No external sign-off. Decisions are made in this doc and we ship against them.

This is the executable plan. Every section below is either (a) a decision that is final, (b) a concrete code change with a file path, or (c) a sequence step. No "we should ask," no "TBD," no "depending on X."

---

## Mission

Get Lumen reading live multi-platform data from `yellowhead-visionbi-rivery` for every currently active UA client, using the discovery findings, and replace the existing two-client (GlobalComix, Playw3) + 100play scaffold with a roster-driven dashboard that scales to all 8 active clients on day one.

## Where we are right now

The repo already has working BQ infrastructure. Do not rebuild it.

- `src/lib/bq.ts` — singleton BQ client, ADC + service-account JSON support.
- `src/lib/bq-security.ts` — per-client schema map, allowlist via `ALLOWED_CLIENTS` env, two query strategies (`agent`, `lumen-union`).
- `src/lib/bq-queries.ts` — KPIs, trend, channel mix, campaigns, freshness, data bounds. Parameterized, cached via `unstable_cache` (30-min TTL).
- `src/lib/bq-queries-100play.ts` — per-client variant for 100play.
- `src/app/api/bq/*` — API routes for the above.
- `src/types/dashboard.ts` — shared types.
- UI components for KPI tiles, trend chart, channel mix, campaigns table, client selector, data freshness bar.

What is missing: a third query strategy that handles the UNION-ALL across the 4 healthy `management_dashboard_*` tables, integration with `pre_sales_updated_clients_tracking` as the authoritative client roster, and a `/clients` page that lets the user actually pick from more than two clients.

## Where we are going

```
              roster (pre_sales_updated_clients_tracking)
                          │
                          ▼
                   client picker / list
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
  strategy: agent   strategy:           strategy:
  (legacy)          management-         lumen-union
                    dashboard           (legacy 100play)
       │                  │                  │
       ▼                  ▼                  ▼
  v_agent_*         UNION ALL of 4     dwh_fb2_ios14_
  per client        management_        appsflyer_100play
                    dashboard_*
                    tables
                          │
                          ▼
              same KPI / trend / campaigns
              query helpers (existing)
                          │
                          ▼
                same UI components
```

The architecture is additive. The existing two strategies stay. We add one more (`management-dashboard`) and one new data input (the roster). All UI components stay. All API routes stay or get a sibling under `/api/bq/<slug>/` per the existing pattern.

---

## Decisions baked in

Final calls. No more open questions on these. If they turn out wrong we fix forward, not before.

### 1. Source layer for active UA clients
UNION ALL across `management_dashboard_fb2`, `management_dashboard_fb_ios14`, `management_dashboard_apple`, `management_dashboard_google`. Hardcoded set of four. TikTok and LinkedIn are excluded because the underlying tables are >15 months and >17 months stale respectively. We do not show them, do not banner them, do not pretend they exist for new clients.

### 2. Authoritative client list
`pre_sales_updated_clients_tracking` is the truth. Filter to `Team = 'UA'` (or the equivalent UA-tagged values, see Step 1 below) and `End_Date IS NULL OR End_Date > CURRENT_DATE()`. The 8 active clients from the discovery (Stardust Casino, Keno, Video Poker, Ultimate X Poker, Smart Sleep Coach, etc.) are the Phase 1 universe.

### 3. Identity key
`LOWER(TRIM(master_account))` everywhere. `master_account_id` is per-platform and not safe as a join key (Video Poker has three different IDs across FB / Apple / Google). Slug for URLs is `master_account_normalized = REGEXP_REPLACE(LOWER(TRIM(master_account)), r'[^a-z0-9]+', '-')`.

### 4. NULL `master_account` rows in Apple
Filtered out at query time (`WHERE master_account IS NOT NULL`). Surfaced in the UI as a small "X% of Apple spend unattributed" footnote on any view that includes Apple data. Not hidden, not blocking.

### 5. Lumen-owned BQ view: not yet
The Phase 1 union happens in TypeScript inside the data layer. We do not create a `lumen.fact_daily` view in BQ for Phase 1. Reasons: (a) the union is small (~110 MB scan), (b) we control the SQL fully without coordinating, (c) we revisit only if the union becomes painful to maintain.

### 6. Superbloom and the Singular pipeline
Out of Phase 1. Adding `yh_singular` + `pw_yh_cohort_*` is Phase 1.5 work, not blocking. Until then, Superbloom Games clients (Venue, aTable, Highrise, Obsidian Knight, Kingdom Maker, Mundo Slots) are simply not in the Lumen client picker. The roster filter handles this naturally if those clients are not Team='UA' or are not in the active management_dashboard set.

### 7. The "new" dashboard layer (`dwh_management_dashboard_new`)
Ignore until/unless our queries break. We have no signal that the existing 4 tables are being deprecated, so we use them. If a column rename or table drop breaks Lumen, we migrate fast with the discovery as our reference.

### 8. Service account
We create `lumen-app@yellowhead-visionbi-rivery.iam.gserviceaccount.com` (or whatever GCP allows for naming) with `roles/bigquery.dataViewer` on `yellowhead_prod` and `roles/bigquery.jobUser` on the project. JSON key, base64-encoded, into `GOOGLE_APPLICATION_CREDENTIALS_JSON` per the existing pattern in `src/lib/bq.ts`. This makes Lumen traffic identifiable in audit logs from day one.

### 9. Freshness signal
Switch to a per-platform `MAX(date)` query against the four `management_dashboard_*` tables themselves. The existing Rivery telemetry is upstream of this layer and was misleading anyway (it tells us when raw data landed, not when the aggregate refreshed). The new freshness query is one round-trip and gives us per-platform last-data-date directly.

### 10. Caching
Keep the existing pattern. 30-minute TTL for KPI/trend/campaigns/channel-mix queries (the underlying data only refreshes daily). 24-hour TTL for the client roster (changes weekly at most). 10-minute TTL for freshness. Cache key includes the client slug so client switches produce separate entries.

### 11. The legacy two strategies stay
`agent` (GlobalComix, Playw3) and `lumen-union` (100play) remain as-is. They are working. The new strategy is `management-dashboard`. The router in `bq-security.ts` picks based on whether the client appears in the active `management_dashboard_*` set; if yes, `management-dashboard`; if not, fall back to the existing strategy map.

---

## The data layer changes

Six concrete code changes. Listed in dependency order.

### Change 1: Add the `management-dashboard` strategy to `bq-security.ts`

```ts
// src/lib/bq-security.ts

export type QueryStrategy = "agent" | "lumen-union" | "management-dashboard";

export type ClientSchema = {
  strategy: QueryStrategy;
  spendCol: string;
  revenueCol: string;
  dedupePredicate?: string;
  primaryTable?: string;
};

// New: returns the schema for any client in the active management_dashboard set.
// Constant across all such clients, since the union schema is uniform.
const MANAGEMENT_DASHBOARD_SCHEMA: ClientSchema = {
  strategy: "management-dashboard",
  spendCol: "cost_usd",
  revenueCol: "revenue",
};

export function getSchemaForClient(client: string): ClientSchema {
  const normalized = client.toLowerCase().trim();
  assertClientAllowed(normalized);

  // Existing per-client overrides win (legacy).
  const explicit = CLIENT_SCHEMA[normalized];
  if (explicit) return explicit;

  // Default: any allowed client without an override falls into the
  // management-dashboard strategy. This is the new path for all active
  // UA clients sourced from the roster.
  return MANAGEMENT_DASHBOARD_SCHEMA;
}
```

The allowlist (`ALLOWED_CLIENTS` env var) becomes the union of: legacy slugs (globalcomix, playw3, 100play) + the slugs derived from the current active roster. We populate the active slugs at deploy time from a one-shot query against `pre_sales_updated_clients_tracking`.

### Change 2: Add the union helper

New file: `src/lib/bq-union.ts`. The shared SQL fragment used by every management-dashboard query.

```ts
import "server-only";
import { serverEnv } from "@/lib/env.server";

const PLATFORM_TABLES: { table: string; networkLabel: string }[] = [
  { table: "management_dashboard_fb2",      networkLabel: "Meta" },
  { table: "management_dashboard_fb_ios14", networkLabel: "Meta iOS14" },
  { table: "management_dashboard_apple",    networkLabel: "Apple Search Ads" },
  { table: "management_dashboard_google",   networkLabel: "Google Ads" },
];

/**
 * Returns the SQL CTE body for the 4-platform union, with a date-window
 * filter pushed into each branch. The result CTE has the columns:
 *   date, master_account_id, master_account, app_name, campaign_id,
 *   campaign_name, campaign_status, cost_usd, clicks, impressions,
 *   installs, revenue, num_ftd7, purchases, network
 *
 * `network` is the Lumen-owned label, not the upstream PLATFORM column,
 * insulating us from upstream casing changes.
 */
export function unionAllManagementDashboard(): string {
  return PLATFORM_TABLES.map(
    ({ table, networkLabel }) => `
      SELECT
        date, master_account_id, master_account, app_name,
        campaign_id, campaign_name, campaign_status,
        cost_usd, clicks, impressions, installs, revenue,
        num_ftd7, purchases,
        '${networkLabel}' AS network
      FROM \`${serverEnv.BQ_PROJECT}.${serverEnv.BQ_DATASET}.${table}\`
      WHERE date BETWEEN @from AND @to
        AND master_account IS NOT NULL`,
  ).join("\nUNION ALL\n");
}
```

### Change 3: Add the roster query helpers

New file: `src/lib/bq-roster.ts`. Reads `pre_sales_updated_clients_tracking` and returns the active UA roster, joined with spend recency from the management_dashboard union.

```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { getBigQueryClient } from "@/lib/bq";
import { serverEnv } from "@/lib/env.server";
import { unionAllManagementDashboard } from "@/lib/bq-union";

export type RosterClient = {
  slug: string;             // url-safe LOWER(TRIM) of master_account
  display: string;          // canonical display name from roster
  team: string;             // 'UA' for Phase 1
  accountManager: string | null;
  monthlyBudget: number | null;
  startDate: string | null;
  endDate: string | null;
  dashboardLink: string | null;
  hasDashboard: boolean;
  // From the data side
  platformsActive30d: string[];   // ["Meta", "Apple Search Ads", ...]
  spendLast30d: number;
  lastActivity: string | null;
};

async function _queryActiveRoster(): Promise<RosterClient[]> {
  const bq = getBigQueryClient();

  // Step 1: roster, filtered to UA + active End_Date.
  // Step 2: spend rollup from union, last 30d.
  // Step 3: LEFT JOIN, prefer roster name as display, derive activity flags.
  const query = `
    WITH roster AS (
      SELECT
        REGEXP_REPLACE(LOWER(TRIM(Customer)), r'[^a-z0-9]+', '-') AS slug,
        ANY_VALUE(Customer)         AS display,
        ANY_VALUE(Team)             AS team,
        ANY_VALUE(Account_Manager)  AS account_manager,
        SAFE_CAST(ANY_VALUE(Monthly_Budget) AS FLOAT64) AS monthly_budget,
        ANY_VALUE(CAST(Start_Date AS STRING)) AS start_date,
        ANY_VALUE(CAST(End_Date   AS STRING)) AS end_date,
        ANY_VALUE(Dashboard_Link)   AS dashboard_link,
        LOGICAL_OR(Has_Dashboard)   AS has_dashboard
      FROM \`${serverEnv.BQ_PROJECT}.${serverEnv.BQ_DATASET}.pre_sales_updated_clients_tracking\`
      WHERE LOWER(Team) = 'ua'
        AND (End_Date IS NULL OR End_Date > CURRENT_DATE())
      GROUP BY slug
    ),
    base AS (
      ${unionAllManagementDashboard().replace("@from", "DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)").replace("@to", "CURRENT_DATE()")}
    ),
    activity AS (
      SELECT
        REGEXP_REPLACE(LOWER(TRIM(master_account)), r'[^a-z0-9]+', '-') AS slug,
        ARRAY_AGG(DISTINCT network IGNORE NULLS) AS platforms_active_30d,
        SUM(cost_usd) AS spend_last_30d,
        MAX(date)     AS last_activity
      FROM base
      GROUP BY slug
    )
    SELECT
      r.*,
      COALESCE(a.platforms_active_30d, []) AS platforms_active_30d,
      COALESCE(a.spend_last_30d, 0)        AS spend_last_30d,
      a.last_activity
    FROM roster r
    LEFT JOIN activity a USING (slug)
    ORDER BY a.spend_last_30d DESC NULLS LAST
  `;

  const [rows] = await bq.query({ query, location: "US" });
  return rows.map(rowToRosterClient);
}

export const queryActiveRoster = () =>
  unstable_cache(_queryActiveRoster, ["bq:roster"], {
    revalidate: 86_400,  // 24h, roster changes weekly at most
    tags: ["bq", "bq:roster"],
  })();

function rowToRosterClient(r: Record<string, unknown>): RosterClient {
  // ... defensive coercion as in bq-queries.ts
  return { /* ... */ } as RosterClient;
}
```

### Change 4: Add the management-dashboard query helpers

New file: `src/lib/bq-queries-md.ts` (md = management-dashboard). Mirrors `bq-queries.ts` for the union case. Same KPI / trend / channel-mix / campaigns / freshness shape so the UI does not change.

```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { getBigQueryClient } from "@/lib/bq";
import { unionAllManagementDashboard } from "@/lib/bq-union";
import type { KPIData, BQTrendPoint, ChannelBreakdown, CampaignRow } from "@/types/dashboard";

const BQ_LOCATION = "US";

async function _queryDashboardKPIs(client: string, from: string, to: string): Promise<KPIData> {
  // assertIsoDate as in existing bq-queries.ts
  const bq = getBigQueryClient();
  const query = `
    WITH base AS (${unionAllManagementDashboard()}),
    curr AS (
      SELECT
        SUM(cost_usd) AS spend,
        SUM(installs) AS installs,
        SAFE_DIVIDE(SUM(cost_usd), NULLIF(SUM(installs), 0))  AS cpi,
        SAFE_DIVIDE(SUM(revenue),  NULLIF(SUM(cost_usd), 0))  AS roas
      FROM base
      WHERE LOWER(TRIM(master_account)) = @client_key
    ),
    prev AS (
      -- same shape, prior period
      ...
    )
    SELECT c.*, /* deltas */ FROM curr c, prev p
  `;
  const [rows] = await bq.query({
    query,
    params: { from, to, client_key: client.toLowerCase().trim() },
    location: BQ_LOCATION,
  });
  // ... same row coercion as bq-queries.ts
}

// Export cached versions following the same pattern as bq-queries.ts:
//   queryDashboardKPIsMD, queryTrendMD, queryChannelMixMD, queryCampaignsMD
```

The two query modules (`bq-queries.ts` for agent strategy and `bq-queries-md.ts` for management-dashboard) share zero SQL but share the same return types. The route handlers pick one or the other based on `getSchemaForClient(client).strategy`.

### Change 5: Per-platform freshness

Replace the current Rivery-based freshness with a direct query against the four management_dashboard tables.

```ts
// Replaces _queryFreshness in bq-queries.ts (or moves to a shared bq-freshness.ts)

async function _queryFreshness(): Promise<FreshnessData> {
  const bq = getBigQueryClient();
  const query = `
    SELECT 'Meta'             AS platform, FORMAT_DATE('%Y-%m-%d', MAX(date)) AS latest FROM \`...management_dashboard_fb2\`
    UNION ALL SELECT 'Meta iOS14',         FORMAT_DATE('%Y-%m-%d', MAX(date)) FROM \`...management_dashboard_fb_ios14\`
    UNION ALL SELECT 'Apple Search Ads',   FORMAT_DATE('%Y-%m-%d', MAX(date)) FROM \`...management_dashboard_apple\`
    UNION ALL SELECT 'Google Ads',         FORMAT_DATE('%Y-%m-%d', MAX(date)) FROM \`...management_dashboard_google\`
  `;
  const [rows] = await bq.query({ query, location: BQ_LOCATION });
  // Return per-platform freshness array; UI shows the worst case as the
  // global "data through X" indicator and per-platform breakdown on hover.
}
```

The UI (`DataFreshnessBar`) extends to show per-platform breakdown. If any platform is more than 48 hours stale, that platform shows a yellow warning chip.

### Change 6: Route handler dispatch

The existing `/api/bq/dashboard-kpis` route currently calls `queryDashboardKPIs` from `bq-queries.ts`. Wrap it to dispatch on strategy:

```ts
// src/app/api/bq/dashboard-kpis/route.ts (or in _lib/handle.ts)

import { getSchemaForClient } from "@/lib/bq-security";
import { queryDashboardKPIs as queryAgentKPIs } from "@/lib/bq-queries";
import { queryDashboardKPIsMD } from "@/lib/bq-queries-md";

export async function GET(req: Request) {
  // ... param parsing
  const { strategy } = getSchemaForClient(client);
  const data =
    strategy === "management-dashboard"
      ? await queryDashboardKPIsMD(client, from, to)
      : strategy === "agent"
      ? await queryAgentKPIs(client, from, to)
      : await queryDashboardKPIs100Play(from, to);   // existing 100play path
  return Response.json(data);
}
```

The same dispatch pattern goes in trend, channel-mix, campaigns, data-bounds. Five route handlers each get a 4-line wrapper.

---

## UI integration

Almost zero UI changes are needed. The data layer keeps the same return types, so existing components (`KpiCard`, `TrendChart`, `ChannelMix`, `CampaignsTable`) just render whatever the API returns.

Three small UI changes:

### A. Client selector becomes roster-driven

`src/components/shell/ClientSelector.tsx` currently reads from a hardcoded list (or env). Switch to fetching `/api/bq/roster` and rendering the roster clients grouped by status. Display name from roster, slug for URL, last-30d spend as a secondary line.

New API route: `/api/bq/roster` calls `queryActiveRoster()`.

### B. Data freshness bar shows per-platform

`src/components/dashboard/DataFreshnessBar.tsx` extends to show four per-platform last-update timestamps. Worst case is the headline; expansion shows the breakdown.

### C. Apple unattributed footnote

A new tiny component shown on any view that includes Apple data. Single line: "8.6% of Apple spend is unattributed and excluded." Click to learn more (links to a docs page explaining the NULL master_account issue).

That is it for UI in Phase 1. The dashboard, campaigns, and freshness pages all keep their existing structure and just have richer data behind them.

---

## Build sequence

Numbered steps in dependency order. Each step is independently shippable. Estimated effort is for one engineer; cut in half if you pair.

### Step 1: Slug derivation, one-shot (30 min)

Run a single BQ query locally to get the canonical slug list from `pre_sales_updated_clients_tracking`:

```sql
SELECT DISTINCT
  REGEXP_REPLACE(LOWER(TRIM(Customer)), r'[^a-z0-9]+', '-') AS slug,
  Customer
FROM `yellowhead-visionbi-rivery.yellowhead_prod.pre_sales_updated_clients_tracking`
WHERE LOWER(Team) = 'ua'
  AND (End_Date IS NULL OR End_Date > CURRENT_DATE())
ORDER BY slug
```

Eyeball the output. Confirm the Team values (might be 'UA', 'User Acquisition', 'ua', etc.; adjust the WHERE accordingly). Confirm the active client list matches the 8 we saw in the discovery. If `pre_sales_updated_clients_tracking` Team values are inconsistent or missing, fall back to filtering by spend recency from the management_dashboard union (the 8 clients the discovery already identified).

**Commit:** `docs/data/active_clients.csv` capturing the slug + display pairs as our reference.

### Step 2: Service account + env (1 hour)

Create `lumen-app` service account in GCP. Grant `roles/bigquery.dataViewer` on `yellowhead_prod` dataset and `roles/bigquery.jobUser` on the project. Download JSON key, base64 it, set `GOOGLE_APPLICATION_CREDENTIALS_JSON` in `.env.local` and Vercel.

Update `ALLOWED_CLIENTS` env var to include the slugs from Step 1 plus `globalcomix,playw3,100play`.

**Smoke test:** existing dashboard for GlobalComix still works (proves new service account can read existing tables).

### Step 3: Add management-dashboard strategy (2 hours)

Code change 1 above. Add `"management-dashboard"` to `QueryStrategy`, define `MANAGEMENT_DASHBOARD_SCHEMA`, update `getSchemaForClient` to default to it for any allowlisted client without an explicit override.

**Smoke test:** unit test that `getSchemaForClient("smart-sleep-coach")` returns the new strategy.

### Step 4: Build the union helper (1 hour)

Code change 2 above. New file `src/lib/bq-union.ts`. Pure SQL builder, no side effects, easy to test.

**Smoke test:** the function returns valid SQL that can be `bq query --dry_run`'d without error.

### Step 5: Build the management-dashboard query module (4 hours)

Code change 4 above. New file `src/lib/bq-queries-md.ts`. Implement `_queryDashboardKPIs`, `_queryTrend`, `_queryChannelMix`, `_queryCampaigns`, `_queryDataBounds` for the union case. Use the same row coercion helpers as `bq-queries.ts` (extract them to `src/lib/bq-coerce.ts` if you want to avoid duplication; do not block on this refactor).

**Smoke tests:**
- `queryDashboardKPIsMD("smart-sleep-coach", "2026-04-11", "2026-05-11")` returns reasonable spend/installs/cpi/roas numbers.
- `queryTrendMD` returns 30 daily rows.
- `queryCampaignsMD` returns the top campaigns with non-zero spend.

### Step 6: Roster query + API route (3 hours)

Code change 3 above. New file `src/lib/bq-roster.ts`, new route `/api/bq/roster`.

**Smoke test:** `curl /api/bq/roster` returns the active UA clients with metadata and spend rollup. Number of clients matches Step 1.

### Step 7: Route handler dispatch (2 hours)

Code change 6 above. Update each of the existing `/api/bq/*` routes to dispatch on `getSchemaForClient(client).strategy`. Add the three branches (`management-dashboard`, `agent`, `lumen-union`).

**Smoke test:** existing GlobalComix dashboard still loads; new Smart Sleep Coach dashboard loads.

### Step 8: Per-platform freshness (2 hours)

Code change 5 above. Replace `_queryFreshness` body. UI extension in `DataFreshnessBar` to show per-platform breakdown.

**Smoke test:** freshness bar shows four platforms, each with a date.

### Step 9: Roster-driven client selector (3 hours)

UI change A above. `ClientSelector` fetches `/api/bq/roster`, renders the list grouped by team (single group for Phase 1), with display name + spend recency. Selecting a client navigates to `/dashboard?client=<slug>`.

**Smoke test:** click through 3 different clients, confirm each loads their data.

### Step 10: Apple unattributed footnote (1 hour)

UI change C above. Small component, derives the percentage from the difference between `SUM(cost_usd)` filtered vs unfiltered. Could be done with a separate small query, or by including the unattributed total in the channel-mix query result.

**Smoke test:** Smart Sleep Coach (multi-platform incl. Apple) shows the footnote with a non-zero percentage.

### Step 11: Smoke pilot — Smart Sleep Coach end to end (1 hour)

Walk through the full flow as a fresh user:

1. Open `/dashboard?client=smart-sleep-coach&from=2026-04-11&to=2026-05-11`.
2. Verify KPI tiles show real numbers, deltas work, trend chart renders.
3. Open `/campaigns?client=smart-sleep-coach`. Verify campaign rows.
4. Switch to `keno` (multi-platform) via the client selector. Verify everything reloads.
5. Switch to `stardust-casino` (Google-only). Verify Apple/Meta sections show zero/empty gracefully.
6. Cross-check totals against your local BQ console for the same date window.

### Step 12: Cut over (30 min)

Update CLAUDE.md to reflect: the active client universe is now driven by the roster, not the env allowlist. Update any hardcoded client references in docs. Tag the release.

---

## Smoke test summary

The end-state Phase 1 smoke validates these specific assertions:

1. Roster query returns 8 UA-active clients (or the actual count matching the data).
2. Smart Sleep Coach dashboard shows non-zero spend and installs for the trailing 30 days, with both Meta and Apple represented in channel mix.
3. Stardust Casino dashboard shows non-zero Google spend and zero on the other three platforms (no error, just empty).
4. Keno dashboard shows non-zero on Meta and Meta iOS14, zero on Apple and Google.
5. Period-over-period delta on KPI tiles works (compare a 30-day window vs the prior 30 days).
6. Campaign table for any active client shows campaigns with the expected naming convention from the underlying tables.
7. Per-platform freshness shows all 4 platforms within 24 hours.
8. Apple footnote shows a percentage between 1% and 20% (sanity range).
9. GlobalComix dashboard still works (legacy `agent` strategy not broken).
10. 100play dashboard still works (legacy `lumen-union` strategy not broken).

If 7 of 10 pass, ship. If fewer than 7, fix before shipping.

---

## What is deliberately out of Phase 1

- Superbloom Games clients via `yh_singular` + `pw_yh_cohort_*`. Phase 1.5.
- TikTok and LinkedIn data. Tables are >15 months stale; not Lumen's job to wait for the upstream fix.
- The Feed page wired to `ml_superbloom_*`. Defer.
- Reports / sharing / export. Defer.
- Ask page deep-tier (NL queries against `dwh_*` and `uni_*`). Phase 2.
- Cross-team views (Organic, Creative, CSM). Phase 2 minimum, depends on data sourcing.
- The eventual `lumen.fact_daily` BQ-side view. Add only if the TypeScript union becomes a maintenance burden.

---

## Risks and mitigations

**Risk:** BI silently renames a column in `management_dashboard_*` and Lumen breaks.
**Mitigation:** the union helper interpolates explicit column names. Fail-fast errors on cold start (each query module imports the schema and the BQ SDK validates on first call). Run a daily synthetic query (could be a cron job or a Vercel cron) that hits every Lumen route and alerts on failure.

**Risk:** BI deprecates the 4 tables in favor of `dwh_management_dashboard_new`.
**Mitigation:** the union helper is one file and one place. Migration is a 30-minute change, not an architecture rewrite.

**Risk:** A roster Customer name changes casing and breaks the slug.
**Mitigation:** slug is derived case-insensitively. Display name comes from the roster. The cache key is the slug, so a casing change does not invalidate cached data.

**Risk:** Cost spikes from naive query patterns.
**Mitigation:** every query has explicit date filters; tables are small (~110 MB for the full union); cache TTL of 30 minutes per (client, window) means a typical user generates <50 queries/day. Add a hard `maximumBytesBilled` parameter to BQ jobs (1 GB) so a runaway query fails fast rather than running up cost.

**Risk:** A user picks a date range with no data and the dashboard shows zeros that look like a bug.
**Mitigation:** the existing `data-bounds` query already handles this. Auto-snap to the latest available window. Show a banner if the requested window is outside the data range.

---

## Done means

A new yellowHEAD UA team member can sign in to Lumen, see all currently active UA clients in the picker, drill into Smart Sleep Coach or Keno or Stardust Casino, see real spend / installs / CPI / ROAS for the trailing 30 days, see real campaigns sorted by spend, see when each platform's data was last updated, and trust that the numbers are accurate to within whatever the upstream pipeline reports.

That is shippable Phase 1. Estimated 18-22 hours of focused engineering work, in 11 numbered steps, with the existing scaffold doing most of the heavy lifting.
