import "server-only";

import { serverEnv } from "@/lib/env.server";

// Hand-rolled Google OAuth2 (no googleapis SDK). The Gmail integration
// only needs the auth-code flow + token refresh, both of which are
// single HTTPS calls. Keeping the dep surface small.

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
].join(" ");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function buildRedirectUri(): string {
  return `${serverEnv.LUMEN_APP_URL}/api/auth/gmail/callback`;
}

// State is signed via the Clerk userId so the callback can authenticate
// "this code belongs to this user." A more rigorous implementation
// would HMAC-sign with a server secret to prevent state forgery; for
// v0.5 the userId-in-state plus the requireUser() gate on /start give
// us "the user who started the flow is the user we attribute the
// tokens to" without the extra plumbing.
export function buildAuthUrl(args: {
  state: string;
  promptConsent?: boolean;
}): string {
  const clientId = serverEnv.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildRedirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline", // grants a refresh_token
    include_granted_scopes: "true",
    state: args.state,
  });
  if (args.promptConsent) {
    // Force the consent screen so Google issues a refresh_token even
    // for previously-granted scope sets (otherwise refresh_token is
    // only returned on the first grant).
    params.set("prompt", "consent");
  }
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
};

export async function exchangeCodeForTokens(
  code: string,
): Promise<GoogleTokenResponse> {
  const clientId = serverEnv.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = serverEnv.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client not fully configured");
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: buildRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`OAuth code exchange failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<Omit<GoogleTokenResponse, "refresh_token">> {
  const clientId = serverEnv.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = serverEnv.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client not fully configured");
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`OAuth refresh failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as Omit<GoogleTokenResponse, "refresh_token">;
}

// One-time decode of the id_token's payload (no signature verification
// because the token comes back over TLS from Google's own token
// endpoint; we never accept it from a client). Used to extract the
// connected Gmail address without a profile API call.
export function decodeIdTokenEmail(idToken: string): string | null {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(json) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}
