-- Lumen dev DB · initial schema.
-- Phase 1 scope: agents, ask history, pinned tiles. The BQ analytics
-- layer (campaigns, channel mix, KPIs) is intentionally NOT modeled here
-- — that data stays in BigQuery and Lumen reads it through /api/bq/*.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
-- agents · identity lookup + stable product attributes
-- ─────────────────────────────────────────────────────────────────────
-- The 3-row table behind AGENT_IDENTITIES in code. The spec called for
-- id/name/role/avatar_url only; we extended with description, schedule,
-- and paused because those are stable per-agent attributes consumed by
-- AgentCard and aren't worth deriving on every read.
--   status, totalRuns, lastRun, keyMetric stay derived (the data access
--   layer computes them from agent_runs).
create table if not exists agents (
  id          text        primary key,
  name        text        not null,
  role        text        not null,
  description text        not null,
  schedule    text        not null,
  avatar_url  text        not null,
  paused      boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- agent_runs · every scheduled / manual / in-flight run
-- ─────────────────────────────────────────────────────────────────────
-- One row per run. step + progress are only populated while status =
-- 'running' (drives the live progress bar in AgentDetailPanel). score
-- is generic numeric — Aria uses 0–100 (virality), Max uses anomaly
-- count, Nova uses rating (0–5) via the separate rating column.
create table if not exists agent_runs (
  id           uuid        primary key default gen_random_uuid(),
  agent_id     text        not null references agents(id) on delete cascade,
  status       text        not null
    check (status in ('running','completed','failed','scheduled')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  step         text,
  progress     int         check (progress is null or progress between 0 and 100),
  note         text,
  score        numeric,
  rating       numeric,
  error        text
);

create index if not exists agent_runs_agent_started_idx
  on agent_runs (agent_id, started_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- agent_images · Aria's outputs
-- ─────────────────────────────────────────────────────────────────────
-- image_url and image_storage_path are both nullable: today Aria's
-- generate route returns a base64 data URL (no remote URL, no bucket
-- upload). Once we copy-to-Storage in a follow-up, image_storage_path
-- becomes the bucket-relative path inside the agent-images bucket.
create table if not exists agent_images (
  id                 uuid        primary key default gen_random_uuid(),
  run_id             uuid        not null references agent_runs(id) on delete cascade,
  title              text        not null,
  composition        text,
  palette_from       text,
  palette_to         text,
  image_url          text,
  image_storage_path text,
  virality_score     numeric,
  created_at         timestamptz not null default now()
);

create index if not exists agent_images_run_idx on agent_images (run_id);

-- ─────────────────────────────────────────────────────────────────────
-- agent_anomalies · Max's outputs (feeds the Feed page)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists agent_anomalies (
  id         uuid        primary key default gen_random_uuid(),
  run_id     uuid        not null references agent_runs(id) on delete cascade,
  channel    text        not null check (channel in ('Meta','TikTok','Google','AppsFlyer')),
  client     text        not null,
  metric     text        not null,
  delta      text        not null,
  direction  text        not null check (direction in ('up','down')),
  created_at timestamptz not null default now()
);

create index if not exists agent_anomalies_run_idx on agent_anomalies (run_id);

-- ─────────────────────────────────────────────────────────────────────
-- agent_reports · Nova's outputs
-- ─────────────────────────────────────────────────────────────────────
-- metrics_json holds the headline KPIs ({label, value}[]). body_md is
-- the editable draft body (markdown), nullable until Nova writes it.
create table if not exists agent_reports (
  id           uuid        primary key default gen_random_uuid(),
  run_id       uuid        not null references agent_runs(id) on delete cascade,
  title        text        not null,
  excerpt      text,
  body_md      text,
  metrics_json jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists agent_reports_run_idx on agent_reports (run_id);

-- ─────────────────────────────────────────────────────────────────────
-- agent_feedback · user signals on a specific run
-- ─────────────────────────────────────────────────────────────────────
-- The AgentDetailPanel emits a single combined save per click:
-- {thumbs, note, score}. We model that as one row whose `kind` carries
-- the verdict (thumbs_up/thumbs_down) or 'note' if the user only typed
-- text, plus `text` (the note) and `rating` (the numeric the user set,
-- which is 0–100 for Aria and 0–5 for Nova — preserved raw, no rescale).
-- 'edit' / 'rating' kinds are reserved for the upcoming Nova edit flow.
create table if not exists agent_feedback (
  id         uuid        primary key default gen_random_uuid(),
  run_id     uuid        not null references agent_runs(id) on delete cascade,
  user_id    text        not null,
  kind       text        not null
    check (kind in ('thumbs_up','thumbs_down','note','edit','rating')),
  text       text,
  rating     numeric,
  created_at timestamptz not null default now()
);

create index if not exists agent_feedback_run_idx  on agent_feedback (run_id);
create index if not exists agent_feedback_user_idx on agent_feedback (user_id);

-- ─────────────────────────────────────────────────────────────────────
-- agent_memory · persistent rules the agent has learned
-- ─────────────────────────────────────────────────────────────────────
create table if not exists agent_memory (
  id                 uuid        primary key default gen_random_uuid(),
  agent_id           text        not null references agents(id) on delete cascade,
  rule               text        not null,
  source             text,
  source_feedback_id uuid        references agent_feedback(id) on delete set null,
  applied_count      int         not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists agent_memory_agent_idx on agent_memory (agent_id);

-- ─────────────────────────────────────────────────────────────────────
-- ask_queries · NL query history (per user)
-- ─────────────────────────────────────────────────────────────────────
-- chart_config_json mirrors PinnedConfig in src/lib/pins/types.ts so a
-- pin can be re-created from a query without re-querying. answered_by
-- references the agent attribution shown on the answer card (today
-- always 'aria', but the column is flexible for when Max/Nova start
-- answering domain-specific questions).
create table if not exists ask_queries (
  id                uuid        primary key default gen_random_uuid(),
  user_id           text        not null,
  query_text        text        not null,
  language          text        not null default 'en' check (language in ('en','he')),
  date_range_start  date,
  date_range_end    date,
  client_id         text,
  answered_by       text        references agents(id),
  chart_type        text        check (chart_type is null or chart_type in ('line','bar','table','kpi')),
  chart_config_json jsonb,
  result_json       jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists ask_queries_user_created_idx
  on ask_queries (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- pinned_tiles · user's custom dashboard pins
-- ─────────────────────────────────────────────────────────────────────
-- source distinguishes pins born from Ask (most common) from pins the
-- user keeps from the AI Dashboard mode. position_index orders the
-- tiles in the dashboard grid (lower = earlier).
create table if not exists pinned_tiles (
  id                uuid        primary key default gen_random_uuid(),
  user_id           text        not null,
  source            text        not null check (source in ('ask','ai_dashboard')),
  source_query_id   uuid        references ask_queries(id) on delete set null,
  title             text        not null,
  chart_config_json jsonb       not null,
  position_index    int         not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists pinned_tiles_user_position_idx
  on pinned_tiles (user_id, position_index);

-- ─────────────────────────────────────────────────────────────────────
-- RLS · row-level security
-- ─────────────────────────────────────────────────────────────────────
-- Today every Supabase call from this app uses the service-role key
-- (which bypasses RLS) inside an API route. These policies are written
-- for the eventual Clerk → Supabase JWT bridge: when the client starts
-- calling Supabase directly with an authenticated JWT, auth.jwt() ->>
-- 'sub' will be the Clerk user id and per-user rows stay isolated. The
-- policies also act as defense-in-depth if the anon key is ever used.
alter table agents          enable row level security;
alter table agent_runs      enable row level security;
alter table agent_images    enable row level security;
alter table agent_anomalies enable row level security;
alter table agent_reports   enable row level security;
alter table agent_feedback  enable row level security;
alter table agent_memory    enable row level security;
alter table ask_queries     enable row level security;
alter table pinned_tiles    enable row level security;

-- agents · public lookup (anon + authenticated can read)
drop policy if exists "agents select all" on agents;
create policy "agents select all"
  on agents for select
  to anon, authenticated
  using (true);

-- agent_runs / images / anomalies / reports / memory ·
-- authenticated read; no writes outside service role.
drop policy if exists "agent_runs select auth" on agent_runs;
create policy "agent_runs select auth"
  on agent_runs for select to authenticated using (true);

drop policy if exists "agent_images select auth" on agent_images;
create policy "agent_images select auth"
  on agent_images for select to authenticated using (true);

drop policy if exists "agent_anomalies select auth" on agent_anomalies;
create policy "agent_anomalies select auth"
  on agent_anomalies for select to authenticated using (true);

drop policy if exists "agent_reports select auth" on agent_reports;
create policy "agent_reports select auth"
  on agent_reports for select to authenticated using (true);

drop policy if exists "agent_memory select auth" on agent_memory;
create policy "agent_memory select auth"
  on agent_memory for select to authenticated using (true);

-- agent_feedback · authenticated read all, insert only own.
drop policy if exists "agent_feedback select auth" on agent_feedback;
create policy "agent_feedback select auth"
  on agent_feedback for select to authenticated using (true);

drop policy if exists "agent_feedback insert own" on agent_feedback;
create policy "agent_feedback insert own"
  on agent_feedback for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

-- ask_queries · strict per-user read/write.
drop policy if exists "ask_queries select own" on ask_queries;
create policy "ask_queries select own"
  on ask_queries for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "ask_queries insert own" on ask_queries;
create policy "ask_queries insert own"
  on ask_queries for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "ask_queries update own" on ask_queries;
create policy "ask_queries update own"
  on ask_queries for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "ask_queries delete own" on ask_queries;
create policy "ask_queries delete own"
  on ask_queries for delete to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

-- pinned_tiles · strict per-user read/write.
drop policy if exists "pinned_tiles select own" on pinned_tiles;
create policy "pinned_tiles select own"
  on pinned_tiles for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "pinned_tiles insert own" on pinned_tiles;
create policy "pinned_tiles insert own"
  on pinned_tiles for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "pinned_tiles update own" on pinned_tiles;
create policy "pinned_tiles update own"
  on pinned_tiles for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "pinned_tiles delete own" on pinned_tiles;
create policy "pinned_tiles delete own"
  on pinned_tiles for delete to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

-- ─────────────────────────────────────────────────────────────────────
-- Storage · agent-images bucket
-- ─────────────────────────────────────────────────────────────────────
-- Public read for now (preview / dev). Lock down to signed URLs once
-- Aria starts uploading real client-tied imagery.
insert into storage.buckets (id, name, public)
  values ('agent-images', 'agent-images', true)
  on conflict (id) do nothing;
