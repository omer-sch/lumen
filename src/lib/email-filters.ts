import "server-only";

import { supabaseAdmin } from "@/lib/db/client";

// User email filters. Hermes only fires when the inbound message's
// sender matches at least one active filter for the recipient.
//
// Filter types:
//   - sender_email: exact match against the From header's address
//   - sender_domain: match the address's domain (e.g. globalcomix.com)
//
// Both are case-insensitive and stored lowercased.

export type EmailFilterType = "sender_email" | "sender_domain";

export type EmailFilter = {
  id: string;
  userId: string;
  filterType: EmailFilterType;
  filterValue: string;
  active: boolean;
};

type Row = {
  id: string;
  user_id: string;
  filter_type: string;
  filter_value: string;
  active: boolean;
};

function toRow(r: Row): EmailFilter {
  return {
    id: r.id,
    userId: r.user_id,
    filterType: r.filter_type as EmailFilterType,
    filterValue: r.filter_value,
    active: r.active,
  };
}

export async function listFiltersForUser(
  userId: string,
): Promise<EmailFilter[]> {
  const { data, error } = await supabaseAdmin()
    .from("user_email_filters")
    .select("id, user_id, filter_type, filter_value, active")
    .eq("user_id", userId)
    .order("filter_type", { ascending: true })
    .order("filter_value", { ascending: true });
  if (error) throw new Error(`listFiltersForUser: ${error.message}`);
  return (data ?? []).map((r) => toRow(r as Row));
}

export async function addFilter(args: {
  userId: string;
  type: EmailFilterType;
  value: string;
}): Promise<EmailFilter> {
  const value = args.value.trim().toLowerCase();
  if (!value) throw new Error("addFilter: empty value");
  if (args.type === "sender_email" && !value.includes("@")) {
    throw new Error("addFilter: sender_email must contain @");
  }
  if (args.type === "sender_domain" && value.includes("@")) {
    throw new Error(
      "addFilter: sender_domain should be the domain, not the address",
    );
  }
  const { data, error } = await supabaseAdmin()
    .from("user_email_filters")
    .upsert(
      {
        user_id: args.userId,
        filter_type: args.type,
        filter_value: value,
        active: true,
      },
      { onConflict: "user_id,filter_type,filter_value" },
    )
    .select("id, user_id, filter_type, filter_value, active")
    .single();
  if (error || !data) {
    throw new Error(`addFilter: ${error?.message ?? "no row"}`);
  }
  return toRow(data as Row);
}

export async function deleteFilter(
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("user_email_filters")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(`deleteFilter: ${error.message}`);
}

export async function toggleFilter(args: {
  userId: string;
  id: string;
  active: boolean;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("user_email_filters")
    .update({ active: args.active })
    .eq("user_id", args.userId)
    .eq("id", args.id);
  if (error) throw new Error(`toggleFilter: ${error.message}`);
}

// Pure matcher: does the sender address match any of the active
// filters? Called by the webhook handler before queueing a Hermes
// run. Empty filter list = no match (default deny).
export function emailMatchesFilters(
  senderEmail: string,
  filters: EmailFilter[],
): boolean {
  const s = senderEmail.trim().toLowerCase();
  if (!s.includes("@")) return false;
  const domain = s.split("@")[1];
  for (const f of filters) {
    if (!f.active) continue;
    if (f.filterType === "sender_email" && f.filterValue === s) return true;
    if (f.filterType === "sender_domain" && f.filterValue === domain) {
      return true;
    }
  }
  return false;
}

// Seed default filters for a user on first Gmail connect: each
// distinct contact domain becomes an active sender_domain filter. The
// user can edit them at /settings/integrations.
export async function seedDefaultFiltersForUser(
  userId: string,
  contactEmails: string[],
): Promise<void> {
  const domains = new Set<string>();
  for (const e of contactEmails) {
    const at = e.lastIndexOf("@");
    if (at > 0) domains.add(e.slice(at + 1).toLowerCase());
  }
  if (domains.size === 0) return;
  const rows = Array.from(domains).map((d) => ({
    user_id: userId,
    filter_type: "sender_domain",
    filter_value: d,
    active: true,
  }));
  const { error } = await supabaseAdmin()
    .from("user_email_filters")
    .upsert(rows, {
      onConflict: "user_id,filter_type,filter_value",
      ignoreDuplicates: true,
    });
  if (error) {
    throw new Error(`seedDefaultFiltersForUser: ${error.message}`);
  }
}
