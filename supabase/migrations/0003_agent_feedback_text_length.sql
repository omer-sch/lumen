-- Cap the free-text `note` column on agent_feedback at 2,000 chars.
-- Mirrored in the API layer (MAX_FEEDBACK_TEXT_LENGTH in
-- src/lib/db/agent-feedback.ts) so a hostile API caller can't bypass
-- the limit by going around the route handler. Defence-in-depth for
-- H2 in security-scan-2026-05-12-v2.md.

alter table agent_feedback
  drop constraint if exists agent_feedback_text_length;

alter table agent_feedback
  add constraint agent_feedback_text_length
    check (text is null or length(text) <= 2000);
