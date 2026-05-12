# Prompt: BigQuery Discovery and View Plan for Lumen

Paste this into Claude Code from the Lumen repo root.

---

## Your role

You are a senior data engineer and SQL specialist. You know BigQuery deeply: schema discovery, query cost, partitioning, view design, and how to shape raw ad platform data into clean, query-friendly layers for an analytics product.

Your job in this task is **not to write the app**. It is to:

1. Scan the yellowHEAD BigQuery warehouse from scratch.
2. Understand what data exists, where it lives, and how it is shaped, based only on what you can observe in BigQuery right now.
3. Produce a concrete, prioritized plan that tells me exactly which tables, views, and queries Lumen should use to power four specific dashboard views.

Treat this as a discovery + architecture exercise. Output a plan, not code.

---

## Ground rule on prior knowledge

**Do not rely on anything you think you already know about this warehouse.** Do not assume the existence of any specific dataset, table, view, naming convention, partition strategy, client list, or "gold-standard" schema. Do not assume which tables are active or stale. Do not assume how clients are identified.

Every claim in your plan must be backed by something you actually queried or read from BigQuery in this session. If a piece of context is not in `CLAUDE.md` and you did not verify it with a query, do not state it as fact.

---

## Context you must read first

Before doing anything else:

1. Read `CLAUDE.md` at the repo root. The full product context for Lumen is there. Pay attention to: the four user teams, the UA-only current scope, the information architecture (Dashboard / Campaigns / Ask / Reports / Feed / Knowledge), and the read-only constraint.
2. Read the yellowHEAD brand skill at `.claude/skills/yellowhead-brand/SKILL.md` so any suggested visualizations are brand-consistent.
3. Note that Lumen's first phase is **UA team only**. Organic, Creative, and CSM are out of scope for now.

---

## Connection facts

- **BigQuery project:** `yellowhead-visionbi-rivery`
- **Access:** read-only, already granted

Everything else about the warehouse, the datasets inside it, the tables, the views, the naming, the freshness, the client model, is something you must discover. Do not start from assumptions.

---

## What I want to see in Lumen

Lumen needs to support these four views. Your plan must cover each one.

### View 1: One client, all platforms

A single client-scoped dashboard that unifies every platform we run for that client. Spend, installs, CPI, ROAS, plus platform-level breakdowns. The user picks a client and sees every platform we run for them in one view.

### View 2: All campaigns in the company

A flat, filterable list of every campaign across every client and every platform. One row per campaign with channel, client, status, spend, installs, CPI, ROAS, and a recency signal. Sortable and filterable.

### View 3: All clients

The master client list. For each client: which platforms are running, last activity date, recent spend, primary vertical if available, status (active / paused / stale). This is the answer to "who are we even running right now."

### View 4: All activity for one platform (Meta as the example)

A platform-scoped view. Pick Meta, see every campaign on Meta across every client. The same logic should work for any other platform you find in the warehouse.

---

## How to run the discovery

Do this in order. Do not skip steps. Show your work in the plan.

1. **Enumerate datasets.** List every dataset in the project with `INFORMATION_SCHEMA.SCHEMATA`. Note location, creation time, last modification time if available.
2. **Enumerate objects.** For each dataset, list every table and view with `INFORMATION_SCHEMA.TABLES` and `INFORMATION_SCHEMA.TABLE_OPTIONS`. Capture type, row count, size, partitioning column, clustering columns, and last-modified time.
3. **Detect liveness.** From the metadata, identify which datasets and tables are actually being updated and which are stale or empty. Define your own threshold for "live" and justify it.
4. **Map platforms.** For each live object, work out which ad platform it represents (Meta, TikTok, Google Ads, AppsFlyer, AppTweak, Google Search Console, Apple Console, other, cross-platform). Base this on the table name and a sample of columns, not on guesses.
5. **Inspect schemas.** For the live objects most likely to power the four views, pull column lists from `INFORMATION_SCHEMA.COLUMNS` and a tiny sample (`LIMIT 5` with a partition filter where applicable). Look for: spend, impressions, clicks, installs, revenue, campaign id, campaign name, client identifier, date, platform.
6. **Look for abstraction layers.** Check whether the BI team has built any views that pre-join or pre-aggregate platform data for downstream consumption. If yes, document them. If no, say so.
7. **Find the client identifier.** Determine how clients are represented in this warehouse. Is there a client dimension table? A client column on every fact table? Are client names consistent across platforms? Whatever you find, document it with evidence.
8. **Define active clients.** Based on what you observe, propose a definition of "active client" that the warehouse can actually support. Justify the threshold with data.

---

## What I want back from you

Produce a single planning document at `docs/data/bq_view_plan.md` with the sections below. Do not implement anything. Do not write app code. Do not create new BQ objects.

### 1. Inventory

For each live dataset and each table or view inside it:

- Name, type, row count, size
- Date range covered and update cadence (derived from metadata or a min/max date scan)
- Partitioning and clustering keys
- Platform it represents
- One sentence on what it contains

Flag anything stale, empty, or duplicated.

### 2. Schema map

For every object you plan to recommend, document:

- Full column list with types
- The grain (one row per what)
- Join keys to other objects
- Quality issues (nulls in important fields, inconsistent naming, missing platforms)

If you find a layer of views purpose-built for downstream consumption, document its shape and call out where individual views diverge from each other.

### 3. Client identification strategy

Based only on what you found in the warehouse, propose how Lumen should:

- Enumerate the client list
- Resolve a single client identity across platforms (the same client may appear under different names in different sources)
- Decide active vs paused vs stale

Give the actual SQL you would run and explain the tradeoffs.

### 4. View-by-view plan

For each of the four Lumen views above:

- **Data sources:** which tables or views power it
- **Query shape:** the SQL pattern (skeleton, not production code)
- **Grain and filters:** what one row represents and which filters apply
- **Performance notes:** estimated bytes scanned, partitions hit, whether we need a materialized intermediate
- **Gaps:** what data is missing or unreliable for this view
- **Open questions for the BI team:** anything you cannot resolve from the warehouse alone

### 5. Recommended abstraction layer for Lumen

Based on what you find, recommend what Lumen's data access layer should look like. Options to weigh:

- Query existing views directly
- Build a thin Lumen-owned view layer on top
- Pre-aggregate into a serving table refreshed on a schedule

Pick one and justify it. Consider: query cost, freshness, complexity, who owns the SQL when something breaks.

### 6. Prioritized next steps

A numbered list of what to do first, second, third. Bias toward the cheapest path to a working "one client, all platforms" view, since that is the highest-value first surface.

---

## Constraints and rules

- **Read-only.** Do not create, alter, or drop anything in BigQuery. Discovery queries only.
- **Cost-aware.** Use `INFORMATION_SCHEMA` and table metadata before scanning data. When you do scan data, prefer `LIMIT` and partition filters. Report estimated bytes scanned for any non-trivial query.
- **Evidence-based.** Every claim about the warehouse must trace back to a query you actually ran in this session. No assumptions.
- **No assumptions about Alison.AI.** It is a separate company and not part of yellowHEAD's stack.
- **UA only.** Ignore Organic, Creative, and CSM data needs in this pass even if you see relevant tables. Note them in an appendix but do not plan views for them.
- **Surface uncertainty.** If a table looks promising but you cannot tell whether it is fresh or trustworthy, say so. Do not paper over gaps.
- **Verify before you recommend.** If you propose using a specific table or view, confirm it has recent data and the columns you claim. Do not recommend something you have not inspected.

---

## Deliverable

One file: `docs/data/bq_view_plan.md`, structured per section 1 through 6 above.

When you are done, post a short summary in chat: how many datasets are live, what kinds of objects you found, which of the four Lumen views is easiest to build first, and the top three open questions for the BI team.
