import "server-only";

import { supabaseAdmin } from "@/lib/db/client";

// Client contact lookup. Used by Hermes parse_intent (to recognise an
// inbound email's sender) and the /agents/hermes profile page (to
// surface "who Hermes knows" for a given client). Service-role read
// path; RLS on client_contacts allows authenticated reads too, but
// every code path that consumes this is server-only.

export type Contact = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string | null;
  isPrimary: boolean;
  notes: string | null;
};

type Row = {
  id: string;
  client_id: string;
  name: string;
  email: string;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
};

function rowToContact(row: Row): Contact {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    email: row.email,
    role: row.role,
    isPrimary: row.is_primary,
    notes: row.notes,
  };
}

// Case-insensitive email lookup. Hermes will normalise inbound
// addresses but a defensive lower() match here means "Emily@..."
// still resolves. Returns null when no contact matches.
export async function getContactByEmail(email: string): Promise<Contact | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await supabaseAdmin()
    .from("client_contacts")
    .select("id, client_id, name, email, role, is_primary, notes")
    .ilike("email", normalized)
    .maybeSingle();
  if (error) {
    throw new Error(`getContactByEmail: ${error.message}`);
  }
  return data ? rowToContact(data as Row) : null;
}

// All contacts for a client, primary first. Used by the profile-page
// Contacts panel and any future contact-picker UI.
export async function getContactsForClient(
  clientId: string,
): Promise<Contact[]> {
  const { data, error } = await supabaseAdmin()
    .from("client_contacts")
    .select("id, client_id, name, email, role, is_primary, notes")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`getContactsForClient: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToContact(r as Row));
}
