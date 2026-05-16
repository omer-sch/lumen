// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/hermes/nodes/parse-intent.ts (extractSenderEmail).
// Pure helper, no Anthropic / Supabase mocks needed.

import { describe, expect, it } from "vitest";

import { extractSenderEmail } from "@/lib/agents/hermes/nodes/parse-intent";

describe("extractSenderEmail", () => {
  it("returns null when the body has no email address", () => {
    expect(
      extractSenderEmail(
        "Hi team, please send the weekly review for GlobalComix. Thanks, Emily",
      ),
    ).toBeNull();
  });

  it("pulls the address out of a sign-off line", () => {
    expect(
      extractSenderEmail(
        "Hi team,\n\nWeekly review please.\n\nThanks,\nEmily Foster\nemily@globalcomix.com",
      ),
    ).toBe("emily@globalcomix.com");
  });

  it("prefers the longest address when several are present (sender > footer)", () => {
    expect(
      extractSenderEmail(
        "Hi team,\n\nemily.foster@globalcomix.com here. Reply to noreply@example.com if you must.",
      ),
    ).toBe("emily.foster@globalcomix.com");
  });

  it("is case-insensitive on the local part", () => {
    expect(
      extractSenderEmail("From Emily.Foster@GlobalComix.com regarding..."),
    ).toBe("Emily.Foster@GlobalComix.com");
  });
});
