// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/email-filters.ts
// (emailMatchesFilters pure helper).

import { describe, expect, it } from "vitest";

import {
  emailMatchesFilters,
  type EmailFilter,
} from "@/lib/email-filters";

function f(over: Partial<EmailFilter>): EmailFilter {
  return {
    id: "x",
    userId: "u",
    filterType: "sender_domain",
    filterValue: "globalcomix.com",
    active: true,
    ...over,
  };
}

describe("emailMatchesFilters", () => {
  it("matches exact email when sender_email filter is active", () => {
    expect(
      emailMatchesFilters("emily@globalcomix.com", [
        f({ filterType: "sender_email", filterValue: "emily@globalcomix.com" }),
      ]),
    ).toBe(true);
  });

  it("matches by domain when sender_domain filter is active", () => {
    expect(
      emailMatchesFilters("anyone@globalcomix.com", [
        f({ filterType: "sender_domain", filterValue: "globalcomix.com" }),
      ]),
    ).toBe(true);
  });

  it("is case insensitive on both sides", () => {
    expect(
      emailMatchesFilters("Emily@GlobalComix.COM", [
        f({ filterType: "sender_email", filterValue: "emily@globalcomix.com" }),
      ]),
    ).toBe(true);
  });

  it("ignores inactive filters", () => {
    expect(
      emailMatchesFilters("emily@globalcomix.com", [
        f({ active: false }),
      ]),
    ).toBe(false);
  });

  it("returns false when no filters match", () => {
    expect(
      emailMatchesFilters("attacker@evil.example", [
        f({ filterType: "sender_domain", filterValue: "globalcomix.com" }),
      ]),
    ).toBe(false);
  });

  it("returns false on empty filter list (default deny)", () => {
    expect(emailMatchesFilters("emily@globalcomix.com", [])).toBe(false);
  });

  it("returns false when the sender address is malformed", () => {
    expect(
      emailMatchesFilters("not-an-email", [
        f({ filterType: "sender_domain", filterValue: "anything.com" }),
      ]),
    ).toBe(false);
  });
});
