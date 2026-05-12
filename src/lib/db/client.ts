import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/db/types";

// Server-side singleton. Uses the service-role key, which bypasses RLS —
// so every call site MUST be inside an API route, server component, or
// other server-only context. The "server-only" import above is the
// belt-and-braces guard against accidental client bundling.
//
// The client is cached on globalThis so Next's dev HMR doesn't churn
// connections on every reload. Production builds get a fresh client at
// boot (globalThis is a single instance per server process).

type GlobalWithSupabase = typeof globalThis & {
  __lumenSupabase?: SupabaseClient<Database>;
};

const globalForSupabase = globalThis as GlobalWithSupabase;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (globalForSupabase.__lumenSupabase) {
    return globalForSupabase.__lumenSupabase;
  }

  const url = serverEnv.SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL — set it in .env.local before calling supabaseAdmin().",
    );
  }
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — set it in .env.local before calling supabaseAdmin().",
    );
  }

  const client = createClient<Database>(url, key, {
    auth: {
      // Service-role client doesn't need session persistence or token
      // refresh — it's not a user session, it's an admin connection.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  globalForSupabase.__lumenSupabase = client;
  return client;
}
