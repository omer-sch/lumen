import "server-only";

import { createHash } from "node:crypto";

import { type IndexResult, type PreparedChunk, upsertRagChunks } from "./_upsert";

// Typed ingester shell for the Comms corpus. Hermes' parse_intent reads
// from this corpus to learn how each client typically phrases requests
// (e.g. how Emily at GlobalComix writes a weekly review ask). Lights up
// when Gmail OAuth lands in v1; for now this function is callable but
// has no production caller, so the Comms corpus stays empty until the
// OAuth callback wires it up.

export type CommsParticipant = { name: string; email: string };

export type CommsMessage = {
  from: string;
  to: string[];
  sent_at: string; // ISO timestamp
  body: string;
};

export type CommsThread = {
  client: string;
  thread_id: string;
  subject: string;
  participants: CommsParticipant[];
  messages: CommsMessage[];
};

function chunkIdFor(message: CommsMessage, threadId: string): string {
  // Content-addressed: same message body + sender + timestamp produces
  // the same chunk_id, so re-ingesting the same thread upserts cleanly.
  const seed = `${threadId}|${message.from}|${message.sent_at}|${message.body}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function formatMessage(message: CommsMessage, thread: CommsThread): string {
  // Prefix each chunk with thread subject + participant context so the
  // embedding captures who's talking and what about, not just the body.
  const recipients = message.to.join(", ");
  return [
    `Thread: ${thread.subject}`,
    `From: ${message.from}`,
    `To: ${recipients}`,
    `Sent: ${message.sent_at}`,
    "",
    message.body,
  ].join("\n");
}

export async function indexCommsThread(
  thread: CommsThread,
): Promise<IndexResult> {
  if (thread.messages.length === 0) {
    return { chunks_indexed: 0, embedding_tokens: 0, cost_usd: 0 };
  }
  const chunks: PreparedChunk[] = thread.messages.map((m) => ({
    chunk_id: chunkIdFor(m, thread.thread_id),
    content: formatMessage(m, thread),
    metadata: {
      client: thread.client,
      thread_id: thread.thread_id,
      subject: thread.subject,
      from: m.from,
      to: m.to,
      sent_at: m.sent_at,
      date: m.sent_at.slice(0, 10),
    },
  }));
  return upsertRagChunks("comms", `comms/${thread.thread_id}`, chunks);
}
