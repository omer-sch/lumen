# Hermes v0 — 90-second demo script

Audience: anyone seeing Hermes for the first time. Recorded as the
demo asset for the Phase 9 sign-off.

Prerequisites for the live demo:
- `OPENAI_API_KEY` (embeddings) + `ANTHROPIC_API_KEY` (Haiku, Sonnet) in `.env.local`.
- Upstash Redis env vars (warm cache).
- Supabase env vars (run lifecycle + memory + RAG).
- Knowledge corpus backfilled: `CRON_SECRET=… LUMEN_VAULT_PATH="…/Lumen Vault" node scripts/backfill-knowledge-corpus.mjs`.
- Dev server running: `npm run dev`.

## The 90-second flow

**0:00 — open `/reports`.**

Brief pitch: "Lumen Reports is where CSM and UA build the client decks. Today, building one means screenshotting Looker Studio. Hermes turns a client email into a draft."

**0:10 — click "Draft from email" in the page header.**

Modal opens with a textarea + "Use canonical fixture" helper.

**0:15 — click "Use canonical fixture".**

The textarea fills with the Emily-style request:
> Hi team, could you send over the weekly review for GlobalComix? I'm mostly interested in how iOS is doing on Meta this past week…

**0:25 — click "Draft report".**

Modal flips to the in-flight state. The label cycles through `parse_intent → analyze → quill → atelier → review_gate` so the audience sees the pipeline run.

**0:50 — page navigates to `/agents/hermes/runs/<run_id>`.**

Walk through the review surface in order:

1. **Stats row.** Run id, status (`completed`), bullet count, latency.
2. **Download .pptx button.** Live link to the file Atelier just wrote.
3. **Parsed intent panel.** Client = `globalcomix`, platforms = `ios`, channels = `meta`, period = `this past week`, confidence ≈ `0.92`.
4. **Draft slides panels.** Bullets grouped by slide_target with citations + source_query_id chips under each bullet. Point at the citation chip — "every numeric claim ties back to the BQ query that produced it; every framing ties back to a RAG chunk in the Knowledge or History corpus."
5. **Run trace.** parse_intent → analyze → quill → atelier → review_gate with per-node ms latency.

**1:15 — click "Download .pptx".**

A real `.pptx` saves locally. Open it: cover slide ("GlobalComix weekly review"), three content slides with the bullets, closing slide.

**1:30 — click "Approve draft".**

Approved badge appears with the timestamp. The agent_runs row is now stamped `approval.approved = true` in Supabase; the History corpus already auto-wrote on the completed-status transition via the pg_net trigger.

## What to emphasize

- **Citations are the trust contract.** Every bullet ties back to a source_query_id and (where framing is involved) a RAG chunk_id. Quill's validator fails the run if a bullet drops a citation.
- **Anomstack pre-pass is deterministic.** Hermes' Sonnet steps only frame and rank; the anomalies themselves come from numerical detectors over real BQ data. The model never invents what wasn't in the data.
- **Cost ceiling is real.** Per-run cost (Haiku + Sonnet + OpenAI embed) lands well under $0.10 on warm cache; the bigger cost win is Anthropic prompt caching, which we use on every Hermes Sonnet call.
- **GlobalComix only in v0.** Adding a client = widening `KNOWN_CLIENT_SLUGS` + onboarding the BQ queries. No code rewrites.

## Known limits to call out if asked

- The live Haiku adversarial run (3 fixtures) was structurally audited but not behaviorally verified; awaiting a real Anthropic key on a separate environment.
- Inline bullet edits + per-section regenerate are queued for a follow-up polish phase. v0 review is view + approve.
- Streaming run trace inside the paste modal is queued. v0 uses a synchronous POST + step-name indicator.
- Gmail OAuth is not in scope for this branch. v0 is paste-the-email + download-the-deck.

## Recording

The demo recording is owed (cannot record autonomously). Capture the 90-second flow above at 1080p and link it from `Sessions/first-real-agent-try/phase-9.md`.
