-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration via
-- Supabase MCP on 2026-05-15.
--
-- Fires when an agent_runs row transitions to status=completed with a
-- non-null output. Async-posts the payload to /api/rag/index-history
-- via pg_net so the parent UPDATE doesn't block on the embed call. The
-- receiving route renders the output to text, chunks, embeds, and
-- upserts into the History corpus.
--
-- Requires two GUCs to be set on the database before the trigger does
-- anything useful (skips silently otherwise so an unconfigured dev
-- doesn't error every agent run):
--
--   alter database postgres set lumen.app_url     to 'https://<host>';
--   alter database postgres set lumen.cron_secret to '<CRON_SECRET>';
--
-- Set these via the Supabase SQL editor once the API URL and the
-- CRON_SECRET env value are decided. After setting, run `select
-- pg_reload_conf();` for the change to be visible in new sessions.

create or replace function public.queue_history_index()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
  payload jsonb;
begin
  if not (tg_op = 'UPDATE'
          and old.status is distinct from 'completed'
          and new.status = 'completed'
          and new.output is not null) then
    return new;
  end if;

  app_url := current_setting('lumen.app_url', true);
  cron_secret := current_setting('lumen.cron_secret', true);
  if app_url is null or cron_secret is null then
    raise notice 'lumen.app_url / lumen.cron_secret unset; skipping history index for agent_run %', new.id;
    return new;
  end if;

  payload := jsonb_build_object(
    'agent_id', new.agent_id,
    'run_id', new.id,
    'output', new.output,
    'client', new.client,
    'completed_at', new.completed_at
  );

  perform net.http_post(
    url := app_url || '/api/rag/index-history',
    body := payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json'
    )
  );

  return new;
end;
$$;

drop trigger if exists agent_runs_history_index on public.agent_runs;
create trigger agent_runs_history_index
  after update on public.agent_runs
  for each row execute function public.queue_history_index();

comment on function public.queue_history_index is
  'Fires when agent_runs transitions into status=completed with a non-null output. Async-posts the run payload to /api/rag/index-history via pg_net. Skips silently if lumen.app_url or lumen.cron_secret GUCs are unset.';
