import "server-only";

import { supabaseAdmin } from "./client";
import type { Json } from "./types";
import type { Answer } from "@/lib/ask/types";

/** Payload accepted by POST /api/ask/history. The client posts the
 *  whole Answer (plus optional date-range context) so we can rebuild
 *  the full card later without re-running askLumen(). */
export type AskHistoryInput = {
  answer: Answer;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  clientId?: string | null;
  language?: "en" | "he";
};

export async function recordAskQuery(
  userId: string,
  input: AskHistoryInput,
): Promise<{ id: string }> {
  const sb = supabaseAdmin();
  const { answer } = input;
  const { data, error } = await sb
    .from("ask_queries")
    .insert({
      user_id: userId,
      query_text: answer.question,
      language: input.language ?? "en",
      date_range_start: input.dateRangeStart ?? null,
      date_range_end: input.dateRangeEnd ?? null,
      client_id: input.clientId ?? null,
      answered_by: answer.answeredBy ?? "aria",
      chart_type: answer.config.kind,
      // The PinnedConfig union is serialisable; round-trip through JSON
      // to satisfy the Json type without losing fidelity.
      chart_config_json: JSON.parse(JSON.stringify(answer.config)) as Json,
      result_json: JSON.parse(JSON.stringify(answer)) as Json,
    })
    .select("id")
    .single();

  if (error) throw new Error(`[db/ask] record: ${error.message}`);
  return { id: data.id };
}

export async function listAskQueries(
  userId: string,
  limit = 20,
): Promise<{ id: string; askedAt: number; answer: Answer }[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("ask_queries")
    .select("id, created_at, result_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[db/ask] list: ${error.message}`);

  return (data ?? [])
    .filter((r) => r.result_json != null)
    .map((r) => ({
      id: r.id,
      askedAt: new Date(r.created_at).getTime(),
      // result_json holds the full Answer captured at write time.
      answer: r.result_json as unknown as Answer,
    }));
}
