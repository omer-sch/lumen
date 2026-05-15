-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration
-- version 20260515154222 via Supabase MCP on 2026-05-15.
--
-- Scoped slice memory for Hermes-style agents. (scope, slice) keys
-- arbitrary jsonb payloads, e.g. Quill writes (quill, globalcomix) to
-- store the last 3 weeks of bullets for tone matching. Distinct from
-- agent_memory, which is rule-learning memory for Aria.

create table public.agent_memory_kv (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  slice text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index agent_memory_kv_lookup_idx
  on public.agent_memory_kv (scope, slice, created_at desc);

alter table public.agent_memory_kv enable row level security;

create policy "agent_memory_kv service-role only"
  on public.agent_memory_kv
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.agent_memory_kv is
  'Scoped slice memory for Hermes-style agents. (scope, slice) keys arbitrary jsonb payloads. Distinct from agent_memory which is rule-learning for Aria.';
