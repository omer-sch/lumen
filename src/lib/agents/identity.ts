/**
 * Shared agent identity primitive. One source of truth for the three
 * coworker agents wherever they're attributed in the product — Feed,
 * Reports, Ask. Intentionally lean: no history, memory, or live state
 * (those live on the full `Agent` type in `src/lib/mock/agents.ts` and
 * are only needed by the Agents page).
 */

export type AgentId = "aria" | "max" | "nova" | "hermes";

export type AgentIdentity = {
  id: AgentId;
  name: string;
  role: string;
  avatarUrl: string;
};

// Hermes joins the lineup in v0.5. The avatar file lands in workstream
// B (FLUX-generated, mint accent matching UA team color); the path is
// pinned here so byline rendering compiles in chunk 1. Until the file
// is generated, the next/image fallback serves a transparent square.
export const AGENT_IDENTITIES: Record<AgentId, AgentIdentity> = {
  aria: {
    id: "aria",
    name: "Aria",
    role: "Image Agent",
    avatarUrl: "/avatars/aria.png",
  },
  max: {
    id: "max",
    name: "Max",
    role: "Anomaly Scanner",
    avatarUrl: "/avatars/max.png",
  },
  nova: {
    id: "nova",
    name: "Nova",
    role: "Report Writer",
    avatarUrl: "/avatars/nova.png",
  },
  hermes: {
    id: "hermes",
    name: "Hermes",
    role: "Report Drafter",
    avatarUrl: "/avatars/hermes.png",
  },
};

export function getAgentIdentity(id: AgentId): AgentIdentity {
  return AGENT_IDENTITIES[id];
}
