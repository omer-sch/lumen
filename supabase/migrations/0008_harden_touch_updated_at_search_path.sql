-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration
-- version 20260515154401 via Supabase MCP on 2026-05-15.
--
-- Locks the search_path on the touch_updated_at trigger function to
-- guard against schema-poisoning attacks on the search_path. Caught by
-- the Supabase advisor (linter rule 0011).
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
