import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/db/client";
import { emailMatchesFilters, listFiltersForUser } from "@/lib/email-filters";
import { isGmailConfigured, serverEnv } from "@/lib/env.server";
import {
  extractHeader,
  extractMessageBody,
  getMessage,
  listHistory,
  parseFromAddress,
} from "@/lib/gmail/api";
import { setWatchHistoryId, loadWatch } from "@/lib/gmail/watch";
import { rateLimit } from "@/lib/rate-limit";
import { buildHermesGraph } from "@/lib/agents/hermes/graph";
import { startRun, completeRun, failRun } from "@/lib/agents/_scaffold/run";
import { pushNotification } from "@/lib/notifications/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Pub/Sub push webhook for Gmail watch events.
//
// Flow:
//   1. Verify the message carries our shared GOOGLE_PUBSUB_VERIFICATION_TOKEN
//      (constant-time compare; guards against replay-from-public-internet).
//   2. Decode the base64-wrapped JSON; extract emailAddress + historyId.
//   3. Resolve the address back to a Clerk userId via gmail_oauth_tokens.
//   4. Pull Gmail history since the last seen historyId; for each
//      newly-added INBOX message that matches the user's active filters,
//      fire a Hermes run inline.
//   5. Update the watch's stored historyId so the next push picks up where
//      we left off.
//   6. Always 200 to Pub/Sub (a 4xx/5xx causes Google to re-deliver, which
//      would re-run Hermes on the same message). Internal failures are
//      logged + surfaced via notifications, not via the response code.
//
// Hermes is run synchronously inside the request because Vercel can keep
// the function warm for up to maxDuration (300s); the full pipeline
// budget is ~30s. A queue-and-ack split is the obvious upgrade if
// volume grows.

type PubSubMessage = {
  message: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

type GmailNotification = {
  emailAddress: string;
  historyId: string | number;
};

function verifyToken(provided: string | undefined): boolean {
  const expected = serverEnv.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function lookupUserByEmail(
  emailAddress: string,
): Promise<string | null> {
  // eq() against the lower(email) index from migration 0015 so
  // `%`/`_` characters in a local-part (legal but rare) cannot expand
  // into a wildcard match and resolve to the wrong user.
  const { data, error } = await supabaseAdmin()
    .from("gmail_oauth_tokens")
    .select("user_id")
    .eq("email", emailAddress.toLowerCase())
    .maybeSingle();
  if (error) {
    console.warn({
      event: "gmail.webhook.lookup_user_failed",
      emailAddress,
      error: error.message,
    });
    return null;
  }
  return data?.user_id ?? null;
}

async function runHermesOnMessage(args: {
  userId: string;
  fromAddress: string;
  body: string;
  messageId: string;
}): Promise<void> {
  const limit = rateLimit(
    `gmail:hermes:${args.userId}`,
    20,
    60 * 60 * 1000,
  );
  if (!limit.allowed) {
    console.warn({
      event: "gmail.webhook.rate_limited",
      userId: args.userId,
      messageId: args.messageId,
    });
    return;
  }
  const run = await startRun({
    agentId: "hermes",
    input: {
      email_text: args.body,
      user_id: args.userId,
      source: "gmail-watch",
      gmail_message_id: args.messageId,
      sender: args.fromAddress,
    },
  });
  try {
    const graph = buildHermesGraph();
    const final = await graph.invoke({
      email_text: args.body,
      run_id: run.id,
      user_id: args.userId,
    });
    await completeRun(run.id, {
      intent: final.intent,
      findings: final.findings,
      bullets: final.bullets,
      deck: final.deck,
      approval: final.approval,
      history: final.history,
    });
    const reportId = final.deck?.report_id ?? null;
    if (reportId) {
      await pushNotification({
        userId: args.userId,
        kind: "hermes_draft_ready",
        title: `Hermes drafted a report for ${final.intent?.client ?? "a client"}`,
        body: `From ${args.fromAddress}. Open to review.`,
        link: `/reports/${reportId}?source=hermes`,
      });
    } else {
      await pushNotification({
        userId: args.userId,
        kind: "hermes_run_failed",
        title: "Hermes finished but did not produce a draft",
        body: `Run ${run.id.slice(0, 8)}. Snapshot or intent missing.`,
        link: `/agents/hermes`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(run.id, message).catch(() => {});
    await pushNotification({
      userId: args.userId,
      kind: "hermes_run_failed",
      title: "Hermes run failed",
      body: message.slice(0, 280),
      link: `/agents/hermes`,
    }).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  if (!isGmailConfigured()) {
    // Still 200 so Google does not back off; we just have nothing to do.
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  let envelope: PubSubMessage;
  try {
    envelope = (await req.json()) as PubSubMessage;
  } catch {
    return NextResponse.json({ ok: true, skipped: "invalid_json" });
  }
  const data = envelope.message?.data;
  if (!data) {
    return NextResponse.json({ ok: true, skipped: "no_data" });
  }
  let payload: GmailNotification & { token?: string };
  try {
    payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ ok: true, skipped: "invalid_payload" });
  }

  if (!verifyToken(payload.token)) {
    // Signal Google to stop retrying a forged delivery.
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const userId = await lookupUserByEmail(payload.emailAddress);
  if (!userId) {
    // No tokens for that address (user disconnected, or a stray push).
    return NextResponse.json({ ok: true, skipped: "unknown_user" });
  }

  // Defensive coerce: Pub/Sub payload.historyId is typed string | number
  // in the spec but a malformed envelope could leave it undefined. We
  // never want to write the literal string "undefined" into the
  // gmail_watches.history_id column.
  const payloadHistoryId =
    typeof payload.historyId === "string" || typeof payload.historyId === "number"
      ? String(payload.historyId)
      : null;

  const watch = await loadWatch(userId);
  // Fresh users with no watch row + no payload historyId have nowhere
  // to start; Gmail rejects history.list without a valid id. Skip
  // cleanly so the next push (which will follow a real watch
  // registration through /api/auth/gmail/start) has something to work
  // with.
  const startHistoryId = watch?.historyId ?? payloadHistoryId;
  if (!startHistoryId) {
    return NextResponse.json({ ok: true, skipped: "no_history_anchor" });
  }

  const filters = await listFiltersForUser(userId);
  if (filters.filter((f) => f.active).length === 0) {
    // User has no active filters; bump historyId so we do not re-scan
    // this window the next time and exit clean.
    if (payloadHistoryId) {
      await setWatchHistoryId(userId, payloadHistoryId).catch(() => {});
    }
    return NextResponse.json({ ok: true, skipped: "no_active_filters" });
  }

  let history;
  try {
    history = await listHistory({ userId, startHistoryId });
  } catch (err) {
    console.error({
      event: "gmail.webhook.history_failed",
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: true, skipped: "history_failed" });
  }

  const newMessageIds = new Set<string>();
  for (const item of history.history ?? []) {
    for (const added of item.messagesAdded ?? []) {
      newMessageIds.add(added.message.id);
    }
  }

  let dispatched = 0;
  for (const messageId of newMessageIds) {
    try {
      const msg = await getMessage({ userId, messageId });
      const from = parseFromAddress(extractHeader(msg, "From"));
      if (!from) continue;
      if (!emailMatchesFilters(from, filters)) continue;
      const body = extractMessageBody(msg) ?? "";
      if (body.trim().length < 30) continue;
      await runHermesOnMessage({
        userId,
        fromAddress: from,
        body,
        messageId,
      });
      dispatched += 1;
    } catch (err) {
      console.error({
        event: "gmail.webhook.message_failed",
        userId,
        messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Advance the cursor regardless of dispatch outcome so a poison
  // message doesn't lock the user's pipeline forever. Use the
  // canonical historyId from the history.list response when present
  // (it represents the latest seen state), falling back to the
  // payload value.
  const nextHistoryId = history.historyId ?? payloadHistoryId;
  if (nextHistoryId) {
    await setWatchHistoryId(userId, nextHistoryId).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    scanned: newMessageIds.size,
    dispatched,
  });
}
