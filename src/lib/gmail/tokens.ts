import "server-only";

import { supabaseAdmin } from "@/lib/db/client";

import { decryptToken, encryptToken } from "./encryption";
import { GMAIL_SCOPES, refreshAccessToken } from "./oauth";

// Token store. Encrypts at rest (AES-256-GCM, key from env), refreshes
// transparently on read when expired or near-expiry.

export type GmailTokens = {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
};

const REFRESH_SKEW_MS = 60_000; // refresh if within 1 min of expiry

export async function saveGmailTokens(args: {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("gmail_oauth_tokens")
    .upsert(
      {
        user_id: args.userId,
        email: args.email,
        access_token_enc: encryptToken(args.accessToken),
        refresh_token_enc: encryptToken(args.refreshToken),
        expires_at: args.expiresAt.toISOString(),
        scope: args.scope,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    throw new Error(`saveGmailTokens: ${error.message}`);
  }
}

export async function loadGmailTokens(
  userId: string,
): Promise<GmailTokens | null> {
  const { data, error } = await supabaseAdmin()
    .from("gmail_oauth_tokens")
    .select(
      "user_id, email, access_token_enc, refresh_token_enc, expires_at, scope",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`loadGmailTokens: ${error.message}`);
  }
  if (!data) return null;
  return {
    userId: data.user_id,
    email: data.email,
    accessToken: decryptToken(data.access_token_enc),
    refreshToken: decryptToken(data.refresh_token_enc),
    expiresAt: new Date(data.expires_at),
    scope: data.scope,
  };
}

// Returns a valid (non-expired) access token, refreshing in place if
// needed. Throws if no row exists for this user. The caller treats a
// throw as "user needs to reconnect."
export async function getValidAccessToken(userId: string): Promise<{
  accessToken: string;
  email: string;
}> {
  const tokens = await loadGmailTokens(userId);
  if (!tokens) {
    throw new Error(`Gmail not connected for user ${userId}`);
  }
  if (tokens.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    return { accessToken: tokens.accessToken, email: tokens.email };
  }
  // Refresh and persist.
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await saveGmailTokens({
    userId,
    email: tokens.email,
    accessToken: refreshed.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: newExpiresAt,
    scope: refreshed.scope ?? GMAIL_SCOPES,
  });
  return { accessToken: refreshed.access_token, email: tokens.email };
}

export async function deleteGmailTokens(userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("gmail_oauth_tokens")
    .delete()
    .eq("user_id", userId);
  if (error) {
    throw new Error(`deleteGmailTokens: ${error.message}`);
  }
}
