-- Lumen dev DB · seed
-- Mirrors src/lib/mock/agents.ts so the agents page renders the same
-- state from the DB as it did from the mock module. Idempotent: every
-- table is truncated (cascade) before re-insert, and rows use stable
-- UUIDs so a re-run produces an identical DB.
--
-- All dates anchored to currentDate = 2026-05-12 (Aria/Max history
-- through May 12; Nova history through May 02).
--
-- Placeholder user_id for seeded feedback: 'seed_user_dev'. Real Clerk
-- subjects ('user_xxx') will populate the column once the data access
-- layer is wired in the follow-up PR.

truncate
  agent_memory,
  agent_feedback,
  agent_reports,
  agent_anomalies,
  agent_images,
  agent_runs,
  pinned_tiles,
  ask_queries,
  agents
  restart identity cascade;

-- ───────────────────────────── agents
insert into agents (id, name, role, description, schedule, avatar_url, paused) values
  ('aria', 'Aria', 'Image Agent',
   'Generates a daily branded Lumen hero image. Learns from virality scores and your feedback.',
   'Daily · 10:00am', '/avatars/aria.png', false),
  ('max',  'Max',  'Anomaly Scanner',
   'Scans BigQuery every morning for CPI spikes, ROAS drops, and budget anomalies across UA clients.',
   'Daily · 08:00am', '/avatars/max.png',  false),
  ('nova', 'Nova', 'Report Writer',
   'Drafts the weekly UA performance summary. Learns from edits you make to its output.',
   'Weekly · Fridays 09:00', '/avatars/nova.png', false);

-- ───────────────────────────── agent_runs · Aria (3 completed + 1 running)
insert into agent_runs (id, agent_id, status, started_at, completed_at, note, score, step, progress) values
  ('11111111-1111-1111-1111-000000000001', 'aria', 'completed',
   '2026-05-09 10:00:00+00', '2026-05-09 10:03:00+00',
   'Love the god rays. Bulb could be bigger.', 81, null, null),
  ('11111111-1111-1111-1111-000000000002', 'aria', 'completed',
   '2026-05-08 10:00:00+00', '2026-05-08 10:02:30+00',
   'Too busy. Too many elements fighting.', 74, null, null),
  ('11111111-1111-1111-1111-000000000003', 'aria', 'completed',
   '2026-05-07 10:00:00+00', '2026-05-07 10:03:10+00',
   'Good composition, mint dominant.', 78, null, null),
  ('11111111-1111-1111-1111-000000000004', 'aria', 'running',
   '2026-05-12 10:00:00+00', null,
   null, null, 'Rendering composition · pass 2 of 3', 62);

-- ───────────────────────────── agent_runs · Max (3 completed)
insert into agent_runs (id, agent_id, status, started_at, completed_at, note, score) values
  ('22222222-2222-2222-2222-000000000001', 'max', 'completed',
   '2026-05-10 08:00:00+00', '2026-05-10 08:04:00+00',
   '3 anomalies found — CPI +34% Meta/GlobalComix, ROAS -18% TikTok/Playtika, Budget pace +12% Google/888.',
   3),
  ('22222222-2222-2222-2222-000000000002', 'max', 'completed',
   '2026-05-09 08:00:00+00', '2026-05-09 08:03:20+00',
   '1 anomaly found — CPI spike on Meta/GlobalComix.', 1),
  ('22222222-2222-2222-2222-000000000003', 'max', 'completed',
   '2026-05-08 08:00:00+00', '2026-05-08 08:02:50+00',
   '0 anomalies. All channels within expected ranges.', 0);

-- ───────────────────────────── agent_runs · Nova (3 completed, rated)
insert into agent_runs (id, agent_id, status, started_at, completed_at, note, rating) values
  ('33333333-3333-3333-3333-000000000001', 'nova', 'completed',
   '2026-05-02 09:00:00+00', '2026-05-02 09:05:40+00',
   'Weekly UA summary · GlobalComix', 4.9),
  ('33333333-3333-3333-3333-000000000002', 'nova', 'completed',
   '2026-04-25 09:00:00+00', '2026-04-25 09:05:10+00',
   'Weekly UA summary · Playtika', 4.7),
  ('33333333-3333-3333-3333-000000000003', 'nova', 'completed',
   '2026-04-18 09:00:00+00', '2026-04-18 09:06:00+00',
   'Weekly UA summary · 888 Holdings', 4.5);

-- ───────────────────────────── agent_images · Aria's outputs
-- One image per completed Aria run. The live run (#4) has no image yet.
insert into agent_images (id, run_id, title, composition, palette_from, palette_to, virality_score) values
  ('11111111-1111-1111-1111-000000000101',
   '11111111-1111-1111-1111-000000000001',
   'Bulb in motion · god rays',
   'Centered glass bulb floating on deep navy with three god-ray shafts, mint bloom on the filament, yellow rim flare upper-right.',
   'var(--color-ua)', 'var(--color-yellow)', 81),
  ('11111111-1111-1111-1111-000000000102',
   '11111111-1111-1111-1111-000000000002',
   'Cluttered hero · 7 elements',
   'Bulb with floating particles, gradient overlay, secondary chart silhouette, badge mark, and signature curve — too many focal points.',
   'var(--color-creative)', 'var(--color-yellow)', 74),
  ('11111111-1111-1111-1111-000000000103',
   '11111111-1111-1111-1111-000000000003',
   'Mint-led hero',
   'Single bulb on dark navy, full mint glow, soft yellow whisper in the background bokeh — restrained and on-brand.',
   'var(--color-ua)', 'var(--color-ua-glow)', 78);

-- ───────────────────────────── agent_anomalies · Max's outputs
-- May 10: 3 anomalies. May 09: 1. May 08: 0 (no rows).
insert into agent_anomalies (id, run_id, channel, client, metric, delta, direction) values
  ('22222222-2222-2222-2222-000000000101',
   '22222222-2222-2222-2222-000000000001',
   'Meta',   'GlobalComix',  'CPI',         '+34%', 'up'),
  ('22222222-2222-2222-2222-000000000102',
   '22222222-2222-2222-2222-000000000001',
   'TikTok', 'Playtika',     'ROAS',        '-18%', 'down'),
  ('22222222-2222-2222-2222-000000000103',
   '22222222-2222-2222-2222-000000000001',
   'Google', '888 Holdings', 'Budget pace', '+12%', 'up'),
  ('22222222-2222-2222-2222-000000000104',
   '22222222-2222-2222-2222-000000000002',
   'Meta',   'GlobalComix',  'CPI',         '+22%', 'up');

-- ───────────────────────────── agent_reports · Nova's outputs
insert into agent_reports (id, run_id, title, excerpt, metrics_json) values
  ('33333333-3333-3333-3333-000000000101',
   '33333333-3333-3333-3333-000000000001',
   'Weekly UA summary · GlobalComix',
   'ROAS climbed to 3.2x, the strongest week this quarter. TikTok creatives drove 41% of installs while CPI on Meta held steady. Recommend scaling the Hardcasual concept and retiring two underperforming static creatives.',
   '[{"label":"ROAS","value":"3.2x"},{"label":"Spend","value":"$84.2k"},{"label":"Installs","value":"21.8k"}]'::jsonb),
  ('33333333-3333-3333-3333-000000000102',
   '33333333-3333-3333-3333-000000000002',
   'Weekly UA summary · Playtika',
   'ROAS held at 2.8x against a 6% spend increase. UGC creatives outperformed studio ads on TikTok (+22% CTR). Recommend doubling UGC budget allocation next sprint.',
   '[{"label":"ROAS","value":"2.8x"},{"label":"Spend","value":"$112.5k"},{"label":"Installs","value":"34.0k"}]'::jsonb),
  ('33333333-3333-3333-3333-000000000103',
   '33333333-3333-3333-3333-000000000003',
   'Weekly UA summary · 888 Holdings',
   'Budget pacing came in 8% over plan with mixed efficiency. Google App campaigns regressed; Meta held. Recommend reallocating 12% of Google spend back to Meta UAC for the next two weeks.',
   '[{"label":"ROAS","value":"1.9x"},{"label":"Spend","value":"$67.3k"},{"label":"Installs","value":"9.2k"}]'::jsonb);

-- ───────────────────────────── agent_feedback
-- Three Aria feedback rows tied to the three completed runs. They map
-- 1:1 to Aria's three memory rules below via source_feedback_id.
-- Max/Nova memory rules predate our seeded runs, so they keep
-- source_feedback_id = null and carry the textual source line only.
insert into agent_feedback (id, run_id, user_id, kind, text, rating) values
  ('11111111-1111-1111-1111-000000000301',
   '11111111-1111-1111-1111-000000000002',
   'seed_user_dev', 'thumbs_down',
   'Too busy. Too many elements fighting.', 74),
  ('11111111-1111-1111-1111-000000000302',
   '11111111-1111-1111-1111-000000000003',
   'seed_user_dev', 'thumbs_up',
   'Good composition, mint dominant.', 78),
  ('11111111-1111-1111-1111-000000000303',
   '11111111-1111-1111-1111-000000000001',
   'seed_user_dev', 'thumbs_up',
   'Love the god rays. Bulb could be bigger.', 81);

-- ───────────────────────────── agent_memory
insert into agent_memory (id, agent_id, rule, source, source_feedback_id, applied_count) values
  -- Aria · 3 rules, each tied to its originating feedback row
  ('11111111-1111-1111-1111-000000000201', 'aria',
   'Reduce element count when virality < 75 — viewers prefer one focal subject.',
   'May 08 note · "too busy"',
   '11111111-1111-1111-1111-000000000301', 3),
  ('11111111-1111-1111-1111-000000000202', 'aria',
   'Lead with mint glow on the bulb; yellow stays an accent only.',
   'May 07 note · "mint dominant"',
   '11111111-1111-1111-1111-000000000302', 5),
  ('11111111-1111-1111-1111-000000000203', 'aria',
   'God-ray light shafts on dark navy reliably score above 80.',
   'May 09 note · "love the god rays"',
   '11111111-1111-1111-1111-000000000303', 1),
  -- Max · 2 rules (predate seeded runs, no feedback row)
  ('22222222-2222-2222-2222-000000000201', 'max',
   'Suppress CPI spikes < 8% on Meta during weekend traffic — historically noise.',
   'Apr 21 thumbs-down on weekend false positive',
   null, 7),
  ('22222222-2222-2222-2222-000000000202', 'max',
   'Surface ROAS drops > 12% with 3-day persistence as drops, not spikes.',
   'Apr 14 note · "only flag sustained drops"',
   null, 4),
  -- Nova · 2 rules (predate seeded runs, no feedback row)
  ('33333333-3333-3333-3333-000000000201', 'nova',
   'Open with the headline ROAS delta, not the spend total — the team scans for outcome first.',
   'Apr 18 edit · re-ordered intro',
   null, 2),
  ('33333333-3333-3333-3333-000000000202', 'nova',
   'Lead recommendations with the channel that moved most this week.',
   'Apr 25 note · "bury budget table, lead with what changed"',
   null, 1);
