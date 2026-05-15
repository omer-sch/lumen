-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration
-- version 20260515154131 via Supabase MCP on 2026-05-15.
--
-- Hermes (and any future agent built on the shared scaffold) writes its
-- typed input/output to agent_runs and tags the run with the target
-- client. Existing Aria/Max/Nova rows stay valid (the columns are
-- nullable). Adds two btree indices for the most common lookups.
-- Seeds the Hermes agent row so agent_runs.agent_id FK is satisfied.

alter table public.agent_runs
  add column if not exists input jsonb,
  add column if not exists output jsonb,
  add column if not exists client text;

create index if not exists agent_runs_client_idx on public.agent_runs (client);
create index if not exists agent_runs_status_idx on public.agent_runs (status, started_at desc);

insert into public.agents (id, name, role, description, schedule, avatar_url)
values (
  'hermes',
  'Hermes',
  'Reports analyst',
  'Turns a client email into a yellowHEAD weekly review deck. RAG-grounded, citation-bound.',
  'On demand',
  '/avatars/hermes.png'
)
on conflict (id) do nothing;
