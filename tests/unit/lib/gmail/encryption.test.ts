// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/gmail/encryption.ts.
// AES-256-GCM round-trip; verifies the format survives Supabase's
// base64 bytea wire encoding and that a tampered ciphertext is
// rejected by the GCM auth tag.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a plaintext token", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/lib/gmail/encryption"
    );
    const plain = "ya29.a0AbVbY6test_access_token_payload_here";
    const ct = encryptToken(plain);
    expect(ct).not.toEqual(plain);
    expect(typeof ct).toBe("string");
    expect(decryptToken(ct)).toEqual(plain);
  });

  it("produces a different ciphertext for the same plaintext (random IV)", async () => {
    const { encryptToken } = await import("@/lib/gmail/encryption");
    const a = encryptToken("same input");
    const b = encryptToken("same input");
    expect(a).not.toEqual(b);
  });

  it("throws when the auth tag does not match (tampering)", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/lib/gmail/encryption"
    );
    const ct = encryptToken("hello");
    const tampered = Buffer.from(ct, "base64");
    // Flip a byte in the middle of the ciphertext.
    tampered[20] ^= 0xff;
    expect(() => decryptToken(tampered.toString("base64"))).toThrow();
  });

  it("supports the \\x hex-literal format Postgres uses on direct reads", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/lib/gmail/encryption"
    );
    const ct = encryptToken("postgres path");
    const hex = "\\x" + Buffer.from(ct, "base64").toString("hex");
    expect(decryptToken(hex)).toBe("postgres path");
  });

  it("throws on a missing or wrong-length key", async () => {
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "tooshort");
    const { encryptToken } = await import("@/lib/gmail/encryption");
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });
});
