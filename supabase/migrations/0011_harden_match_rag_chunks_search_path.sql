-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration via
-- Supabase MCP on 2026-05-15.
--
-- Locks the search_path on the match_rag_chunks function and switches
-- the vector cosine operator + table reference to explicit qualifiers
-- so the empty search_path doesn't break resolution. Closes the
-- function_search_path_mutable advisor warning that the Phase 1
-- Security Squad flagged on 0009.

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
set search_path = ''
as $$
  select
    c.id,
    c.chunk_id,
    c.source_path,
    c.content,
    c.metadata,
    1 - (c.embedding operator(public.<=>) query_embedding) as similarity
  from public.rag_chunks c
  where c.corpus = match_corpus
    and (filter_client is null or (c.metadata->>'client') = filter_client)
    and (filter_channel is null or (c.metadata->>'channel') = filter_channel)
    and (filter_platform is null or (c.metadata->>'platform') = filter_platform)
    and (filter_date_from is null or (c.metadata->>'date') >= filter_date_from)
    and (filter_date_to is null or (c.metadata->>'date') <= filter_date_to)
    and (filter_tags is null or (c.metadata->'tags') ?| filter_tags)
  order by c.embedding operator(public.<=>) query_embedding
  limit match_count;
$$;
