# Lumen test coverage matrix

> Captured 2026-05-12. Reflects state of `main` at `3bc7bd2`.
>
> Survey results:
>  - `npm run lint`: passes (2 unused-var warnings, see `bq-queries-100play.ts:235-236`).
>  - `npm run build`: passes.
>  - `npm run test:e2e`: 29 passed, 10 skipped, 21 did not run (separate
>    Playwright project: `chromium-authed` was not reached without a Clerk
>    test session). No spec is currently failing.

## Test levels

1. Frontend component + hook unit tests (Vitest + React Testing Library + jsdom).
2. Backend lib unit tests (Vitest, no network).
3. API route-handler tests (Vitest, importing handlers directly; all I/O mocked).
4. Security (Playwright E2E, extends the existing security suite).
5. UI bug catch + visual regression (Playwright `toHaveScreenshot`).

## Priority key

- **P0**: BigQuery, auth, security, or per-user resources (IDOR surfaces).
- **P1**: data formatting and shaping the dashboard depends on.
- **P2**: presentational components, surface polish, smoke.

---

## `src/lib/` (backend + shared)

| File | Current coverage | Proposed level | Priority | Notes |
| --- | --- | --- | --- | --- |
| `lib/bq-security.ts` | None | 2 | P0 | Allowlist guard + table mapping. Adversarial casing, whitespace, SQLi-shaped payloads. |
| `lib/bq.ts` | None | 2 | P0 | Singleton BQ client; mock `@google-cloud/bigquery`; assert credential parse failures throw. |
| `lib/bq-queries.ts` | None | 2 | P0 | Snapshot 6 SQL builders; parameterized cases; date guard; `toBounds` shape coercion. |
| `lib/bq-queries-100play.ts` | None | 2 | P0 | Same as above; verify spend-only schema, empty campaigns, single Meta row in channel-mix. |
| `lib/env.server.ts` | None | 2 | P0 | Required vars throw when missing; optional vars return ""; `isSupabaseConfigured` truth table. |
| `lib/db/client.ts` | None | 2 | P0 | `supabaseAdmin` throws on missing URL / key; singleton pinned to `globalThis`. |
| `lib/db/user.ts` | None | 2 | P0 | `getUserId` throws when no session and not preview; preview returns sentinel. |
| `lib/db/pins.ts` | None | 2 | P0 | Round-trip `listPinsForUser` → row shape; insert payload preserves `chart_config_json`. |
| `lib/db/agent-feedback.ts` | None | 2 | P0 | `kindToThumbs` / `thumbsToKind` mapping; agent join filter enforces agentId. |
| `lib/db/agents.ts` | None | 2 | P0 | TBD: review for query shape stability. |
| `lib/db/ask.ts` | None | 2 | P0 | TBD: review for query shape stability. |
| `lib/agents/identity.ts` | None | 2 | P0 | `getAgentIdentity` totality across `AgentId`; static map shape. |
| `lib/format.ts` | None | 2 | P1 | Currency + count + ratio + cpi. Edge cases: 0, negative, NaN, Infinity, very large. |
| `lib/ask/router.ts` | Partial (E2E `ask.spec.ts`) | 2 | P1 | 10+ NL prompts → expected intent (`tableAnswer`, `barAnswer`, `lineAnswer`, `kpiAnswer`). |
| `lib/ask/data.ts` | None | 2 | P2 | Deterministic mock dataset; `allRows()` stable. |
| `lib/reports/generate.ts` | Partial (E2E `reports.spec.ts`) | 2 | P1 | Section order, KPI rollups, channel rollup, never echoes a client name not in input. |
| `lib/reports/store.ts` | None | 2 | P2 | Save / list / delete in localStorage. |
| `lib/notifications/store.ts` | None | 2 + 1 | P1 | Hook test via `renderHook`: persistence, mark-read, mark-all, cross-tab `storage` event. |
| `lib/pins/store.ts` | Partial (E2E) | 2 + 1 | P1 | Optimistic add / remove; rollback semantics; MAX_PINS cap. |
| `lib/pins/types.ts` | N/A | (types only) | n/a | No runtime; covered by consumers. |
| `lib/filters/use-global-filters.ts` | Partial (E2E) | 1 | P1 | `resolveRange`, `previousWindow`, `windowDays` are pure: 2 tests. Hook itself needs jsdom + mocked `next/navigation`. |
| `lib/filters/use-dashboard-mode.ts` | None | 1 | P2 | Hook: read `?mode=ai` → AI mode; round-trip URL state. |
| `lib/dashboard/use-dashboard-data.ts` | Partial (E2E `bq-dashboard.spec.ts`) | 1 | P1 | renderHook with mocked fetch; loading / error / windowEmpty branches. |
| `lib/brand.ts` | None | 2 | P2 | Color constants; sanity tests only if helpers added. |
| `lib/utils.ts` | None | 2 | P2 | `cn()` deduplication + merge semantics. |
| `lib/env.client.ts` | None | 2 | P2 | Mirror of env.server for public-only vars. |
| `lib/mock/*` | N/A | (fixtures) | n/a | Only the deterministic shape matters; spot-check sums in `ask/data` tests. |

## `src/app/api/` (route handlers)

| Route | Current coverage | Proposed level | Priority | Notes |
| --- | --- | --- | --- | --- |
| `api/bq/_lib/handle.ts` | None | 2 | P0 | `requireParams` (missing, whitespace, normalized casing); `bqErrorResponse` (403/400/500 branching, never leaks BQ message). |
| `api/bq/dashboard-kpis/route.ts` | E2E (preview) | 3 | P0 | Happy + missing params + 400/403/500 mapping; cache-control hint. |
| `api/bq/trend/route.ts` | E2E (preview) | 3 | P0 | Same. |
| `api/bq/channel-mix/route.ts` | E2E (preview) | 3 | P0 | Same. |
| `api/bq/campaigns/route.ts` | E2E (preview) | 3 | P0 | Same. |
| `api/bq/data-bounds/route.ts` | E2E (preview) | 3 | P0 | Same. |
| `api/bq/freshness/route.ts` | E2E | 3 | P0 | Happy path; BQ throw → 500 without stack leak. |
| `api/bq/100play/*` | None | 3 | P0 | Same battery for the lumen-union variant. |
| `api/pins/route.ts` | None | 3 | P0 | GET 200 (with userId scope); POST schema; preview short-circuit. |
| `api/pins/[id]/route.ts` | None | 3 | P0 | DELETE scoped to user; IDOR: user A cannot delete user B. |
| `api/agents/[agentId]/memory/route.ts` | None | 3 | P0 | Unknown agent path; POST schema; IDOR: cross-user read is filtered server-side. |
| `api/agents/aria/generate/route.ts` | None | 3 | P1 | TBD (FAL key; mock the upstream client; assert auth gate). |
| `api/ask/history/route.ts` | None | 3 | P1 | TBD review. |

## `src/components/` (UI)

| Component | Current coverage | Proposed level | Priority | Notes |
| --- | --- | --- | --- | --- |
| `components/dashboard/KpiCard.tsx` | E2E smoke | 1 | P2 | Value + delta + direction; loading skeleton when value undefined. |
| `components/dashboard/TrendChart.tsx` | E2E | 1 | P2 | Series count given fixture; metric switcher updates active series. |
| `components/dashboard/ChannelMix.tsx` | E2E | 1 | P2 | Renders rows ordered by spend. |
| `components/dashboard/PinnedSection.tsx` | E2E | 1 | P2 | Empty state + pinned tile rendering. |
| `components/dashboard/AIModeView.tsx` | E2E | 1 | P2 | Mode toggle + rebuild behaviour. |
| `components/dashboard/DataFreshnessBar.tsx` | E2E | 1 | P2 | Color + label by `hoursAgo` thresholds. |
| `components/dashboard/DashboardView.tsx` | E2E | 1 | P2 | Composition only; covered by smoke + visual regression. |
| `components/campaigns/CampaignsTable.tsx` | E2E | 1 | P1 | Sort, filter by channel, empty state, large-dataset render. |
| `components/campaigns/CampaignsView.tsx` | E2E | 1 | P2 | Composition only. |
| `components/campaigns/CampaignProfile.tsx` | E2E | 1 | P2 | Renders one campaign payload. |
| `components/campaigns/RowSparkline.tsx` | E2E | 1 | P2 | SVG path generation for short / long inputs. |
| `components/ask/AnswerCard.tsx` | E2E | 1 | P1 | Renders narration, rationale, alternative; byline. |
| `components/ask/AskInput.tsx` | E2E | 1 | P2 | Submit + clear; disabled when empty. |
| `components/ask/AskWorkspace.tsx` | E2E | 1 | P2 | Composition only. |
| `components/ask/ThinkingState.tsx` | E2E | 1 | P2 | Animates while thinking; resolves on answer. |
| `components/feed/FeedCard.tsx` | E2E | 1 | P2 | Severity badge + delta tone. |
| `components/feed/FeedDetailPanel.tsx` | E2E | 1 | P2 | Renders supporting chart + action. |
| `components/feed/FeedView.tsx` | E2E | 1 | P2 | Composition only. |
| `components/reports/ReportDocument.tsx` | E2E | 1 | P1 | Renders five sections in order; editable text round-trips. |
| `components/reports/ReportsView.tsx` | E2E | 1 | P2 | Composition only. |
| `components/reports/EditableText.tsx` | E2E | 1 | P2 | Renders, saves, escape cancels. |
| `components/agents/AgentCard.tsx` | E2E | 1 | P2 | Renders identity. |
| `components/agents/AgentByline.tsx` | E2E | 1 | P2 | Renders identity + role. |
| `components/agents/AgentDetailPanel.tsx` | E2E `agents-memory.spec.ts` | 1 | P1 | Memory list, feedback save flow with mocked fetch. |
| `components/agents/AgentRunOutput.tsx` | E2E | 1 | P2 | TBD. |
| `components/agents/AgentsView.tsx` | E2E | 1 | P2 | Composition only. |
| `components/shell/TopBar.tsx` | E2E | 1 | P2 | Renders global filter, bell. |
| `components/shell/Sidebar.tsx` | E2E | 1 | P2 | Active route highlight. |
| `components/shell/ClientSelector.tsx` | E2E | 1 | P1 | Selection updates `?client=` in URL. |
| `components/shell/DateRangePicker.tsx` | E2E | 1 | P1 | Preset + custom range writes URL. |
| `components/shell/MobileNavToggle.tsx` | E2E | 1 | P2 | Open / close. |
| `components/shell/NotificationBell.tsx` | E2E | 1 | P2 | Badge count from hook. |
| `components/shell/NotificationItem.tsx` | E2E | 1 | P2 | Renders severity. |
| `components/shell/NotificationPanel.tsx` | E2E | 1 | P2 | Open / dismiss / mark all. |
| `components/auth/AuthShell.tsx` | E2E | 1 | P2 | Layout. |
| `components/analytics/PostHogProvider.tsx` | None | (skip) | n/a | Side-effect provider; covered by E2E. |
| `components/ui/*` (Card, GlassCard, GlassBulb, GlassIcon, LivePulse, SectionBreak, Skeleton, EmptyState, CountUpNumber) | None | 5 | P2 | Pure presentational; covered by visual regression rather than unit tests. |

## `src/app/(app)/` (pages)

| Page | Current coverage | Proposed level | Priority | Notes |
| --- | --- | --- | --- | --- |
| `(app)/layout.tsx` | E2E | 5 | P2 | Shell composition; visual regression. |
| `(app)/dashboard/page.tsx` | E2E | 5 | P1 | Visual regression desktop + mobile, dark + light. |
| `(app)/campaigns/page.tsx` | E2E | 5 | P1 | Same. |
| `(app)/campaigns/[id]/page.tsx` | E2E | 5 | P1 | Same. |
| `(app)/queries/page.tsx` | E2E | 5 | P1 | Same. |
| `(app)/reports/page.tsx` | E2E | 5 | P1 | Same. |
| `(app)/feed/page.tsx` | E2E | 5 | P1 | Same. |
| `(app)/knowledge/page.tsx` | E2E | 5 | P1 | Same. |
| `(app)/agents/page.tsx` | E2E `agents-ui.spec.ts` | 5 | P2 | Visual regression. |

---

## Plan of attack

1. Step 1: install Vitest + RTL; wire `vitest.config.ts`; setup file.
2. Step 2 (P0): all `lib/` P0 rows above except the route-handler ones.
3. Step 3 (P0): `_lib/handle.ts` + the 7 `/api/bq/*` agent-layer routes + 5 `/api/bq/100play/*` routes + pins routes + agents/memory route.
4. Step 4 (P1): hooks (`useGlobalFilters`, `useDashboardData`, `useNotifications`, `usePinnedTiles`) + the P1 components.
5. Step 5: extend security E2E (`bq-api-authz`, `bq-api-params`, `clickjacking`, `cookie-flags`; `rate-limit` as `test.skip` placeholder).
6. Step 6: visual regression project + page snapshots; capture UI bugs.
7. Step 7: spec maintenance only if Step 6 caused regressions.
8. Step 8: CI wiring.

## Active fixture clients

Per project memory and `bq-security.ts` allowlist contract: tests use only
`globalcomix`, `playw3`, and `100play`. `100play` is the canonical lumen-union
fixture; the other two cover the agent-strategy path.
