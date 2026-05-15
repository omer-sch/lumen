-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration via
-- Supabase MCP on 2026-05-15.
--
-- The retrieve() server helper calls this function via supabase.rpc().
-- Single round-trip: takes the query vector, the corpus, k, and up to
-- five named filters. AND-combines non-null filters, runs HNSW ANN
-- (cosine distance), returns top k rows with their similarity score.
-- Defined as `language sql stable` so PG can inline / cache the plan.

create or replace function public.match_rag_chunks(
  query_embedding vector(1536),
  match_corpus text,
  match_count int default 10,
  filter_client text default null,
  filter_channel text default null,
  filter_platform text default null,
  filter_date_from text default null,
  filter_date_to text default null,
  filter_tags text[] default null
)
returns table (
  id uuid,
  chunk_id text,
  source_path text,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.chunk_id,
    c.source_path,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.rag_chunks c
  where c.corpus = match_corpus
    and (filter_client is null or (c.metadata->>'client') = filter_client)
    and (filter_channel is null or (c.metadata->>'channel') = filter_channel)
    and (filter_platform is null or (c.metadata->>'platform') = filter_platform)
    and (filter_date_from is null or (c.metadata->>'date') >= filter_date_from)
    and (filter_date_to is null or (c.metadata->>'date') <= filter_date_to)
    and (filter_tags is null or (c.metadata->'tags') ?| filter_tags)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_rag_chunks is
  'HNSW + JSONB pre-filter ANN search over rag_chunks. Returns top match_count rows ordered by cosine similarity. Called by src/lib/rag/retrieve.ts via supabase.rpc(). Filters are AND-combined; nulls are no-ops.';
