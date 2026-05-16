import "server-only";

import { serverEnv } from "@/lib/env.server";

import { getValidAccessToken } from "./tokens";

// Thin Gmail API client. Only the four endpoints the integration
// touches: users.watch, users.stop, users.history.list, users.messages.get.
// No SDK; one fetch per call.

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch<T>(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { accessToken } = await getValidAccessToken(userId);
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Gmail ${path} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type WatchResponse = {
  historyId: string;
  expiration: string; // unix ms as string
};

export async function startWatch(userId: string): Promise<WatchResponse> {
  const topic = serverEnv.GOOGLE_PUBSUB_TOPIC;
  if (!topic) throw new Error("GOOGLE_PUBSUB_TOPIC not set");
  return gmailFetch<WatchResponse>(userId, "/watch", {
    method: "POST",
    body: JSON.stringify({
      topicName: topic,
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    }),
  });
}

export async function stopWatch(userId: string): Promise<void> {
  await gmailFetch<unknown>(userId, "/stop", { method: "POST" });
}

export type HistoryListResponse = {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
};

export async function listHistory(args: {
  userId: string;
  startHistoryId: string;
}): Promise<HistoryListResponse> {
  const qs = new URLSearchParams({
    startHistoryId: args.startHistoryId,
    historyTypes: "messageAdded",
  });
  return gmailFetch<HistoryListResponse>(args.userId, `/history?${qs}`);
}

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
    mimeType?: string;
  };
};

export type GmailMessagePart = {
  partId: string;
  mimeType: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
};

export async function getMessage(args: {
  userId: string;
  messageId: string;
}): Promise<GmailMessage> {
  // format=full returns the full message body parts. We could use
  // metadata + raw for size, but the Hermes pipeline wants the body
  // text so the simpler call is full + manual MIME walk.
  const qs = new URLSearchParams({ format: "full" });
  return gmailFetch<GmailMessage>(
    args.userId,
    `/messages/${encodeURIComponent(args.messageId)}?${qs}`,
  );
}

// Walks the MIME tree and pulls the first text/plain part. Falls back
// to text/html (stripped) so an HTML-only sender still gives us
// something. Returns null on a truly empty message.
export function extractMessageBody(message: GmailMessage): string | null {
  const candidates: Array<{ mime: string; data?: string }> = [];

  function walk(part: GmailMessagePart | GmailMessage["payload"]): void {
    if (part.body?.data) {
      candidates.push({
        mime: ("mimeType" in part ? part.mimeType : undefined) ?? "unknown",
        data: part.body.data,
      });
    }
    if ("parts" in part && Array.isArray(part.parts)) {
      for (const child of part.parts) walk(child);
    }
  }
  walk(message.payload);

  if (candidates.length === 0) return message.snippet ?? null;

  // Prefer text/plain, then text/html. Never fall back to a non-text
  // part (a PDF or image attachment would otherwise feed binary
  // base64-decoded bytes straight into Hermes).
  const plain = candidates.find((c) => c.mime === "text/plain");
  const html = candidates.find((c) => c.mime === "text/html");
  const chosen = plain ?? html;
  if (!chosen) return message.snippet ?? null;
  if (!chosen.data) return null;
  const decoded = Buffer.from(chosen.data, "base64url").toString("utf8");
  if (chosen.mime === "text/html") {
    // Crude HTML strip; Hermes only needs the readable body, not the
    // markup. A proper sanitiser is overkill here because the result
    // feeds an LLM, not a renderer.
    return decoded
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return decoded.trim();
}

export function extractHeader(
  message: GmailMessage,
  name: string,
): string | null {
  const headers = message.payload.headers ?? [];
  const lower = name.toLowerCase();
  const hit = headers.find((h) => h.name.toLowerCase() === lower);
  return hit?.value ?? null;
}

// "Emily Foster <emily@globalcomix.com>" -> "emily@globalcomix.com".
// Returns null when the From header is malformed.
export function parseFromAddress(from: string | null): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  // Bare address case.
  if (from.includes("@")) return from.trim().toLowerCase();
  return null;
}
