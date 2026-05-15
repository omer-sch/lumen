import "server-only";

import { supabaseAdmin } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

// Scoped slice memory for agents. Backed by agent_memory_kv: each row
// is (scope, slice, payload, created_at). Append-only; recallSlices
// returns the newest N for a (scope, slice) tuple. Hermes' Quill uses
// this to remember the last 3 weeks of bullets for a given
// (quill, client). Distinct from agent_memory, which is rule learning
// for Aria.

export async function rememberSlice(
  scope: string,
  slice: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("agent_memory_kv")
    .insert({
      scope,
      slice,
      payload: payload as Json,
    });
  if (error) {
    throw new Error(`rememberSlice failed: ${error.message}`);
  }
}

export type RecalledSlice = {
  payload: Record<string, unknown>;
  created_at: string;
};

export type RecallOptions = {
  /** Most recent N entries. Default 10. */
  limit?: number;
};

export async function recallSlices(
  scope: string,
  slice: string,
  options: RecallOptions = {},
): Promise<RecalledSlice[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_memory_kv")
    .select("payload, created_at")
    .eq("scope", scope)
    .eq("slice", slice)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 10);
  if (error) {
    throw new Error(`recallSlices failed: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    created_at: row.created_at,
  }));
}

export async function listSlices(scope: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_memory_kv")
    .select("slice")
    .eq("scope", scope);
  if (error) {
    throw new Error(`listSlices failed: ${error.message}`);
  }
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (row.slice) seen.add(row.slice);
  }
  return Array.from(seen).sort();
}
