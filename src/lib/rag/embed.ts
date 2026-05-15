import "server-only";

import OpenAI from "openai";

import { serverEnv } from "@/lib/env.server";

// OpenAI text-embedding-3-large truncated to 1536 dimensions via MRL.
// 1536 matches the rag_chunks.embedding column type; if the column
// changes, change MODEL and DIM together and re-embed the corpus. Cost
// is $0.13 / 1M tokens as of 2026-05.

const MODEL = "text-embedding-3-large";
const DIM = 1536;
const COST_PER_1M_TOKENS = 0.13;
const MAX_RETRIES = 2;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const key = serverEnv.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY not set; embed() requires it.");
  }
  _client = new OpenAI({ apiKey: key });
  return _client;
}

// Test seam: tests inject a fake client; resetting to null forces
// re-creation on next call. Not part of the public API.
export function __setOpenAIClientForTesting(client: OpenAI | null): void {
  _client = client;
}

export type EmbedResult = {
  vector: number[];
  tokens: number;
  cost_usd: number;
};

export type EmbedBatchResult = {
  vectors: number[][];
  total_tokens: number;
  total_cost_usd: number;
};

function isRetryable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as { status?: number }).status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(op: () => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) throw err;
      const base = 200 * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 100);
      await sleep(base + jitter);
    }
  }
  throw lastErr;
}

export async function embed(text: string): Promise<EmbedResult> {
  const batch = await embedBatch([text]);
  return {
    vector: batch.vectors[0] ?? [],
    tokens: batch.total_tokens,
    cost_usd: batch.total_cost_usd,
  };
}

export async function embedBatch(texts: string[]): Promise<EmbedBatchResult> {
  if (texts.length === 0) {
    return { vectors: [], total_tokens: 0, total_cost_usd: 0 };
  }
  const response = await withRetry(() =>
    getClient().embeddings.create({
      model: MODEL,
      input: texts,
      dimensions: DIM,
    }),
  );
  const vectors = response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
  const total_tokens = response.usage?.total_tokens ?? 0;
  const total_cost_usd = (total_tokens * COST_PER_1M_TOKENS) / 1_000_000;
  return { vectors, total_tokens, total_cost_usd };
}

export const __embedConfigForTesting = {
  MODEL,
  DIM,
  COST_PER_1M_TOKENS,
  MAX_RETRIES,
} as const;
