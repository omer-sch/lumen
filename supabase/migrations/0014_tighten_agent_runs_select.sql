-- v0.5 workstream B · chunk B5 (squad must-fix).
--
-- Security squad caught that public.agent_runs has a permissive
-- "for select to authenticated using (true)" policy from 0001. After
-- workstream B chunk B2 stamps user_id into agent_runs.input, the
-- input column carries Clerk subject ids + pasted email bodies. With
-- the existing policy, any authenticated user with anon-key access
-- could read every other user's input + output once the
-- Clerk-to-Supabase JWT bridge lands.
--
-- All current Lumen code paths read agent_runs through
-- supabaseAdmin() (service-role, bypasses RLS), so this tightening
-- has no behavioural effect on the running app. It's a
-- defence-in-depth gate against the future-bridge regression.
--
-- Scope: select is now per-user when input.user_id is set; legacy
-- rows without user_id are visible only to service-role. The same
-- shape applies to output (Atelier writes deck.report_id there;
-- Hermes regenerate reads intent + findings out of it).

drop policy if exists "agent_runs select auth" on public.agent_runs;

create policy "agent_runs select self"
  on public.agent_runs
  for select
  using (
    auth.jwt() ->> 'sub' = (input ->> 'user_id')
    or auth.role() = 'service_role'
  );
