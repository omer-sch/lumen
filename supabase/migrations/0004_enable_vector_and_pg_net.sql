-- Applied to lumen-dev (puzdgqqkksegefcrzege) as migration
-- version 20260515154038 via Supabase MCP on 2026-05-15.
-- Enables pgvector (HNSW + IVF) and pg_net (async HTTP, used by the
-- history-index trigger to call back into the Lumen API).

create extension if not exists vector;
create extension if not exists pg_net;
