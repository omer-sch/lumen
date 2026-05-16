// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/gmail/api.ts pure
// helpers (parseFromAddress, extractHeader, extractMessageBody).

import { describe, expect, it } from "vitest";

import {
  extractHeader,
  extractMessageBody,
  parseFromAddress,
  type GmailMessage,
} from "@/lib/gmail/api";

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

describe("parseFromAddress", () => {
  it("pulls the address out of a Name <address> header", () => {
    expect(parseFromAddress("Emily Foster <emily@globalcomix.com>")).toBe(
      "emily@globalcomix.com",
    );
  });

  it("handles a bare email address header", () => {
    expect(parseFromAddress("emily@globalcomix.com")).toBe(
      "emily@globalcomix.com",
    );
  });

  it("lowercases the result for case-insensitive matching downstream", () => {
    expect(parseFromAddress("Emily <Emily@GlobalComix.COM>")).toBe(
      "emily@globalcomix.com",
    );
  });

  it("returns null on null input or a header without an address", () => {
    expect(parseFromAddress(null)).toBeNull();
    expect(parseFromAddress("Just Some Name")).toBeNull();
  });
});

describe("extractHeader", () => {
  const msg: GmailMessage = {
    id: "m1",
    threadId: "t1",
    payload: {
      headers: [
        { name: "From", value: "emily@globalcomix.com" },
        { name: "Subject", value: "Weekly review please" },
      ],
    },
  };

  it("is case-insensitive on the header name", () => {
    expect(extractHeader(msg, "from")).toBe("emily@globalcomix.com");
    expect(extractHeader(msg, "SUBJECT")).toBe("Weekly review please");
  });

  it("returns null when the header is absent", () => {
    expect(extractHeader(msg, "Reply-To")).toBeNull();
  });
});

describe("extractMessageBody", () => {
  it("prefers text/plain when both plain and html parts are present", () => {
    const msg: GmailMessage = {
      id: "m",
      threadId: "t",
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          {
            partId: "0",
            mimeType: "text/plain",
            body: { data: b64("Hi team,\n\nWeekly review please.\n\nEmily") },
          },
          {
            partId: "1",
            mimeType: "text/html",
            body: { data: b64("<p>Hi team</p>") },
          },
        ],
      },
    };
    const body = extractMessageBody(msg);
    expect(body).toMatch(/Weekly review please/);
    expect(body).not.toMatch(/<p>/);
  });

  it("falls back to text/html with crude tag stripping when no plain part exists", () => {
    const msg: GmailMessage = {
      id: "m",
      threadId: "t",
      payload: {
        mimeType: "text/html",
        body: { data: b64("<p>Hi <b>team</b>, weekly review please.</p>") },
      },
    };
    expect(extractMessageBody(msg)).toMatch(/Hi team, weekly review please/);
  });

  it("returns the snippet when no parts have data", () => {
    const msg: GmailMessage = {
      id: "m",
      threadId: "t",
      snippet: "fallback snippet",
      payload: {},
    };
    expect(extractMessageBody(msg)).toBe("fallback snippet");
  });
});
