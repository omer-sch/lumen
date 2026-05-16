import "server-only";

import { supabaseAdmin } from "@/lib/db/client";

import { startWatch, stopWatch } from "./api";

// Watch registration. Each user gets at most one active watch (Gmail
// enforces this); the row in gmail_watches tracks current history_id
// and expiration so the cron knows when to re-register.

export type WatchRow = {
  userId: string;
  historyId: string;
  expiresAt: Date;
  status: "active" | "failed";
  failureReason: string | null;
};

function toRow(row: {
  user_id: string;
  history_id: string;
  expires_at: string;
  status: string;
  failure_reason: string | null;
}): WatchRow {
  return {
    userId: row.user_id,
    historyId: row.history_id,
    expiresAt: new Date(row.expires_at),
    status: row.status === "failed" ? "failed" : "active",
    failureReason: row.failure_reason,
  };
}

export async function registerWatch(userId: string): Promise<WatchRow> {
  let res;
  try {
    res = await startWatch(userId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markWatchFailed(userId, reason).catch(() => {});
    throw new Error(`registerWatch: ${reason}`);
  }

  const expiresAt = new Date(parseInt(res.expiration, 10));
  const { data, error } = await supabaseAdmin()
    .from("gmail_watches")
    .upsert(
      {
        user_id: userId,
        history_id: res.historyId,
        expires_at: expiresAt.toISOString(),
        status: "active",
        failure_reason: null,
        registered_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id, history_id, expires_at, status, failure_reason")
    .single();
  if (error || !data) {
    throw new Error(
      `registerWatch.persist: ${error?.message ?? "no row returned"}`,
    );
  }
  return toRow(data);
}

export async function loadWatch(userId: string): Promise<WatchRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("gmail_watches")
    .select("user_id, history_id, expires_at, status, failure_reason")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`loadWatch: ${error.message}`);
  return data ? toRow(data) : null;
}

export async function setWatchHistoryId(
  userId: string,
  historyId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("gmail_watches")
    .update({ history_id: historyId })
    .eq("user_id", userId);
  if (error) throw new Error(`setWatchHistoryId: ${error.message}`);
}

export async function markWatchFailed(
  userId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("gmail_watches")
    .update({
      status: "failed",
      failure_reason: reason.slice(0, 500),
    })
    .eq("user_id", userId);
  if (error) throw new Error(`markWatchFailed: ${error.message}`);
}

export async function stopAndDeleteWatch(userId: string): Promise<void> {
  // Best-effort stop on Google's side; if it errors (token revoked,
  // already stopped) we still drop the row.
  await stopWatch(userId).catch(() => {});
  const { error } = await supabaseAdmin()
    .from("gmail_watches")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`stopAndDeleteWatch: ${error.message}`);
}

// Returns watches that need re-registration within the next N hours.
// The cron job (chunk C5 of the spec) calls this once a day.
export async function listExpiringWatches(
  withinHours: number,
): Promise<WatchRow[]> {
  const threshold = new Date(Date.now() + withinHours * 3600 * 1000);
  const { data, error } = await supabaseAdmin()
    .from("gmail_watches")
    .select("user_id, history_id, expires_at, status, failure_reason")
    .eq("status", "active")
    .lte("expires_at", threshold.toISOString());
  if (error) throw new Error(`listExpiringWatches: ${error.message}`);
  return (data ?? []).map(toRow);
}
