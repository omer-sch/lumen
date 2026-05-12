import "server-only";

import { supabaseAdmin } from "./client";
import type { Json } from "./types";
import type { PinnedConfig, PinnedTile } from "@/lib/pins/types";

/** Input the API route accepts when the client pins a new tile.
 *  Mirrors what usePinnedTiles already passed to its mock store. */
export type IncomingPin = {
  label?: string;
  question?: string;
  config: PinnedConfig;
  source?: "ask" | "ai_dashboard";
  sourceQueryId?: string | null;
};

export async function listPinsForUser(userId: string): Promise<PinnedTile[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("pinned_tiles")
    .select("id, user_id, title, question, chart_config_json, created_at, source_query_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[db/pins] list: ${error.message}`);

  return (data ?? []).map((r) => rowToTile(r));
}

export async function addPinForUser(
  userId: string,
  input: IncomingPin,
): Promise<PinnedTile> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("pinned_tiles")
    .insert({
      user_id: userId,
      title: input.label ?? input.question ?? "Pinned view",
      question: input.question ?? null,
      source: input.source ?? "ask",
      source_query_id: input.sourceQueryId ?? null,
      // PinnedConfig is a serialisable structural union — round-trip
      // through JSON to satisfy the Json type without losing fidelity.
      chart_config_json: JSON.parse(JSON.stringify(input.config)) as Json,
    })
    .select("id, user_id, title, question, chart_config_json, created_at, source_query_id")
    .single();

  if (error) throw new Error(`[db/pins] add: ${error.message}`);
  return rowToTile(data);
}

export async function removePinForUser(
  userId: string,
  pinId: string,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("pinned_tiles")
    .delete()
    .eq("user_id", userId)
    .eq("id", pinId);

  if (error) throw new Error(`[db/pins] remove: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────

function rowToTile(row: {
  id: string;
  user_id: string;
  title: string;
  question: string | null;
  chart_config_json: unknown;
  created_at: string;
}): PinnedTile {
  return {
    id: row.id,
    userId: row.user_id,
    pinnedAt: new Date(row.created_at).getTime(),
    label: row.title,
    question: row.question ?? undefined,
    // PinnedConfig is a discriminated union — we trust the row was
    // written through addPinForUser() above (or the seed), which only
    // accepts a valid PinnedConfig. No runtime validation here.
    config: row.chart_config_json as PinnedConfig,
  };
}
