# Lumen — what the BQ discovery means for the product

**Author:** product-layer synthesis on top of Pass 1 + Pass 2 BigQuery discovery
**Date:** 2026-05-11
**Companion to:** `docs/data/bq_view_plan.md` (data layer), `docs/data/bq_open_questions.md` (BI questions)
**Audience:** Omer (product owner), Gal and yellowHEAD leadership, anyone making Lumen scope decisions

This document is the product-side reading of the discovery. The data plan answers "what is in the warehouse and how do we read it." This doc answers "what does what we found mean for the product we are building, and what decisions does it force us to make."

Nothing in this document is a data finding the data plan does not already cover. Every claim here is a translation of a data finding into a product implication or a decision. If you want the evidence, follow the section reference back to the data plan.

---

## The three things Lumen is, after discovery

Pass 1 framed Lumen as "a better Looker Studio." Pass 2 broke that frame in three places. The product story needs to be rewritten before any of these become external messaging.

### 1. Lumen is not replacing Looker. It is giving the analyst team a tool they do not currently have.

The audit log shows zero Looker queries against the warehouse under any identifier we can verify in 7 days of data. Either Looker is not actively used, or it queries under `developer@yellowhead.pro` mixed in with ETL traffic and we cannot distinguish it. Either way, "match Looker so users can switch" is not a defensible Phase 1 framing.

What the audit log does show is three named humans actively querying the warehouse: Omer (you, during this discovery), Ramina Lischynska, and someone called Hannap (probably Hannah Pak). Those two analysts ran 188 and 168 queries respectively in 7 days. That is the actual daily-work pain Lumen is supposed to solve.

This is a stronger product story, not a weaker one. "We built a tool the BI team has been wanting" beats "we built a slightly better version of what nobody is using." But it changes the pitch, the personas, the pilot users, and the success metric.

### 2. Lumen is the first place at yellowHEAD where cross-team data could be first-class.

The warehouse is deeply UA-centric. Organic, Creative, and CSM have effectively no client data in BigQuery. The 30-second framing: AppTweak data exists for some clients but is mostly stale and never transformed; SEO is a single crawl of yellowHEAD's own site; Creative metadata is buried inside per-platform UA tables with no first-class creative object; CSM has no data in BQ at all beyond the roster pointing at Looker dashboards.

CLAUDE.md describes Lumen's longer-term vision as "UA, Organic, Creative, and CSM in one place." The discovery proves that today, three of those four teams have nothing to put in. So the long-term vision is not "extend the UI to other teams." It is "be the place where cross-team data becomes first-class at yellowHEAD for the first time."

This is a much more defensible long-term moat than "better dashboards." It is also a much bigger commitment, because it implies a multi-quarter BI investment, not just product work.

### 3. Lumen is partly a productization of work that already exists internally.

The `ml_superbloom_*` and `metalstorm_*` table clusters are a working anomaly-detection pipeline for two specific clients. Raw UA feed, daily fact tables, feature tables, financial incident detections, drilldown views. Producing 1,199 detected incidents on Superbloom alone over five months. Someone inside yellowHEAD has already built the Feed page's underlying intelligence layer for two clients.

The Feed page in Lumen should not be designed from scratch. Step zero is finding who built `ml_superbloom_*` and `metalstorm_*`, having a 30-minute call, and learning what works, what does not, and what they wish they could extend. The naming pattern suggests this was built bespoke by a single person or small team with ML experience. That person is potentially Lumen's highest-leverage internal ally, and they have already done the hard part. We should bring them into the Lumen vision early, not show up later asking permission to use their work.

---

## Architecture deltas to the Lumen plan

These are concrete changes to the existing plan in `bq_view_plan.md`. Most are derivable from the data findings, but they have not yet been threaded back into the product architecture.

### Three pipeline shapes, not one

The plan currently treats `management_dashboard_*` as the single source with `v_agent_*` as a legacy exception. Pass 2 confirmed three live pipeline shapes for active clients:

- **Shape A**: `management_dashboard_*` family. Roughly 8 active clients, daily refresh via BQ Data Transfer Service. The simple case.
- **Shape B**: `v_agent_*` plus per-client `dwh_*`. GlobalComix and Playw3, both stale. Already in scope of the existing plan.
- **Shape C**: `yh_singular` events plus `pw_yh_cohort_*` attribution. Superbloom Games family (Venue, aTable, Highrise, Obsidian Knight, Kingdom Maker, Mundo Slots). Multi-terabyte, live, written by external service accounts.

The Lumen data layer is therefore a router across three sources, not a single union. The §5b "Lumen-owned view" idea still holds but the view body is more complex than Pass 1 assumed.

### Client identity layer rewritten around the sales roster

Pass 1 said "no client master exists, derive from `master_account` aggregation." Pass 2 found `pre_sales_updated_clients_tracking` (511 rows, columns for Team, Customer, Title, Account_ID, Monthly_Budget, Start_Date, End_Date, Account_Manager, Dashboard_Link, Has_Dashboard).

The §3 identity strategy in the data plan should pivot from "derive list from data" to "roster is authoritative, spend signals activity." Concrete wins:

- Team membership (UA / Organic / Creative / CSM) becomes a join, not a CLAUDE.md hard-code.
- Vertical tagging is no longer a Lumen-owned static config.
- Monthly_Budget unlocks a benchmark column the AI insights layer was missing.
- Account_Manager unlocks "your clients" filtering per logged-in user.
- Dashboard_Link is the bridge to existing Looker views, useful as a fallback during the switch period.
- End_Date automates active/churned classification.

### Ask page needs two-tier routing

The audit log shows analysts work in per-client `dwh_*_<client>_adjust` and `uni_*` tables, not in `management_dashboard_*`. Top 30 most-read tables in 7 days include zero `management_dashboard_*` entries.

The implication: shallow questions (overview, KPI tiles, simple time series) can hit the dashboard layer. Deep questions (adset, ad, geo, placement, creative breakdown) need to hit `dwh_*` and `uni_*`. The Ask page is a routing layer, not a single backend. This was not in the Pass 1 plan.

### Freshness model has two telemetry sources

Pass 2 confirmed that `management_dashboard_*` is refreshed by BigQuery Data Transfer Service, not Rivery. Rivery handles `ods_*` landing. So the freshness banner has two layers:

- Raw data freshness: from `rivery_activity_anlytics.rivery_activities`. Tells the user "data through date X" for each platform.
- Aggregate freshness: from BQ audit log scanning Data Transfer Service runs. Tells the user "this dashboard view was refreshed at Y."

Building only one of them produces a half-truth banner.

### Lumen service account must be identifiable in audit logs

The audit log analysis was hamstrung because we cannot distinguish Looker traffic from ETL traffic. Lumen must not repeat that mistake. The Lumen-Phase-1 service account should be named explicitly (`lumen-app@yellowhead.com` or similar) so future audits can answer "how often is Lumen actually used, by whom, and at what cost." This is part of the BI ask to Gabby.

---

## Who actually uses the warehouse today

This is the most important user-research finding of the discovery, and it should reset Phase 1 user research.

CLAUDE.md sketches four personas: UA analyst, ASO/SEO specialist, Creative analyst, CSM. These are reasonable hypotheses but they remain hypotheses. The audit log says the actual humans querying the warehouse in 7 days are:

- **Ramina Lischynska**, BI developer. 188 queries. Already a known contact.
- **Hannap (probably Hannah Pak)**, identity unconfirmed but presumed analyst. 168 queries.
- **Omer**, you, 2,172 queries during this discovery.

Plus six service accounts running automation. No other named humans.

Two implications:

1. **Phase 1 pilot users are Ramina and Hannap, not the abstract CLAUDE.md personas.** If Lumen delights these two specifically, you have covered most of the actual human warehouse consumption today. If they actively resist, you have a problem regardless of what the personas would predict.

2. **The user base to win over is small.** This is good (you can do real user research with two people in two weeks) and bad (small user base means small switching pressure, no urgency unless you create it). Plan a real interview with Ramina and Hannap before any UI work. Confirm or refute the CLAUDE.md persona descriptions against what they actually do.

The CLAUDE.md personas remain useful for **scope expansion thinking** (who else should Lumen serve once UA is solid). They should not drive **Phase 1 design**.

---

## The Gal conversation

Four decisions to force in order. None of them are "should we do Lumen." All of them are "given the discovery, what shape is Lumen actually taking."

### 1. Is cross-team Lumen a real product goal, or is UA-only the actual long-term end state?

The warehouse only contains usable client data for UA. Adding Organic, Creative, or CSM is not "extend the UI" work. It is "first source the data, then build the UI" work. Months, not weeks. Most leaders never face this choice cleanly because the data investment is invisible. Make it visible.

Either answer is legitimate. UA-only forever is a tighter product, easier to ship, easier to maintain. Cross-team is the larger ambition but requires multi-quarter BI investment. Do not let Gal punt this to "we will figure it out later." The capacity question is the answer.

### 2. If cross-team is the goal, who owns sourcing the missing data?

Three options worth naming so he picks:

- **BI team adds it to their roadmap.** Probably the default. They will push back on capacity. Realistic.
- **Each team lead owns sourcing their own team's data.** More distributed, more political, less coordinated.
- **Lumen advocates for and partly drives the data work itself.** Strongest control, biggest organizational ask.

The right answer depends on where Gal thinks Lumen should sit organizationally.

### 3. Is partnering with the existing `ml_superbloom_*` and `metalstorm_*` work the right move?

A yellowHEAD person or team has already built per-client anomaly detection for two clients. The Feed page in Lumen could either replace that work, extend it, or sit in parallel. None of those are clearly right without a conversation with the owner. Gal can either (a) point you at that person directly, or (b) authorize you to find and talk to them, or (c) defer the conversation until Phase 2. (c) is the wrong answer because the Feed page is in Phase 1 scope.

### 4. Is the "Lumen replaces Looker" framing what we want to take to clients?

The audit log says Looker is not heavily used. The internal positioning is "Lumen is the tool analysts actually need." That is a stronger pitch than "we are migrating away from Looker." But it changes what gets said externally, including to clients who see the Looker dashboards today. Gal should consciously pick the framing before sales/marketing starts using it.

One framing line worth offering: "Looker Studio gave us four separate dashboards because that's all the data could support. Lumen could give us one workspace, but only if we decide cross-team data is worth investing in. I want to check that's the direction before we bake it into the Phase 2 plan."

---

## Open product decisions (not BI questions)

The data plan's open-questions doc handles questions that need BI to answer. The questions below need product or leadership to answer. They are not in the data plan.

### Historical client visibility

The warehouse contains years of agency history. Lumen's client switcher could show only currently-active clients (per the roster's End_Date), or it could support retrospective analysis on churned clients. Both are defensible.

- **Active-only.** Cleaner UX. Less cognitive load. Aligns with the "tool for daily work" framing.
- **Active + historical.** Supports retrospectives, win/loss analysis, "what happened with Cyberghost in 2023." Heavier UX but real analyst value.

Recommend active-only for Phase 1 with a clear path to add historical filter in Phase 2.

### Cohort attribution model UI scope

The `pw_yh_cohort_*` table has rich first/last/hybrid attribution flags and `cohort_age`, which `management_dashboard_*` does not. Surfacing attribution-model toggles is a clear "we win versus Looker" capability. But this data only exists for Superbloom clients today.

Either Lumen ships the toggle as a per-client capability (UI handles "not applicable" gracefully), or it ships only when the data is universal (i.e. once the dashboard layer adopts cohort attribution).

Recommend defer to Phase 2 to avoid a UI that works for two clients and silently breaks for others.

### Superbloom routing decision

Superbloom Games clients (Venue, aTable, Highrise, Obsidian Knight, Kingdom Maker, Mundo Slots) live on Shape C (`yh_singular` + `pw_yh_cohort_*`), not on `management_dashboard_*`. Phase 1 scope can either:

- **Include Superbloom.** Forces the routing layer architecture into Phase 1. Adds real implementation cost.
- **Exclude Superbloom for Phase 1.** Tighter ship. But if Superbloom is actively serviced by the UA team daily, excluding it makes Lumen visibly incomplete to the team.

Need a definitive answer from the UA team: who works on Superbloom, and would they switch to Lumen if Superbloom were missing? One DM to the UA lead resolves this.

### ml_superbloom partnership shape

Once the owner of `ml_superbloom_*` and `metalstorm_*` is identified, Lumen has three options:

- **Adopt their pipeline.** Lumen reads from their tables, surfaces their detections in the Feed UI. Lightest engineering, requires partnership trust.
- **Generalize their approach.** Take their feature engineering and incident detection logic, apply it across all active clients. Heavier engineering, broader product capability.
- **Build parallel.** Roll our own. Worst option. Duplicates work and signals internal politics.

Recommend (a) for Phase 1 (ship faster, build the relationship), with explicit Phase 2 path to (b).

### Cross-team commitment timeline

Tied to the Gal conversation. If cross-team Lumen is a goal, when. End of 2026? End of 2027? Never publicly committed?

Recommend not committing a date publicly until BI capacity has been confirmed.

---

## Phase trajectory

A rough sketch of what the discovery implies the phasing looks like. Not a roadmap commitment, a thinking aid.

### Phase 1: UA only, four-platform union, two pilot users

Ship `management_dashboard_fb2` + `management_dashboard_fb_ios14` + `management_dashboard_apple` + `management_dashboard_google` unioned in a Lumen-owned data layer. Roster-joined for client metadata. TikTok and LinkedIn hidden behind a "data unavailable" banner. Pilot users are Ramina and Hannap. Feed page wired (if the owner of `ml_superbloom_*` is willing) to existing internal anomaly outputs for Superbloom and Metalstorm. Other Phase 1 active clients see "no anomalies detected yet" with a transparent explanation rather than a fake empty state.

Gates: BI confirms `dwh_management_dashboard_new` is not the canonical replacement (or, if it is, Lumen targets it instead). BI grants the dedicated Lumen service account. Ramina and Hannap commit to a 30-minute interview and ongoing feedback.

### Phase 2: Superbloom routing, TikTok fix, expansion

BI fixes TikTok. Lumen routes Superbloom clients through `yh_singular` plus `pw_yh_cohort_*`. Feed page generalizes the anomaly detection from the Superbloom/Metalstorm pilot to all active clients. Historical client visibility added as an opt-in filter. The "new" dashboard layer is adopted if BI has migrated.

### Phase 3: Cross-team data investment, AI knowledge layer

This is where the cross-team commitment from the Gal conversation lands. BI starts the multi-quarter investment to bring Organic, Creative, and CSM client data into BQ. Lumen begins indexing the `pre_v_*` business-logic views as inputs to the AI knowledge layer. NL queries against the unified working layer (`dwh_*` and `uni_*`) become first-class. The agency-wide cross-team workspace vision becomes real.

---

## What changed since CLAUDE.md was written

A short index of CLAUDE.md statements that should be revised in light of the discovery. None of these are wrong, all of them are imprecise.

- **"yellowHEAD currently uses Google Looker Studio."** Probably true but not actively. The actual working tool for analysts is ad-hoc BQ SQL.
- **"Rivery pulls data from all ad platforms."** Rivery handles raw landing (`ods_*`). The dashboard aggregation layer is refreshed by BigQuery Data Transfer Service, a different system.
- **"Looker Studio sits on top of that."** True structurally, but Looker is not the primary daily-work surface for the analysts who query the warehouse.
- **"Database: BigQuery (confirmed 2026-05-04)."** Correct, and now we have 1,205 lines of plan on top of it.
- **"Current scope is UA only."** Now justified by data, not just by user research.
- **The four personas** remain useful for scope expansion but the actual Phase 1 users are Ramina and Hannap.
- **"AI brain / knowledge layer"** has an unexpected foundation: 64 `pre_v_*` views encoding the agency's business logic in SQL, plus the `ml_superbloom_*` pattern as a template for ML feature pipelines.

A clean update to CLAUDE.md is worth doing once the Phase 1 plan is locked.

---

## Next moves

In rough priority order:

1. **Read this document and `docs/data/bq_open_questions.md` together.** They are the two halves of the same picture.
2. **Schedule the Gal conversation.** Four decisions, frame as above. Do not let it become a status update.
3. **DM Gabby with the BI batch:** vantor_1 Hotmail security finding, `dwh_management_dashboard_new` canonical question, `developer@yellowhead.pro` identity question, `lumen-app` service account ask, `roles/bigquery.metadataViewer` and `roles/iam.securityReviewer` for future audits.
4. **Find the owner of `ml_superbloom_*` and `metalstorm_*`.** One Slack message to BI gets the answer. Have a 30-minute call before designing the Feed page.
5. **Interview Ramina and Hannap.** They are your pilot users. Confirm or refute the CLAUDE.md persona descriptions. Understand what their day looks like. This is the user research Phase 1 needs.
6. **Update CLAUDE.md** to reflect the discovery findings. Roughly a half-day of revision.
7. **Then start building.**
