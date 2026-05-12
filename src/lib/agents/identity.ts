/**
 * Shared agent identity primitive. One source of truth for the three
 * coworker agents wherever they're attributed in the product — Feed,
 * Reports, Ask. Intentionally lean: no history, memory, or live state
 * (those live on the full `Agent` type in `src/lib/mock/agents.ts` and
 * are only needed by the Agents page).
 */

export type AgentId = "aria" | "max" | "nova";

export type AgentIdentity = {
  id: AgentId;
  name: string;
  role: string;
  avatarUrl: string;
};

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
};

export function getAgentIdentity(id: AgentId): AgentIdentity {
  return AGENT_IDENTITIES[id];
}
