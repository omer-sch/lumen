import "server-only";

import { auth } from "@clerk/nextjs/server";

import { rateLimit } from "@/lib/rate-limit";

// Single auth + rate-limit gate every agent endpoint should call as
// its first line. Returns either a green-light userId or a structured
// failure with the HTTP status the route should serve. Per-user,
// per-agent in-memory rate limit (defence-in-depth on the LLM cost
// vector; a real distributed limiter would replace this once an agent
// goes high-volume).

export type AgentAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: string }
  | {
      ok: false;
      status: 429;
      error: string;
      retryAfterSeconds: number;
    };

export type AgentAuthOptions = {
  /** Max runs per user per window. Default 30. */
  maxPerWindow?: number;
  /** Sliding-window length in ms. Default 5 minutes. */
  windowMs?: number;
};

const DEFAULT_MAX = 30;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export async function requireAgentAuth(
  agentName: string,
  options: AgentAuthOptions = {},
): Promise<AgentAuthResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const result = rateLimit(
    `agent:${agentName}:${userId}`,
    options.maxPerWindow ?? DEFAULT_MAX,
    options.windowMs ?? DEFAULT_WINDOW_MS,
  );
  if (!result.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded for agent '${agentName}'. Retry in ${result.retryAfterSeconds}s.`,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return { ok: true, userId };
}
