-- Add the source question to pinned_tiles so PinnedSection can show
-- the secondary "asked X" line under each tile's label. Nullable —
-- AI-dashboard pins don't have an originating question.

alter table pinned_tiles
  add column if not exists question text;
