import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { serverEnv } from "@/lib/env.server";

// AES-256-GCM encryption for Gmail OAuth tokens at rest. Storing the
// access + refresh tokens as plaintext in Supabase would mean any
// dump-of-Supabase or service-role-key leak hands the attacker the
// keys to every connected inbox; the spec calls for at-rest
// encryption (workstream C C.10 #1).
//
// Layout: a 12-byte random IV is prepended to the ciphertext, the
// 16-byte GCM auth tag is appended. The whole thing is base64-encoded
// for the Supabase bytea column (Supabase serialises bytea as base64
// text on the wire).

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const hex = serverEnv.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY not configured; generate 32 random bytes hex",
    );
  }
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `GMAIL_TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes), got ${hex.length}`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decryptToken(payload: string): string {
  const key = loadKey();
  // Supabase returns bytea as either base64 or `\x` hex literal. The
  // base64 path is the wire default; the hex path shows up if someone
  // reads via psql. We sniff and dispatch.
  let raw: Buffer;
  if (payload.startsWith("\\x")) {
    raw = Buffer.from(payload.slice(2), "hex");
  } else {
    raw = Buffer.from(payload, "base64");
  }
  if (raw.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("decryptToken: ciphertext too short");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const ct = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}
