import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { getContactsForClient } from "@/lib/contacts";
import { isGmailConfigured, serverEnv } from "@/lib/env.server";
import { seedDefaultFiltersForUser } from "@/lib/email-filters";
import {
  decodeIdTokenEmail,
  exchangeCodeForTokens,
  GMAIL_SCOPES,
} from "@/lib/gmail/oauth";
import { saveGmailTokens } from "@/lib/gmail/tokens";
import { registerWatch } from "@/lib/gmail/watch";
import { pushNotification } from "@/lib/notifications/server";

export const runtime = "nodejs";

function backToSettings(message: string, status: "ok" | "error" = "ok") {
  const url = new URL(
    `${serverEnv.LUMEN_APP_URL}/settings/integrations`,
  );
  url.searchParams.set(status === "ok" ? "ok" : "err", message);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

// OAuth callback. Validates the state param matches the signed-in
// Clerk user (defense against CSRF / state forgery), exchanges the
// code for tokens, stores them encrypted, registers the watch, seeds
// default filters from the user's known contacts. Always redirects
// back to /settings/integrations with a status query param.
export async function GET(req: NextRequest) {
  if (!isGmailConfigured()) {
    return backToSettings("not_configured", "error");
  }
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    // Stale session; bounce to sign-in with the callback url so we
    // pick up the same code on the way back.
    const next = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(`/sign-in?next=${next}`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return backToSettings(oauthError.slice(0, 64), "error");
  }
  if (!code || !state) {
    return backToSettings("missing_code_or_state", "error");
  }
  if (state !== clerkUserId) {
    return backToSettings("state_mismatch", "error");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only returns refresh_token on first consent. We forced
      // prompt=consent in /start so this should always be present;
      // surface clearly if not.
      return backToSettings("no_refresh_token", "error");
    }
    const email =
      decodeIdTokenEmail(tokens.id_token ?? "") ?? "(unknown)";
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await saveGmailTokens({
      userId: clerkUserId,
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope ?? GMAIL_SCOPES,
    });

    // Seed filters from the GlobalComix contact domains (single-client
    // demo today; once multi-client lands the seed pulls from the user's
    // allowed client set).
    try {
      const contacts = await getContactsForClient("globalcomix");
      await seedDefaultFiltersForUser(
        clerkUserId,
        contacts.map((c) => c.email),
      );
    } catch (err) {
      console.warn({
        event: "gmail.callback.seed_filters_failed",
        userId: clerkUserId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Register the watch. If it fails (Pub/Sub not configured, IAM
    // missing), we still keep the tokens but mark the watch failed so
    // the user sees the issue in /settings/integrations.
    try {
      await registerWatch(clerkUserId);
    } catch (err) {
      console.error({
        event: "gmail.callback.watch_failed",
        userId: clerkUserId,
        error: err instanceof Error ? err.message : String(err),
      });
      await pushNotification({
        userId: clerkUserId,
        kind: "gmail_watch_failed",
        title: "Gmail connected but watch did not register",
        body: "Check Pub/Sub topic + IAM bindings in GCP.",
        link: "/settings/integrations",
      }).catch(() => {});
      return backToSettings("watch_failed", "error");
    }

    await pushNotification({
      userId: clerkUserId,
      kind: "gmail_connected",
      title: `Gmail connected (${email})`,
      body: "Hermes will draft reports when client emails arrive.",
      link: "/settings/integrations",
    }).catch(() => {});

    return backToSettings("connected", "ok");
  } catch (err) {
    console.error({
      event: "gmail.callback.exchange_failed",
      userId: clerkUserId,
      error: err instanceof Error ? err.message : String(err),
    });
    return backToSettings("exchange_failed", "error");
  }
}
