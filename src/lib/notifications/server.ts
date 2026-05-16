import "server-only";

import { supabaseAdmin } from "@/lib/db/client";

// In-app notification store. Hermes runs (Gmail-triggered) and watch
// failures land here; the bell in the topbar reads from here.

export type NotificationKind =
  | "hermes_draft_ready"
  | "hermes_run_failed"
  | "gmail_watch_failed"
  | "gmail_connected";

export type NotificationRow = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toRow(row: {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}): NotificationRow {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at ? new Date(row.read_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export async function pushNotification(args: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<NotificationRow> {
  const { data, error } = await supabaseAdmin()
    .from("notifications")
    .insert({
      user_id: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body ?? null,
      link: args.link ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`pushNotification: ${error?.message ?? "no row"}`);
  }
  return toRow(data);
}

export async function listNotifications(
  userId: string,
  limit = 20,
): Promise<NotificationRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listNotifications: ${error.message}`);
  return (data ?? []).map(toRow);
}

export async function countUnread(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw new Error(`countUnread: ${error.message}`);
  return count ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw new Error(`markAllRead: ${error.message}`);
}
