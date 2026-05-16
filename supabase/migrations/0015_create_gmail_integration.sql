-- v0.5 workstream C · chunk 1.
--
-- Four tables for the Gmail watch -> Hermes draft loop:
--   1. gmail_oauth_tokens    - encrypted Google OAuth tokens per user
--   2. gmail_watches         - Gmail history-watch registration per user
--   3. user_email_filters    - which senders / domains / labels a user
--                              wants Hermes to fire on
--   4. notifications         - in-app surface for "Hermes drafted X"
--                              and watch-failed alerts
--
-- Auth model: Lumen's API routes use requireUser() (Clerk) + the
-- supabaseAdmin() service-role client. RLS policies below are
-- defence-in-depth (anon and authenticated-non-owner get no rows
-- if the service-role key is ever swapped for an anon-key client).
--
-- After applying, regenerate src/lib/db/types.ts via the Supabase
-- MCP `generate_typescript_types` tool (project_id
-- puzdgqqkksegefcrzege).

-- pgcrypto is enabled in 0001; we use it here to encrypt the OAuth
-- tokens at rest via pgp_sym_encrypt / pgp_sym_decrypt with a key
-- only the application server knows (GMAIL_TOKEN_ENCRYPTION_KEY env).
-- Inserts/updates pass already-encrypted values from the app layer
-- so the key never travels through Supabase.

-- ── gmail_oauth_tokens ────────────────────────────────────────────────
create table public.gmail_oauth_tokens (
  user_id              text        primary key,
  email                text        not null,
  -- Encrypted via pgp_sym_encrypt on the app side. bytea so the
  -- ciphertext doesn't lose bytes round-tripping through text.
  access_token_enc     bytea       not null,
  refresh_token_enc    bytea       not null,
  expires_at           timestamptz not null,
  scope                text        not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index gmail_oauth_tokens_email_idx
  on public.gmail_oauth_tokens (lower(email));

create trigger gmail_oauth_tokens_touch_updated_at
  before update on public.gmail_oauth_tokens
  for each row execute function public.touch_updated_at();

alter table public.gmail_oauth_tokens enable row level security;

create policy "gmail_oauth_tokens self read"
  on public.gmail_oauth_tokens
  for select
  using (auth.jwt() ->> 'sub' = user_id);

create policy "gmail_oauth_tokens service role full"
  on public.gmail_oauth_tokens
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── gmail_watches ─────────────────────────────────────────────────────
create table public.gmail_watches (
  user_id      text        primary key,
  history_id   text        not null,
  expires_at   timestamptz not null,
  status       text        not null default 'active'
               check (status in ('active', 'failed')),
  failure_reason text,
  registered_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index gmail_watches_expires_idx
  on public.gmail_watches (expires_at);

create trigger gmail_watches_touch_updated_at
  before update on public.gmail_watches
  for each row execute function public.touch_updated_at();

alter table public.gmail_watches enable row level security;

create policy "gmail_watches self read"
  on public.gmail_watches
  for select
  using (auth.jwt() ->> 'sub' = user_id);

create policy "gmail_watches service role full"
  on public.gmail_watches
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── user_email_filters ───────────────────────────────────────────────
create table public.user_email_filters (
  id           uuid        primary key default gen_random_uuid(),
  user_id      text        not null,
  filter_type  text        not null
               check (filter_type in ('sender_domain', 'sender_email')),
  filter_value text        not null,
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, filter_type, filter_value)
);

create index user_email_filters_user_idx
  on public.user_email_filters (user_id);

create trigger user_email_filters_touch_updated_at
  before update on public.user_email_filters
  for each row execute function public.touch_updated_at();

alter table public.user_email_filters enable row level security;

create policy "user_email_filters self read"
  on public.user_email_filters
  for select
  using (auth.jwt() ->> 'sub' = user_id);

create policy "user_email_filters self write"
  on public.user_email_filters
  for all
  using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "user_email_filters service role full"
  on public.user_email_filters
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── notifications ────────────────────────────────────────────────────
create table public.notifications (
  id           uuid        primary key default gen_random_uuid(),
  user_id      text        not null,
  kind         text        not null
               check (kind in (
                 'hermes_draft_ready',
                 'hermes_run_failed',
                 'gmail_watch_failed',
                 'gmail_connected'
               )),
  title        text        not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, read_at)
  where read_at is null;

create index notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications self read"
  on public.notifications
  for select
  using (auth.jwt() ->> 'sub' = user_id);

create policy "notifications self update"
  on public.notifications
  for update
  using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "notifications service role full"
  on public.notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
