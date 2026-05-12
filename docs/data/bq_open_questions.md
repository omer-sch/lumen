# Open questions for the BI team

**Captured:** 2026-05-11 across Pass 1 (morning) and Pass 2 (afternoon) of the BigQuery discovery for Lumen.
**Caller:** `omers@yellowhead.com` (read-only).
**Companion doc:** `docs/data/bq_view_plan.md`. Every question here ties back to a specific section there and to one of the JSON dumps in `tmp/bq-discovery/`.

This doc consolidates the open questions surfaced during discovery. They are grouped by urgency relative to Lumen Phase 1 (UA-only). Each question is framed as: what we found, what choice it forces, what we recommend, what would unblock it.

---

## Tier 1: blocks Phase 1 if not answered

These need an answer before Lumen ships its first end-to-end view, because they decide which tables Lumen reads and which clients it covers.

### Q-1. Should Lumen read `management_dashboard_<platform>` or the newer `dwh_management_dashboard_new`?

**What we found.** Pass 2 surfaced `dwh_management_dashboard_new` (3.8M rows, 2017 to 2026, refreshed today) and `dwh_management_dashboard_new_with_lower_funnel` (894K rows). Both have `master_account` and `campaign_id`. The "new" suffix suggests they are the BI team's replacement for the per-platform `management_dashboard_<platform>` six-table family. If yes, Lumen should target the new layer instead of writing the union over six legacy tables.

**The choice.** Lock in the six-table union now and migrate later, or wait for clarity and build against the new layer from the start.

**Recommendation.** Lock in the six-table union for Phase 1 (cheap to migrate; the schemas are already identical). Ask BI to confirm before Phase 2.

**Unblock.** Ten-minute conversation with whoever owns the BI ETL.

### Q-2. Should GlobalComix and Playw3 be migrated into `management_dashboard_*`, or do they stay on the `v_agent_*` legacy path forever?

**What we found.** GlobalComix and Playw3 are the only two clients Lumen currently serves, and neither is in the `management_dashboard_*` family. `v_agent_globalcomix` is 5+ weeks stale (last data 2026-04-07). `v_playw3_agent` is 7 weeks stale (last data 2026-03-24, partly because Playw3 churned). Plan §3 and §1d.

**The choice.** Backfill the two clients into `management_dashboard_*` and consolidate, or accept that Lumen will run two parallel query strategies (`agent` and `management-dashboard`) in production indefinitely.

**Recommendation.** Backfill if and only if those clients remain active customers. Otherwise retire them from Lumen.

**Unblock.** Decision from sales / CSM on client status, plus BI willing to backfill.

### Q-3. What is the fix for `master_account = NULL` rows in `management_dashboard_apple`?

**What we found.** 51,329 rows ($554K of spend) in `management_dashboard_apple` have `master_account IS NULL`. They cannot be attributed in any cross-client Lumen view. Plan §2a, §4 View 3.

**The choice.** Apple ETL needs a backfill or a join correction. Lumen cannot paper over this without losing data.

**Recommendation.** Ask BI to fix or document. Lumen filters them out with a banner until then.

**Unblock.** BI investigation.

### Q-4. Should the Superbloom Games / Pocket Worlds clients be in Lumen at all?

**What we found.** Superbloom Venue, Pocket Worlds Highrise, Obsidian Knight, Kingdom Maker, Mundo Slots are not in `management_dashboard_*`. They live in `yh_singular` (5.7 TB total, modified today) plus `pw_yh_cohort_aggregated_stats_google` (1.4 GB, LINKED Analytics Hub dataset) plus a long tail of per-client `dwh_*` tables. The data shape is richer than `management_dashboard_*` (first / last / hybrid attribution, cohort_age, sub-campaign and creative grain). Plan Appendix E.2.

**The choice.** Product question. Pick one of three:
1. Out of scope. Lumen does not surface these clients in Phase 1.
2. Best-effort. Lumen reads the cohort table as a degraded version of the management_dashboard shape.
3. First-class. Lumen has a separate query strategy for the Singular / Pocket Worlds branch with richer drill-downs.

**Recommendation.** Option 1 for Phase 1. Capture in the product backlog as a known gap to revisit in Phase 2.

**Unblock.** Omer decides.

### Q-5. Which audit-log principal should Lumen's production identity use, and can we filter it cleanly later?

**What we found.** Looker Studio does not appear in the 7-day audit log under any obvious identifier. `developer@yellowhead.pro` runs 161,460 jobs in 7 days, dominating the warehouse. If Looker uses that identity too, Lumen's traffic will be invisible alongside it. Plan §7a.

**The choice.** Use a dedicated service account for Lumen so its traffic is distinguishable.

**Recommendation.** Provision `lumen-app@<project>.iam.gserviceaccount.com` with READER on `yellowhead_prod` only. Lumen reads through that identity. Ops dashboards filter on it.

**Unblock.** Ask IT for the service account and a small role grant.

---

## Tier 2: matters for product decisions, not for shipping the first view

### Q-6. Who owns the `ml_superbloom_*` and `metalstorm_*` anomaly pipelines, and can Lumen build on them?

**What we found.** Two clusters of anomaly-detection tables exist in `yellowhead_prod`: `ml_superbloom_*` (6 tables, Dec 2025) and `metalstorm_*` (8 tables, Oct 2025). Shape: daily series, features overall, incident drilldown, breakdown bucket map. This is exactly the kind of artifact Lumen's Feed and AI-Mode features would produce. Plan §1e.

**The choice.** Coordinate with whoever built it, or reinvent.

**Recommendation.** Find the owner. Reuse the pattern if possible, the shape if not.

**Unblock.** Internal: who built `ml_superbloom_*` in December 2025?

### Q-7. Should Lumen read the client roster from `pre_sales_updated_clients_tracking` instead of deriving it from `management_dashboard_*` data?

**What we found.** Phase 1 said "no client master table exists, Lumen owns a static vertical mapping." Pass 2 found `pre_sales_updated_clients_tracking` (511 rows, refreshed daily, columns include Team, Customer, Title, Account_ID, Monthly_Budget, Account_Manager, Has_Dashboard, Dashboard_Link). This is the sales-side ground truth. Plan §3 (was §3 in Pass 1, now corrected by §1c.5 and Appendix E).

**The choice.** Lumen treats it as the authoritative roster, with `management_dashboard_*` providing the activity stream. Or Lumen continues to derive the roster from data.

**Recommendation.** Switch to `pre_sales_updated_clients_tracking` as the roster. Use `management_dashboard_*` only for performance numbers.

**Unblock.** Confirm with BI that the table is canonical and refreshed reliably. The `update_date` and `max_update_date` columns suggest it is, but we have not yet verified the refresh cadence.

### Q-8. Why is `management_dashboard_tiktok` broken since 2025-01-30 if the upstream `dwh_tik_tok_*` data is fresh?

**What we found.** TikTok ODS landing is healthy (125 live `ods_tik_tok_*` tables, modified today). The per-client `dwh_tik_tok_*` tables are fresh. `dwh_tik_tok` (cross-client) is fresh through today. But `management_dashboard_tiktok` last received a row on 2025-01-30, over 15 months ago. The aggregation step is broken. Plan §1d, §2a.

**The choice.** Fix the aggregation, retire TikTok from `management_dashboard_*`, or replace the layer entirely.

**Recommendation.** Fix or retire. Lumen hides TikTok in Phase 1 either way.

**Unblock.** BI fixes the broken aggregation step (whatever it is).

### Q-9. What's the freshness signal Lumen should use for the data-freshness banner?

**What we found.** `rivery_activity_anlytics.rivery_activities` has per-run logs with `status`, `end_date_utc`, `source_name`, `target_name`. `river_level_activities` has per-river daily aggregates with `last_run`. `v_rivery_activity_check` is a view we have not inspected the DDL of. Plan Appendix E.1.

**The choice.** Per-run latest succeeded vs. per-river daily watermark vs. a Rivery-provided view.

**Recommendation.** Use the view if BI tells us it is reliable. Otherwise query `rivery_activities WHERE status='succeeded' ORDER BY end_date_utc DESC LIMIT 1` per `target_name`.

**Unblock.** Ask Gabriel (owner of the dataset) which signal he trusts.

### Q-10. Why is `developer@yellowhead.pro` running 23,000 queries per day, and is any of that ad-hoc work?

**What we found.** This single identity ran 161,460 jobs in 7 days, 32.6 TB scanned. If all of it is automated ETL, it is fine. If any of it is named humans logging in as a shared role account, that is a security and audit problem. Plan §7b.

**The choice.** Identity hygiene investigation.

**Recommendation.** BI should confirm `developer@yellowhead.pro` is automation-only, not a shared password.

**Unblock.** BI investigation.

---

## Tier 3: nice to know, not urgent

### Q-11. Why does `vantor_1@hotmail.com` have WRITER on `yellowhead_temp`?

A personal Hotmail address with write access to a prod project dataset. Almost certainly a stale grant. Plan §D.1.

### Q-12. What is the canonical source of the 12 EXTERNAL Google Sheets that gate `ods_*` and `pre_*` tables?

`ods_fb2_gaming_kpi_mapping`, `bs_lead_campaign_ua_yh`, `ods_map_fb2_power_life_daily_purchase`, etc. all read from Google Sheets. If anyone edits a wrong cell, downstream tables corrupt silently. Who owns each sheet, who has edit access, and is there a contract or review process? Plan §1c.6.

### Q-13. Will the 86 `management_dashboard_*` per-client variants ever be cleaned up?

84 are duplicates or empty, 2 carry unique UAC Pampers data. The Pampers ones can be retired if Pampers does not return. The 7 empty tables (`fb2_aaptive`, `fb2_just_spices`, `google_smart_sleep_coach`, three more) suggest stale BI config that nobody cleans up. Plan §1c.8.

### Q-14. `inabit_daily_report` is empty but touched daily. Broken pipeline or by design?

It is the only "live" object among the 106 truly unmatched in prod. 0 rows. Modified today. Either a scheduled query is producing no output, or someone forgot the table existed. Plan §1e.

### Q-15. What does `pw_yh_cohort_aggregated_stats_google` source from (project id `459308824437`), and is the subscription stable?

Linked Analytics Hub dataset, 211 columns of rich attribution data for Superbloom apps. We do not know who the external publisher is. If they unlink (as the Metica / Pocket Worlds receipts publisher already did with `receipts_users`), the data goes dark. Plan Appendix D.1 and E.2.

### Q-16. What is `yellowhead_bkp_us_1m` / `_us_6m` for?

Live rolling 1-month and 6-month samples of certain `dwh_*` and `pre_*` tables. Disaster-recovery, performance-test fixture, or analyst sandbox? Plan Appendix E.5.

### Q-17. Are stored procedures or scheduled queries doing work we cannot see?

`INFORMATION_SCHEMA.ROUTINES` is empty across all 13 datasets, and `bq ls --transfer_config` is denied. So either there are no scheduled queries (unlikely, given how much daily refresh happens) or the BI Data Transfer Service does it all and we cannot see the config. Plan Appendix D.3.

### Q-18. Are there authorized views Lumen needs to know about?

`INFORMATION_SCHEMA.OBJECT_PRIVILEGES` cannot be enumerated globally (BQ requires literal `WHERE object_name=` in every query). We have no inventory of which views grant access across datasets. Plan Appendix D.2.

---

## Resolved during discovery (no action needed)

- **What is `receipts_users` and why is it unlinked?** Confirmed Analytics Hub subscription to an external publisher (Pocket Worlds × Metica personalization listing in project 459308824437) that has been unlinked by the source publisher. Stale subscription, not Lumen-relevant. Plan §1a.
- **What is `seo_screamingfrog`?** Confirmed single ScreamingFrog SEO crawl of yellowHEAD's own marketing site (yellowhead.com), Dec 2025. Not Lumen-relevant. Plan §1a and Appendix B.
- **Does Lumen need its own dim_clients table?** No, three exist: `pre_sales_updated_clients_tracking`, `bs_map_account_network_attribution_id`, `map_snap_ctool_master_account`. Plan §1c.5.
