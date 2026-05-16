// @vitest-environment node
// Layer 3 (route). File under test: src/app/api/webhooks/gmail/route.ts.
// Six asserts cover the riskiest 100 lines of workstream C: token
// gate, unknown-user skip, no-active-filters cursor advance, happy
// path dispatch + notification, body-too-short skip, cursor advance
// on Hermes failure.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted lets the mocks see these refs before module init.
const listHistoryMock = vi.hoisted(() => vi.fn());
const getMessageMock = vi.hoisted(() => vi.fn());
const setWatchHistoryIdMock = vi.hoisted(() => vi.fn());
const loadWatchMock = vi.hoisted(() => vi.fn());
const listFiltersForUserMock = vi.hoisted(() => vi.fn());
const pushNotificationMock = vi.hoisted(() => vi.fn());
const startRunMock = vi.hoisted(() => vi.fn());
const completeRunMock = vi.hoisted(() => vi.fn());
const failRunMock = vi.hoisted(() => vi.fn());
const buildHermesGraphMock = vi.hoisted(() => vi.fn());

const supabaseFromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gmail/api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/gmail/api")>();
  return {
    ...actual,
    listHistory: listHistoryMock,
    getMessage: getMessageMock,
  };
});

vi.mock("@/lib/gmail/watch", () => ({
  loadWatch: loadWatchMock,
  setWatchHistoryId: setWatchHistoryIdMock,
}));

vi.mock("@/lib/email-filters", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/email-filters")>();
  return {
    ...actual,
    listFiltersForUser: listFiltersForUserMock,
  };
});

vi.mock("@/lib/notifications/server", () => ({
  pushNotification: pushNotificationMock,
}));

vi.mock("@/lib/agents/_scaffold/run", () => ({
  startRun: startRunMock,
  completeRun: completeRunMock,
  failRun: failRunMock,
}));

vi.mock("@/lib/agents/hermes/graph", () => ({
  buildHermesGraph: buildHermesGraphMock,
  // Route uses invokeHermesGraph (LangSmith wrapper) since v0.5-D;
  // delegate to the existing buildHermesGraphMock so tests keep their
  // single-mock-per-call shape.
  invokeHermesGraph: async (input: unknown) => {
    const graph = buildHermesGraphMock();
    return graph.invoke(input);
  },
  logLangSmithStatusOnce: () => undefined,
}));

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => ({
    from: supabaseFromMock,
  }),
}));

const PUBSUB_TOKEN = "test-pubsub-token-value";

function envelope(payload: {
  emailAddress: string;
  historyId: string;
  token?: string;
}) {
  const json = JSON.stringify({
    ...payload,
    token: payload.token ?? PUBSUB_TOKEN,
  });
  const data = Buffer.from(json, "utf8").toString("base64");
  return new Request("http://localhost:3000/api/webhooks/gmail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: { data, messageId: "m1" } }),
  });
}

function configureLookup(userId: string | null) {
  // Mirror the supabaseAdmin().from("gmail_oauth_tokens").select(...)
  // .eq(...).maybeSingle() chain the handler uses.
  supabaseFromMock.mockImplementation((table: string) => {
    if (table !== "gmail_oauth_tokens") {
      throw new Error(`unexpected supabase table: ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            userId
              ? { data: { user_id: userId }, error: null }
              : { data: null, error: null },
        }),
      }),
    };
  });
}

function buildHermesMessage(from: string, body: string) {
  return {
    id: "m1",
    threadId: "t1",
    payload: {
      headers: [{ name: "From", value: from }],
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          body: { data: Buffer.from(body, "utf8").toString("base64url") },
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "x");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "y");
  vi.stubEnv(
    "GOOGLE_PUBSUB_TOPIC",
    "projects/test/topics/lumen-gmail-notifications",
  );
  vi.stubEnv("GOOGLE_PUBSUB_VERIFICATION_TOKEN", PUBSUB_TOKEN);
  vi.stubEnv(
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  listHistoryMock.mockReset();
  getMessageMock.mockReset();
  setWatchHistoryIdMock.mockReset();
  setWatchHistoryIdMock.mockResolvedValue(undefined);
  loadWatchMock.mockReset();
  listFiltersForUserMock.mockReset();
  pushNotificationMock.mockReset();
  pushNotificationMock.mockResolvedValue({});
  startRunMock.mockReset();
  completeRunMock.mockReset();
  failRunMock.mockReset();
  buildHermesGraphMock.mockReset();
  supabaseFromMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/gmail", () => {
  it("returns 401 on a forged Pub/Sub token", async () => {
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = envelope({
      emailAddress: "lior@yellowhead.com",
      historyId: "1001",
      token: "wrong-token",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 200 skip when no user has tokens for the address", async () => {
    configureLookup(null);
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = envelope({
      emailAddress: "stranger@example.com",
      historyId: "1001",
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe("unknown_user");
  });

  it("advances the cursor on the no-active-filters branch", async () => {
    configureLookup("user-1");
    loadWatchMock.mockResolvedValueOnce({
      userId: "user-1",
      historyId: "900",
      expiresAt: new Date(Date.now() + 86400000),
      status: "active",
      failureReason: null,
    });
    listFiltersForUserMock.mockResolvedValueOnce([]);
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = envelope({
      emailAddress: "lior@yellowhead.com",
      historyId: "1001",
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe("no_active_filters");
    expect(setWatchHistoryIdMock).toHaveBeenCalledWith("user-1", "1001");
  });

  it("dispatches Hermes and pushes a draft-ready notification on a matching message", async () => {
    configureLookup("user-1");
    loadWatchMock.mockResolvedValueOnce({
      userId: "user-1",
      historyId: "900",
      expiresAt: new Date(Date.now() + 86400000),
      status: "active",
      failureReason: null,
    });
    listFiltersForUserMock.mockResolvedValueOnce([
      {
        id: "f1",
        userId: "user-1",
        filterType: "sender_domain",
        filterValue: "globalcomix.com",
        active: true,
      },
    ]);
    listHistoryMock.mockResolvedValueOnce({
      history: [
        {
          id: "h1",
          messagesAdded: [{ message: { id: "msg-1", threadId: "thr-1" } }],
        },
      ],
      historyId: "1002",
    });
    getMessageMock.mockResolvedValueOnce(
      buildHermesMessage(
        "Emily Foster <emily@globalcomix.com>",
        "Hi team, could you send the weekly review for GlobalComix? Thanks, Emily",
      ),
    );
    startRunMock.mockResolvedValueOnce({ id: "run-abc" });
    completeRunMock.mockResolvedValueOnce(undefined);
    buildHermesGraphMock.mockReturnValueOnce({
      invoke: vi.fn().mockResolvedValueOnce({
        intent: { client: "globalcomix" },
        deck: { report_id: "rpt_xyz" },
      }),
    });

    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = envelope({
      emailAddress: "lior@yellowhead.com",
      historyId: "1002",
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scanned).toBe(1);
    expect(body.dispatched).toBe(1);
    expect(startRunMock).toHaveBeenCalledOnce();
    expect(pushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        kind: "hermes_draft_ready",
        link: "/reports/rpt_xyz?source=hermes",
      }),
    );
    expect(setWatchHistoryIdMock).toHaveBeenCalledWith("user-1", "1002");
  });

  it("skips bodies under 30 chars without dispatching Hermes", async () => {
    configureLookup("user-1");
    loadWatchMock.mockResolvedValueOnce({
      userId: "user-1",
      historyId: "900",
      expiresAt: new Date(Date.now() + 86400000),
      status: "active",
      failureReason: null,
    });
    listFiltersForUserMock.mockResolvedValueOnce([
      {
        id: "f1",
        userId: "user-1",
        filterType: "sender_domain",
        filterValue: "globalcomix.com",
        active: true,
      },
    ]);
    listHistoryMock.mockResolvedValueOnce({
      history: [
        {
          id: "h1",
          messagesAdded: [{ message: { id: "msg-1", threadId: "thr-1" } }],
        },
      ],
      historyId: "1002",
    });
    getMessageMock.mockResolvedValueOnce(
      buildHermesMessage("emily@globalcomix.com", "thx"),
    );
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = envelope({
      emailAddress: "lior@yellowhead.com",
      historyId: "1002",
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(body.dispatched).toBe(0);
    expect(startRunMock).not.toHaveBeenCalled();
  });

  it("advances cursor even when Hermes throws so the next push isn't stuck", async () => {
    configureLookup("user-1");
    loadWatchMock.mockResolvedValueOnce({
      userId: "user-1",
      historyId: "900",
      expiresAt: new Date(Date.now() + 86400000),
      status: "active",
      failureReason: null,
    });
    listFiltersForUserMock.mockResolvedValueOnce([
      {
        id: "f1",
        userId: "user-1",
        filterType: "sender_domain",
        filterValue: "globalcomix.com",
        active: true,
      },
    ]);
    listHistoryMock.mockResolvedValueOnce({
      history: [
        {
          id: "h1",
          messagesAdded: [{ message: { id: "msg-1", threadId: "thr-1" } }],
        },
      ],
      historyId: "1003",
    });
    getMessageMock.mockResolvedValueOnce(
      buildHermesMessage(
        "emily@globalcomix.com",
        "Hi team, could you send the weekly review please, thanks Emily",
      ),
    );
    startRunMock.mockResolvedValueOnce({ id: "run-fail" });
    buildHermesGraphMock.mockReturnValueOnce({
      invoke: vi.fn().mockRejectedValueOnce(new Error("Sonnet timeout")),
    });
    failRunMock.mockResolvedValueOnce(undefined);

    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const req = envelope({
      emailAddress: "lior@yellowhead.com",
      historyId: "1003",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(failRunMock).toHaveBeenCalled();
    expect(setWatchHistoryIdMock).toHaveBeenCalledWith("user-1", "1003");
  });
});
