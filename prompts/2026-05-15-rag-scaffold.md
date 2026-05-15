# RAG Scaffold for Lumen (Hermes v1 first user)

Date: 2026-05-15
Status: ready to execute
Depends on: Supabase setup prompt (`prompts/2026-05-12-supabase-db-setup.md`) must land first, or this prompt initializes the pieces it touches.
Follow-up: `prompts/2026-05-15-hermes-langgraph.md` (uses `retrieve()` at every node)

---

## Goal

Build the RAG foundation for Lumen agents. After this PR, any agent can call:

```ts
const { chunks, citations } = await retrieve({
  corpus: "knowledge",
  query: "GlobalComix Meta CPA D7 history",
  filters: { client: "globalcomix" },
  k: 10,
});
```

…and get cited chunks back. Hermes v1 wires its `parse_intent`, `Analyze`, and `Quill` nodes to the right corpora as the first real integration. Knowledge and History corpora ship populated in this PR; Comms ships as a typed shell that lights up when Gmail OAuth lands.

---

## Why now

1. **Agents need institutional context.** Today no Lumen agent knows what last week's headline story was, what playbook applies to a gaming app vs a subscription comics app, or how Emily at GlobalComix usually phrases requests. Without RAG, every run starts from zero.
2. **The Knowledge page is in the IA but has no engine.** The page is supposed to surface "patterns Lumen has learned", connected sources, and internal knowledge. RAG is what makes it real.
3. **Future agents are blocked on the same primitive.** Build this once, well; reuse forever.

---

## Architecture decisions (already made, do not re-litigate)

- **Storage.** Supabase pgvector. One physical table `rag_chunks`, namespaced by a `corpus` column. Dev project: `lumen-dev` (ref `puzdgqqkksegefcrzege`).
- **Embedding model.** OpenAI `text-embedding-3-large` truncated to 1536 dimensions via MRL. $0.13 per 1M tokens. Matrix and rationale in section 4.
- **Embedding wrapper.** Single `embed()` function so swapping providers later is a one-line change.
- **Index.** HNSW with `m=16, ef_construction=64`. Not ivfflat. pgvector >= 0.7 pre-filters metadata before ANN, which preserves recall with HNSW.
- **Retrieval.** Hybrid: btree / JSONB expression pre-filter, then ANN on the filtered subset. Top-k default 10.
- **Citations required.** Every retrieved chunk carries `source_path` + `chunk_id`. Quill and Analyze must attach these to any claim grounded in retrieved text.
- **No reranker in v0.** Hybrid + k=10 is good enough. Add Cohere rerank in v2 only if retrieval quality becomes the bottleneck.
- **No queue in v0.** Direct API routes + Vercel cron. Move to pgmq when volume justifies it.
- **Auth on retrieve().** Server-side only; service-role key. Per-user filtering happens in agent code via the `filters` argument.
- **Comms corpus.** Typed ingester shell ships here; Gmail backfill is a separate workstream behind Gmail OAuth.

---

## What this PR ships

1. pgvector extension enabled and `rag_chunks` table created on `lumen-dev` with HNSW + JSONB expression btree indices.
2. `embed()` wrapper at `src/lib/rag/embed.ts` (OpenAI provider, swappable).
3. `retrieve()` tool at `src/lib/rag/retrieve.ts` any agent can import.
4. Knowledge corpus indexer + initial backfill script from the Lumen Vault.
5. History corpus auto-write trigger from `agent_runs` (via Supabase `pg_net`).
6. Comms corpus typed ingester shell (no Gmail dependency).
7. Three indexing entry points: `POST /api/rag/index` (manual), Supabase trigger (on agent_runs), Vercel cron at `0 5 UTC` daily (Knowledge re-scan).
8. Admin UI on the Knowledge page: corpus browser, manual reindex button, "patterns learned" preview seeded from History.
9. Unit tests + 1 integration test + 1 e2e spec.

---

## (1) Supabase schema

Migration file: `supabase/migrations/20260515_rag_scaffold.sql`

```sql
create extension if not exists vector;

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
```

**Why HNSW over ivfflat.** HNSW is faster on queries, more accurate at default settings, requires no `ANALYZE` step, and pgvector >= 0.7 handles metadata pre-filter without losing recall. At our scale (<100k chunks for the foreseeable future), HNSW's higher build cost is negligible. ivfflat would only win past low millions of chunks.

**Why expression btrees on JSONB.** The common filter fields (`client`, `channel`, `platform`, `date`) live inside `metadata`. Expression btree indices on `(metadata->>'client')` are faster for equality lookups than a single GIN and avoid GIN's storage overhead. One btree per high-cardinality filter field.

**Why one table.** Namespacing by a `corpus` column with a btree means we get all the cost upside of single-table maintenance (one index to tune, one set of stats, one RLS policy) and zero cost on query selectivity since the corpus filter cuts the search space by 4x in the worst case.

---

## (2) Indexer

Three trigger modes. All write to `rag_chunks` through the same chunker.

### 2a. Manual indexer route

File: `src/app/api/rag/index/route.ts`

```
POST /api/rag/index
Body:
  {
    corpus: "knowledge" | "history" | "comms",
    source_path: string,
    content: string,
    metadata?: Record<string, unknown>
  }
Auth: admin only (LUMEN_ADMIN_USER_IDS allowlist, same pattern as /api/cache/refresh)
Response:
  {
    chunks_indexed: number,
    embedding_tokens: number,
    cost_usd: number
  }
```

Logic: validate via Zod, chunk the content (see chunking below), call `embed()` per chunk, upsert by `(corpus, source_path, chunk_id)` (idempotent on re-runs of the same content).

### 2b. On-create Supabase trigger (History corpus)

Migration: `supabase/migrations/20260515_history_index_trigger.sql`

```sql
create or replace function public.queue_history_index()
returns trigger as $$
declare
  payload jsonb;
begin
  if NEW.status = 'completed' and NEW.output is not null then
    payload := jsonb_build_object(
      'agent', NEW.agent,
      'run_id', NEW.id,
      'output', NEW.output,
      'metadata', jsonb_build_object(
        'client', NEW.client,
        'completed_at', NEW.completed_at
      )
    );
    perform net.http_post(
      url := current_setting('lumen.app_url') || '/api/rag/index-history',
      body := payload,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('lumen.cron_secret')
      )
    );
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger agent_runs_history_index
  after insert or update on public.agent_runs
  for each row execute function public.queue_history_index();
```

The receiving route at `src/app/api/rag/index-history/route.ts` reads the agent output, chunks the bullets / findings, calls `embed()`, and upserts into the History corpus. Requires the same `CRON_SECRET` Bearer auth as `/api/cron/warm-cache`.

Two Supabase GUCs to set once:

```sql
alter database postgres set lumen.app_url    to 'https://lumen.yellowhead.com';
alter database postgres set lumen.cron_secret to '<same value as CRON_SECRET in Vercel>';
```

### 2c. Vercel cron (Knowledge re-scan)

`vercel.json` addition:

```json
{
  "crons": [
    { "path": "/api/cron/warm-cache",            "schedule": "0 6,18 * * *" },
    { "path": "/api/cron/rag-reindex-knowledge", "schedule": "0 5 * * *" }
  ]
}
```

File: `src/app/api/cron/rag-reindex-knowledge/route.ts`. Reads a manifest checked into the repo (`src/lib/rag/manifests/knowledge.json`) that lists vault note paths to index. For each entry, compares the file content hash against the latest indexed `chunk_id` prefix in the table; embeds and upserts anything new or changed. Logs a summary to the admin run log.

### 2d. Chunking

File: `src/lib/rag/chunk.ts`

- Markdown-aware: split on `## ` headings first, then on paragraph boundaries.
- Target chunk size: ~512 tokens with ~64 token overlap.
- Token counting via `js-tiktoken` (pure JS, no API call).
- `chunk_id` is deterministic: `${sha256(content).slice(0, 8)}-${index}` so re-indexing the same content upserts without duplication.
- Returns `{ content, chunk_id, tokens, position }` per chunk.

---

## (3) Retriever tool

File: `src/lib/rag/retrieve.ts`

```ts
import { z } from "zod";

export const RetrieveArgs = z.object({
  corpus: z.enum(["knowledge", "history", "comms", "benchmarks"]),
  query: z.string().min(1),
  filters: z
    .object({
      client: z.string().optional(),
      channel: z.string().optional(),
      platform: z.string().optional(),
      date_range: z.tuple([z.string(), z.string()]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .default({}),
  k: z.number().int().min(1).max(50).default(10),
});

export type RetrievedChunk = {
  chunk_id: string;
  source_path: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
};

export type Citation = { source_path: string; chunk_id: string };

export type RetrieveResult = {
  chunks: RetrievedChunk[];
  citations: Citation[];
  total_searched: number;
  latency_ms: number;
  query_embedding_cost_usd: number;
};

export async function retrieve(
  args: z.infer<typeof RetrieveArgs>
): Promise<RetrieveResult>;
```

Implementation sketch:

1. Validate args via Zod (throw on bad input, do not silently coerce).
2. `const vec = await embed(args.query);`
3. Build the WHERE clause from filters:
   - `corpus = $corpus` (always)
   - `(metadata->>'client') = $client` if provided
   - `(metadata->>'channel') = $channel` if provided
   - `(metadata->>'platform') = $platform` if provided
   - `(metadata->>'date') between $from and $to` if `date_range` provided
   - `metadata->'tags' ?| array[$tags]` if `tags` provided
4. ANN query (cosine distance):

```sql
select
  id,
  chunk_id,
  source_path,
  content,
  metadata,
  1 - (embedding <=> $vec) as similarity
from rag_chunks
where [filters]
order by embedding <=> $vec
limit $k;
```

5. Build `citations` from chunks (just `source_path` + `chunk_id`).
6. Return shape above.

**Usage example** (inside Hermes Analyze node):

```ts
const { chunks, citations } = await retrieve({
  corpus: "knowledge",
  query: `${intent.client} ${intent.channels.join(" ")} weekly review playbook`,
  filters: { client: intent.client, tags: ["playbook"] },
  k: 5,
});
```

`embed()` wrapper at `src/lib/rag/embed.ts`:

```ts
export async function embed(text: string): Promise<{
  vector: number[];      // length 1536
  tokens: number;
  cost_usd: number;
}>;

export async function embedBatch(texts: string[]): Promise<{
  vectors: number[][];
  total_tokens: number;
  total_cost_usd: number;
}>;
```

Implements: OpenAI `text-embedding-3-large` with `dimensions: 1536`. Retry x2 with jittered backoff on 429/5xx. Returns cost based on `total_tokens × 0.13 / 1_000_000`.

---

## (4) Embedding-model decision matrix

| Model | Dim | Cost / 1M tokens | MTEB avg | p50 latency | Notes |
|---|---|---|---|---|---|
| **OpenAI text-embedding-3-large** (truncated to 1536) | 1536 (native 3072) | $0.13 | 64.6 | ~80ms | **RECOMMENDED.** Matches schema, MRL truncation principled. |
| OpenAI text-embedding-3-small | 1536 | $0.02 | 62.3 | ~60ms | Cheapest at 1536 dim. Quality gap small for our hybrid setup. Acceptable fallback. |
| Voyage 3 | 1024 | $0.18 | 65.3 | ~100ms | Highest MTEB. Requires schema change to `vector(1024)`. Anthropic-aligned partner. |
| Voyage 3 lite | 512 | $0.06 | 62.8 | ~60ms | Cheapest Voyage. Schema change required. |
| Cohere embed-english-v3 | 1024 | $0.10 | 64.5 | ~90ms | Strong. Schema change required. |
| nomic-embed-text-v1.5 | 768 | self-host | 62.4 | varies | Open source. Ops cost > API cost at our scale. Reject. |

**Pick: OpenAI text-embedding-3-large @ 1536 dim.**

Rationale:

1. The schema dimension (1536) was specified upstream; MRL truncation from native 3072 is the principled way to land there.
2. MTEB 64.6 is competitive with the top model (Voyage 3 at 65.3); 0.7 points is not material for our hybrid retrieval.
3. Cost $0.13 / 1M tokens is negligible at projected v0 scale (see ceiling below).
4. OpenAI's embedding API is mature, multi-region, well-rate-limited. Voyage is newer infrastructure.
5. Easy to swap: the `embed()` wrapper hides the provider. If Voyage's quality lead matters later, swap one file and re-embed.

**v0 cost ceiling.**

- Knowledge backfill: ~1M tokens × $0.13 = **$0.13**
- History backfill (existing agent_runs): ~200k tokens × $0.13 = **$0.03**
- Query traffic (10k tokens / day): **$0.0013 / day**
- Total month 1 < **$1**.

Add `OPENAI_API_KEY` to `.env.local`, `.env.local.example`, and Vercel (dev + prod).

---

## (5) Hermes v1 wired to Comms corpus (first integration)

### 5a. Comms ingester shell

File: `src/lib/rag/indexers/comms.ts`

```ts
export type CommsThread = {
  client: string;
  thread_id: string;
  subject: string;
  participants: Array<{ name: string; email: string }>;
  messages: Array<{
    from: string;
    to: string[];
    sent_at: string;  // ISO
    body: string;
  }>;
};

export async function indexCommsThread(
  thread: CommsThread
): Promise<{ chunks_indexed: number }>;
```

The shell:

- Chunks per message, prefixing each chunk with thread subject + participant context.
- Extracts metadata: `client`, `from`, `to`, `sent_at`, `thread_id`, `subject`.
- Upserts via the same path as the manual indexer.

When Gmail OAuth lands, the OAuth callback writes new threads to this function. For v0 the function is callable and unit-tested but no caller exists; the Comms corpus stays empty in production until v1.

### 5b. Hermes parse_intent calls Comms

File: `src/lib/agents/hermes/nodes/parse-intent.ts`

Before the Haiku `extract_intent` call, retrieve from Comms filtered by sender's client:

```ts
const commsContext = await retrieve({
  corpus: "comms",
  query: emailText,
  filters: { client: detectedClient ?? "" },
  k: 5,
});

const prompt = buildParsePrompt({
  emailText,
  commsContext: commsContext.chunks,
});
```

If Comms is empty (v0), `chunks: []` is returned; the prompt falls back to no-past-phrasing form. No special-casing required in the agent.

### 5c. Hermes Analyze calls Knowledge + History (parallel)

File: `src/lib/agents/hermes/nodes/analyze.ts`

```ts
const [playbooks, priorFindings] = await Promise.all([
  retrieve({
    corpus: "knowledge",
    query: `${intent.client} ${intent.channels.join(" ")} playbook`,
    filters: { tags: ["playbook"] },
    k: 5,
  }),
  retrieve({
    corpus: "history",
    query: `${intent.client} ${intent.channels.join(" ")} findings`,
    filters: { client: intent.client },
    k: 10,
  }),
]);

const findings = await analyzeWithSonnet({
  intent,
  dataSnapshot,
  anomalies,
  playbooks: playbooks.chunks,
  priorFindings: priorFindings.chunks,
});

findings.forEach((f) => {
  f.citations = [
    ...(f.citations ?? []),
    ...playbooks.citations,
    ...priorFindings.citations,
  ];
});
```

### 5d. Hermes Quill calls History (tone matching)

File: `src/lib/agents/hermes/nodes/quill.ts`

```ts
const toneRefs = await retrieve({
  corpus: "history",
  query: `${intent.client} ${intent.channels.join(" ")} bullets`,
  filters: {
    client: intent.client,
    channel: intent.channels[0],
    date_range: [threeWeeksAgoISO, todayISO],
  },
  k: 6,
});

const bullets = await draftWithSonnet({
  findings,
  toneRefs: toneRefs.chunks,
});
```

---

## File-level changes

New files:

- `supabase/migrations/20260515_rag_scaffold.sql`
- `supabase/migrations/20260515_history_index_trigger.sql`
- `src/lib/rag/embed.ts`
- `src/lib/rag/retrieve.ts`
- `src/lib/rag/chunk.ts`
- `src/lib/rag/indexers/knowledge.ts`
- `src/lib/rag/indexers/history.ts`
- `src/lib/rag/indexers/comms.ts`
- `src/lib/rag/manifests/knowledge.json`
- `src/app/api/rag/index/route.ts`
- `src/app/api/rag/index-history/route.ts`
- `src/app/api/cron/rag-reindex-knowledge/route.ts`
- `scripts/backfill-knowledge-corpus.mjs`
- `tests/unit/lib/rag/chunk.test.ts`
- `tests/unit/lib/rag/retrieve.test.ts`
- `tests/unit/lib/rag/embed.test.ts`
- `tests/unit/lib/rag/indexers/comms.test.ts`
- `tests/integration/rag.test.ts`
- `tests/e2e/knowledge-corpus.spec.ts`

Modified files:

- `vercel.json` (cron entry)
- `.env.local.example` (OPENAI_API_KEY)
- `src/lib/env.server.ts` (validate OPENAI_API_KEY)
- `src/app/(app)/knowledge/page.tsx` (corpus browser + reindex)
- `src/lib/agents/hermes/nodes/parse-intent.ts`
- `src/lib/agents/hermes/nodes/analyze.ts`
- `src/lib/agents/hermes/nodes/quill.ts`

Estimated diff: +1500 / -50 lines.

---

## Env vars

Add to `.env.local`, `.env.local.example`, and Vercel (dev + prod):

```
OPENAI_API_KEY=
```

Set once in Supabase (via SQL editor):

```sql
alter database postgres set lumen.app_url     to 'https://lumen.yellowhead.com';
alter database postgres set lumen.cron_secret to '<CRON_SECRET from Vercel>';
```

---

## Tests

### Unit

- `chunk.test.ts`: markdown-aware splitting, deterministic chunk_ids, ~512 ± 64 token budget, overlap behavior.
- `embed.test.ts`: provider abstraction, error handling, retry, cost accounting. Mock the OpenAI client.
- `retrieve.test.ts`: arg validation (Zod), filter SQL building, citation extraction, empty-corpus behavior, k bounds.
- `comms.test.ts`: thread shape validation, metadata extraction, idempotent upsert.

### Integration

- `tests/integration/rag.test.ts` against a test Supabase project (or a dockerized pgvector). Index 5 known docs, query each, assert top-1 is the right doc, assert filter pre-filter behavior (zero recall when filter excludes the target).

### E2E

- `tests/e2e/knowledge-corpus.spec.ts`: signed-in admin opens `/knowledge`, sees corpus stats, clicks "Reindex Knowledge", sees the run row in the admin log, queries from the search input, sees cited chunks render with `source_path`.

Threshold bumps: raise vitest coverage floor on statements/lines by 0.5pp (or whatever the new `src/lib/rag/*` actually delivers; report back and we'll adjust).

---

## Verification steps

After the code lands, run these in order. Stop and surface a failure if any step misbehaves.

1. `npm run typecheck` passes with no errors.
2. `npm test` passes including the new tests; coverage on `src/lib/rag/*` is >= 80%.
3. `supabase db push` applies both migrations cleanly. No warnings.
4. `select extname from pg_extension where extname = 'vector';` returns one row.
5. `\d+ rag_chunks` in psql shows the HNSW index and all 5 btree indices.
6. Set `OPENAI_API_KEY` locally. Run `node scripts/backfill-knowledge-corpus.mjs`. Confirm `select corpus, count(*) from rag_chunks group by corpus;` reports knowledge = N where N matches the vault note count rounded up by chunk count.
7. From a node repl: `import { retrieve } from "@/lib/rag/retrieve"; await retrieve({ corpus: "knowledge", query: "GlobalComix pilot", k: 3 });`. Confirm chunks come back with sane similarity scores (top hit > 0.7) and citations populated.
8. Open `/knowledge` signed in as admin. Confirm corpus browser shows `knowledge: N, history: 0, comms: 0`.
9. Trigger a Hermes run end to end against a pasted GlobalComix email. Confirm the run trace shows `retrieve()` calls at parse_intent (empty results, Comms is empty in v0), Analyze (non-empty Knowledge + History results), and Quill (non-empty History tone refs).
10. Confirm the new cron entry appears in Vercel project settings → Crons.

Report back with a screenshot or text dump of step 8 and step 9 for the green light.

---

## Out of scope

- Gmail OAuth. Comms ingester ships callable; lights up in v1.
- Cohere or any reranker. Add in v2 if quality drops.
- pgmq queue. Direct API + cron suffices for v0.
- Per-user RLS on `retrieve()`. Server-side only; per-user filtering happens in agent code.
- Multi-tenant beyond client filter. Single yellowHEAD instance.
- Streaming embedding responses. Batch is fine.
- Anomstack deterministic detectors (lives inside Analyze; separate workstream).
- The full LangGraph runtime for Hermes (`prompts/2026-05-15-hermes-langgraph.md`, depends on this PR).
- Reports PPTX slide-layout fix and visual report agent. Those are independent and already in flight.

---

## Acceptance criteria

- [ ] Migrations applied; `rag_chunks` exists with HNSW + 5 btree indices + RLS.
- [ ] Knowledge corpus indexed from the Lumen Vault (>= 50 chunks).
- [ ] `retrieve()` returns cited chunks for at least 3 hand-tested queries with top similarity > 0.7.
- [ ] History corpus auto-writes when an `agent_runs` row completes (verified via one manual Nova run).
- [ ] Comms ingester is callable from a unit test with a fake thread; no Gmail dependency in the test.
- [ ] Vercel cron entry exists; one successful manual run of `/api/cron/rag-reindex-knowledge` recorded in the admin log.
- [ ] Knowledge page admin UI shows corpus stats and supports manual reindex.
- [ ] Hermes `parse_intent`, `Analyze`, and `Quill` nodes call `retrieve()` at the right step and degrade gracefully when corpora are empty.
- [ ] Total embed cost for the backfill is < $1, reported in the PR description.
- [ ] Status.md "In flight" gets a new entry; Decisions.md gets the embedding-model and HNSW choices logged.

---

## Notes for the implementer

- If you find that OpenAI rate limits bite during the Knowledge backfill, batch embeddings up to the API's per-call limit (default 2048 inputs / call). Do not slow-roll one-at-a-time.
- If you see the HNSW pre-filter degrade recall when the client filter is highly selective (e.g. only 50 chunks match), raise `hnsw.ef_search` for that query path (`set local hnsw.ef_search = 80;` before the SELECT). Default 40 is fine for most cases.
- If a vault note is unusually long (>10k tokens), the chunker will produce many chunks. That's fine. Do not skip them.
- If you discover something the embedding matrix above missed (new Voyage release, OpenAI pricing change, surprise rate limit), surface it in the PR description before committing rather than silently swapping models. Re-embedding the whole store costs another $0.13 / 1M tokens; pick once and commit.
