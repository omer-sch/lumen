// Layer 2 (backend lib unit). File under test: src/lib/agents/identity.ts. Priority: P0.
// Source of truth for agent attribution across Feed / Reports / Ask. The map
// must be total over AgentId and the avatar paths must be relative to /public.
import { describe, expect, it } from "vitest";

import {
  AGENT_IDENTITIES,
  getAgentIdentity,
  type AgentId,
} from "@/lib/agents/identity";

const IDS: AgentId[] = ["aria", "max", "nova"];

describe("agents/identity", () => {
  it("exports an identity for every known AgentId", () => {
    for (const id of IDS) {
      expect(AGENT_IDENTITIES[id]).toBeDefined();
      expect(AGENT_IDENTITIES[id].id).toBe(id);
      expect(AGENT_IDENTITIES[id].name.length).toBeGreaterThan(0);
      expect(AGENT_IDENTITIES[id].role.length).toBeGreaterThan(0);
    }
  });

  it("avatar paths are relative paths under /avatars", () => {
    for (const id of IDS) {
      expect(AGENT_IDENTITIES[id].avatarUrl).toMatch(/^\/avatars\/[a-z]+\.png$/);
    }
  });

  it("getAgentIdentity returns the same object as the static map", () => {
    for (const id of IDS) {
      expect(getAgentIdentity(id)).toBe(AGENT_IDENTITIES[id]);
    }
  });

  it("agent names are unique", () => {
    const names = IDS.map((id) => AGENT_IDENTITIES[id].name);
    expect(new Set(names).size).toBe(names.length);
  });
});
