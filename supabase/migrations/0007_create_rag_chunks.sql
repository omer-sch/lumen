-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration
-- version 20260515154237 via Supabase MCP on 2026-05-15.
--
-- RAG corpus. One physical table, namespaced by the `corpus` column.
-- Embedding is OpenAI text-embedding-3-large truncated to 1536 dim via
-- MRL (chosen for cost, MTEB quality, and ease of provider swap; see
-- prompts/2026-05-15-rag-scaffold.md section 4 for the matrix).
--
-- Index strategy: HNSW (m=16, ef_construction=64) for ANN; 5 expression
-- btrees on the most common JSONB filter keys (client, channel,
-- platform, date) for pre-filter. pgvector >= 0.7 pre-filters metadata
-- before ANN so HNSW recall stays high. RLS is service-role only;
-- per-user filtering happens in agent code via the retrieve() filters
-- argument.

create table public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  corpus text not null check (corpus in ('knowledge', 'history', 'comms', 'benchmarks')),
  source_path text not null,
  chunk_id text not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (corpus, source_path, chunk_id)
);

create index rag_chunks_embedding_hnsw
  on public.rag_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index rag_chunks_corpus_idx   on public.rag_chunks (corpus);
create index rag_chunks_client_idx   on public.rag_chunks ((metadata->>'client'));
create index rag_chunks_channel_idx  on public.rag_chunks ((metadata->>'channel'));
create index rag_chunks_platform_idx on public.rag_chunks ((metadata->>'platform'));
create index rag_chunks_date_idx     on public.rag_chunks ((metadata->>'date'));
create index rag_chunks_created_idx  on public.rag_chunks (created_at desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger rag_chunks_touch
  before update on public.rag_chunks
  for each row execute function public.touch_updated_at();

alter table public.rag_chunks enable row level security;

create policy "rag_chunks service-role only"
  on public.rag_chunks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.rag_chunks is
  'RAG corpus. One row per chunk. Namespaced by corpus column (knowledge | history | comms | benchmarks). Embedding column is OpenAI text-embedding-3-large truncated to 1536 dim via MRL.';
