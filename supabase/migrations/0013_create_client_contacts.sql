-- v0.5 workstream B · chunk B3.
--
-- Hermes needs to recognise the sender of an inbound client email so
-- it can salute them by name, scope the report to their client, and
-- later (workstream C) only fire when the sender matches a known
-- contact. client_contacts is the lookup table for that.
--
-- Rows are shared org knowledge (not user-scoped): Lior, Omer, and
-- everyone else on the UA team see the same contact list. Service
-- role manages writes; the seed script + a future contacts admin UI
-- own that surface. Authenticated reads only (no anon).
--
-- After applying, regenerate src/lib/db/types.ts via the Supabase
-- MCP `generate_typescript_types` tool (project_id
-- puzdgqqkksegefcrzege).

create table public.client_contacts (
  id           uuid        primary key default gen_random_uuid(),
  client_id    text        not null,
  name         text        not null,
  email        text        not null,
  role         text,
  is_primary   boolean     not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, email)
);

create index client_contacts_client_idx
  on public.client_contacts (client_id);

create index client_contacts_email_lower_idx
  on public.client_contacts (lower(email));

create trigger client_contacts_touch_updated_at
  before update on public.client_contacts
  for each row execute function public.touch_updated_at();

alter table public.client_contacts enable row level security;

-- Authenticated read: contacts are org knowledge, not user-scoped.
-- Hermes (server-side service-role) reads on every parse_intent;
-- the future contacts admin UI reads via the Clerk session.
create policy "client_contacts authenticated read"
  on public.client_contacts
  for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Only service-role writes. Seed scripts + a future admin surface
-- manage rows; no end-user authoring path in v0.5.
create policy "client_contacts service-role write"
  on public.client_contacts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
