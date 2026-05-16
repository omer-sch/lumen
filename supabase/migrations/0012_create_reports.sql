-- v0.5 workstream A · chunk 1.
--
-- The Reports surface (/reports) has lived in window.localStorage since
-- the MVP shipped. v0.5 introduces a server-of-truth so:
--   1. Hermes can write a draft from a server-side LangGraph run
--      (Atelier's new contract, chunk 4) and have the user pick it up
--      on /reports/<id> in the browser.
--   2. Per-section regenerate (chunk 6) can mutate a saved report's
--      sections jsonb in place.
--   3. Edit audit (chunk 7) can append diff entries on each
--      EditableText save.
--
-- Auth model: Lumen's Next.js API routes use requireAgentAuth() to
-- resolve the Clerk userId, then call supabaseAdmin() (service-role,
-- bypasses RLS). The RLS policies below are defence-in-depth so anon
-- and authenticated-but-not-owner sessions can't read reports if the
-- service-role key is ever swapped for an anon-key client.
--
-- After applying this migration, regenerate src/lib/db/types.ts with
-- the Supabase MCP `generate_typescript_types` tool (project_id
-- puzdgqqkksegefcrzege). The types update is bundled into this commit
-- so the chunk-1 build stays green even if the migration hasn't been
-- applied to the dev project yet.

-- id is text (not uuid) because both the manual generateReport() path
-- and the Hermes Atelier path produce client-shaped ids like
-- "rpt_<uuid>" today. A uuid column would reject those at insert; a
-- migration that strips the prefix everywhere is a bigger refactor
-- and the trade-off (lose uuid type checks at the DB) is fine because
-- ids are still generated via crypto.randomUUID() in code.
create table public.reports (
  id              text        primary key,
  owner_user_id   text        not null,
  client          text        not null,
  client_label    text        not null,
  title           text        not null,
  prompt          text,
  period          text        not null,
  filter_range    text,
  period_start    date,
  period_end      date,
  cover           jsonb       not null default '{}'::jsonb,
  sections        jsonb       not null default '[]'::jsonb,
  closing         jsonb       not null default '{}'::jsonb,
  authored_by     text        not null default 'nova'
                  check (authored_by in ('aria', 'max', 'nova', 'hermes')),
  status          text        not null default 'draft'
                  check (status in ('draft', 'approved', 'sent')),
  source          text        not null default 'manual'
                  check (source in ('manual', 'hermes')),
  agent_run_id    uuid        references public.agent_runs(id) on delete set null,
  shared_with     jsonb       not null default '[]'::jsonb,
  audit           jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index reports_owner_idx
  on public.reports (owner_user_id, updated_at desc);

create index reports_agent_run_idx
  on public.reports (agent_run_id)
  where agent_run_id is not null;

create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

alter table public.reports enable row level security;

-- Owner policies. Match the user_id pattern from 0001_init_schema.sql.
create policy "reports owner read"
  on public.reports
  for select
  using (auth.jwt() ->> 'sub' = owner_user_id);

create policy "reports owner write"
  on public.reports
  for all
  using (auth.jwt() ->> 'sub' = owner_user_id)
  with check (auth.jwt() ->> 'sub' = owner_user_id);

-- Sharing: a user_id present in shared_with gets read-only access.
-- shared_with is a jsonb array of Clerk user_ids (text). Phase 1 of
-- sharing in this workstream only writes to it from the API; the UI to
-- manage shares lands later.
create policy "reports shared read"
  on public.reports
  for select
  using (
    shared_with @> jsonb_build_array(auth.jwt() ->> 'sub')
  );

-- Service-role bypass. The Lumen API routes use this client to perform
-- ownership checks themselves before reading or writing.
create policy "reports service-role full"
  on public.reports
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
