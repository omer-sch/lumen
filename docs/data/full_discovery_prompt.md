# Claude Code prompt: full BigQuery discovery for Lumen

Paste everything below into a fresh Claude Code session opened in the Lumen repo root. The prompt is self-contained.

---

## Mission

Complete the BigQuery discovery for the Lumen project. Every dataset, every prefix layer inside `yellowhead_prod`, and every project-level dimension must end the run with (a) a verdict, (b) raw evidence on disk, and (c) a paragraph in the updated plan doc. No more "counted but not opened." No more "noted, deferred."

A previous Phase 1 discovery already ran (covered the `management_dashboard_*` family in depth). This run expands coverage to everything Phase 1 skipped. Treat the existing plan as the baseline and append, do not rewrite from scratch.

## Read first, in this order

1. `CLAUDE.md` at the repo root. Sets product framing and tech stack.
2. `docs/data/bq_view_plan.md` (781 lines). The Phase 1 plan. Your job is to extend it, not replace it.
3. Every file in `tmp/bq-discovery/`. These are the raw JSON dumps from the Phase 1 run. Reuse them where they answer a question; only re-run a query if the existing dump is missing what you need.
4. `scripts/discover-bq.ts`, `scripts/discover-bq-focus.ts`, `scripts/discover-bq-clients.ts`. The existing scripts. Use them as a template for new ones.

When you've read all of the above, write a one-paragraph confirmation back to the user that says (a) what you understand the goal to be, (b) what's already covered in the Phase 1 plan, and (c) the exact list of buckets you plan to expand. Wait for the user to say "go" before running a single BigQuery query.

## Setup and constraints

- Project: `yellowhead-visionbi-rivery`. Region: `US`. Read-only.
- Auth: assumes `gcloud auth application-default login` is already set up locally.
- Hard rule: NO writes to BigQuery. No CREATE, INSERT, UPDATE, DELETE, DROP, TRUNCATE, MERGE, or ALTER. If a script would mutate state, do not run it.
- Cost rule: if any single query would scan more than 5 GB, stop and ask the user before running it. Use `bq query --dry_run` to estimate first when you're unsure.
- Sampling rule: for tables with row counts above 100M, use `TABLESAMPLE SYSTEM (1 PERCENT)` for sample rows. Don't pull full row sets.
- Batching rule: prefer `INFORMATION_SCHEMA.TABLES` and `INFORMATION_SCHEMA.COLUMNS` aggregations over per-table `SELECT *` probes. One query that returns 700 rows beats 700 queries that return one each.
- Output rule: every script writes its evidence to `tmp/bq-discovery/<NN>-<topic>.json`. Pick the next free `NN` after the existing `09-` (the highest existing prefix is `08-agent-view-probe.json`).

## The buckets to cover

Cover them in the order listed. Run one bucket end to end (script + dump + analysis), report back to the user with a 5-line summary of what you found, then ask before starting the next bucket. Do NOT run all buckets in one shot.

### Bucket 1 — Project-level metadata (cheap, run first)

- IAM: `bq show --format=prettyjson yellowhead-visionbi-rivery` and per-dataset `bq show --format=prettyjson <project>:<dataset>`. Capture roles + members per dataset. Identify what role the Lumen service account would need.
- Stored procedures and UDFs: `INFORMATION_SCHEMA.ROUTINES` across every dataset.
- Scheduled queries / data transfers: use the BigQuery Data Transfer Service via `bq ls --transfer_config --transfer_location=us`. Capture the schedule and destination for every transfer that targets a dataset Lumen reads.
- Authorized views and row-level security: `INFORMATION_SCHEMA.OBJECT_PRIVILEGES` and any RLS policies via `INFORMATION_SCHEMA.ROW_ACCESS_POLICIES`.

Output: `09-project-metadata.json`. Plan-doc update: a new appendix "Appendix D — Project-level metadata."

### Bucket 2 — Side datasets (small, fast)

For each of these, dump full schema (`INFORMATION_SCHEMA.COLUMNS`), row count, latest modification, and a 5-row sample (or 10 if rows are tiny). Then write a 3-sentence verdict per dataset.

- `rivery_activity_anlytics` (3 tables + 1 view). Special focus: figure out the sync watermark semantics — which column tells us "data through date X." This becomes Lumen's freshness signal.
- `yh_singular` (4 tables, created Oct 2025). What does Singular track for yellowHEAD, what's the grain, why isn't it wired into the warehouse yet.
- `pw_yh_cohort_aggregated_stats_google` (1 table, 2.6M rows, 1.4 GB). Sample carefully — use `TABLESAMPLE`. What's a "cohort" here, who built it, why Google-only.
- `seo_screamingfrog` (1 table, 3,167 rows). Confirm it's a single SEO crawl dump; identify the crawl source URL and date.
- `receipts_users`. The Phase 1 run hit "Linked dataset is unlinked." Investigate why. Is it a sunset BigQuery linked-dataset, a Snowflake bridge, a Looker derived dataset? Document and recommend.
- `yellowhead_temp`. Confirm empty or not. If not empty, dump.

Output: `10-side-datasets.json`. Plan-doc update: expand §1a verdicts with one paragraph each.

### Bucket 3 — Inside `yellowhead_prod`, the missing prefixes

The Phase 1 plan documented `management_dashboard_*`, `v_agent_*`, and sampled four `dwh_*` tables. This bucket covers the rest.

For each prefix below, do: full enumeration of live (modified <=30d) tables, schema column-mapping (which columns appear in >50% of tables in the prefix), row count distribution, freshness distribution, and 3 representative table samples.

- `ods_*` (686 live). One sample per platform (Meta, Apple, Google, TikTok, AppsFlyer, AppTweak, GSC, Singular, etc.) — pick the freshest table per platform. Document which raw fields per platform map to the management_dashboard slots.
- `dwh_*` (386 live). Phase 1 only sampled `dwh_*_globalcomix` for four platforms. Expand to: pick the largest `dwh_<platform>_<client>` per platform across the active client list, dump schema + 3 sample rows.
- `uni_*` (70 live). Confirm or refute the Phase 1 finding "no client column." For each `uni_*` table, list its columns and flag whether `master_account` / `client` / equivalent exists. The 17M-row and 306M-row tables are the priority since they could be useful for Ask later.
- `pre_*` and `pre_v_*` (68 live). What do they materialize, what's downstream of them. For views, dump the view DDL via `INFORMATION_SCHEMA.VIEWS`.
- `dim_*`, `map_*`, `bs_*` (<10 total). Full enumeration, full schema, full row count. Especially: confirm there is NO `dim_clients` or any client master table anywhere. Search by column name, not just table name (`SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE column_name IN ('client_id','customer_id','account_id','master_account_id')`).
- `EXTERNAL` tables (12). For each: what's the source URI, what's the format (CSV / Sheets / Parquet / GCS), what does it contain. `bq show --format=prettyjson` reveals the external_data_configuration.
- Legacy `dwh_v_*` views (~91). Even though they're unusable in standard SQL, dump their DDL via `INFORMATION_SCHEMA.VIEWS.view_definition`. The SQL encodes business logic that may be valuable institutional knowledge for the AI layer.
- The 86 per-client `management_dashboard_*` variants. Phase 1 said "duplicate or zero-row, skip." Verify this claim by running a row-count + latest-date query across all 86. Output: a CSV/JSON listing every variant, its row count, latest date, and whether it covers a client not present in the cross-platform tables.

Output: one JSON per prefix in `tmp/bq-discovery/11-ods.json` through `tmp/bq-discovery/18-md-variants.json`. Plan-doc update: expand §1c with a subsection per prefix.

### Bucket 4 — The 10,652 UNMATCHED objects

Phase 1's `04-platform-map.json` classifier left 10,652 objects unclassified. Most are in backup datasets but ~1,300 are in `yellowhead_prod`. Filter to the prod subset, then re-classify by:

- Token analysis: what tokens appear in unmatched table names that the platform regex didn't catch? Common ones likely include client names that aren't in the existing client list, internal tool names, ad-hoc analyst tables.
- Created-by analysis: `INFORMATION_SCHEMA.TABLES.creation_time` plus modification time tells you "is this a one-shot analyst table or a maintained pipeline output."
- Cluster by name prefix using simple substring grouping. Output the top 20 clusters with sample table names.

Output: `19-unmatched-classified.json`. Plan-doc update: a new section §1e "The unmatched layer" with a table of clusters and verdicts.

### Bucket 5 — Looker query telemetry from `yh_bq_logs`

This is the highest-value bucket and intentionally last because the queries can be expensive. `yh_bq_logs` contains BigQuery audit log exports. Mine it for:

- What tables Looker Studio actually reads (filter by `principal_email` containing `looker-studio` or `looker.com`).
- What tables are read most often (top 50 by query count, last 30 days).
- What tables are NEVER read by Looker but ARE updated daily — those are dead weight in the warehouse.
- Average bytes scanned per query — gives Lumen a cost baseline to beat.
- Slowest queries (top 20 by total slot ms) — these are candidates for Lumen to do better than Looker on.

Use `INFORMATION_SCHEMA.JOBS_BY_PROJECT` as the primary source if it has the same data; only fall back to `yh_bq_logs` if not. Aggregate, don't dump raw rows. The output should be a single 50-200 KB JSON, not gigabytes.

Output: `20-looker-telemetry.json`. Plan-doc update: a new section §7 "How Looker actually uses the warehouse" with the top-50 read list and the dead-weight list.

### Bucket 6 — Backup datasets (low priority, do last)

Confirm the Phase 1 dismissal holds. For `yellowhead_bkp`, `yellowhead_bkp_archieved_tables`, `yellowhead_bkp_us_1m`, `yellowhead_bkp_us_6m`, `yellowhead_training`, `yellowHEAD_SQL_exam`: enumerate object counts by year created, latest modification, and any signs of recent activity. If any of them have been touched in the last 30 days, investigate why. Otherwise produce a one-paragraph "confirmed dead" appendix.

Output: `21-backups-audit.json`. Plan-doc update: confirm or correct §1a verdicts.

## Deliverables when all buckets are done

1. `docs/data/bq_view_plan.md` updated in place. Existing sections retained. New content goes into expanded §1, new §7 (Looker telemetry), and new appendices D and E.
2. All new scripts saved in `scripts/discover-bq-*.ts`, named clearly (`discover-bq-iam.ts`, `discover-bq-side-datasets.ts`, etc.).
3. All new dumps saved in `tmp/bq-discovery/` with sequential numeric prefixes.
4. A new top-level section near the start of `bq_view_plan.md` titled "What changed in this discovery pass" — a 1-page diff between the Phase 1 plan and the expanded one. List every claim from Phase 1 that this pass either confirmed, corrected, or extended. Be specific.
5. A new file `docs/data/bq_open_questions.md` consolidating every open question for the BI team. Phase 1 had 3. This pass will likely produce 10 to 20. Group them by urgency.
6. Update the project memory file `MEMORY.md` (in the user's memory directory) with any new structural facts that future Claude sessions should know. Do NOT save ephemeral findings or things derivable from the warehouse itself.

## Guardrails for tone and judgment

- If you find data that contradicts the Phase 1 plan, do not silently overwrite. Flag in the "What changed" section: "Phase 1 said X. This pass found Y. Recommend Z." The user prefers visible disagreement to stealth correction.
- If you find something that should be a product decision (e.g. "should Lumen include this client even though it's stale?"), do not decide for the user. List it as an open product question.
- Do not invent business context. If a table's purpose is unclear, write "purpose unknown — recommend BI team confirms" rather than guessing.
- Never use em dashes in any output. Use commas, periods, parens, or "and."
- Default response language is English even though the user often types in Hebrew.

## When in doubt

Pause and ask the user. The user is Omer, the product owner, technically deep but bandwidth-limited. He prefers one well-framed question over five rapid-fire ones. Frame any question with: what you found, what the choice is, what your recommendation is, why.
