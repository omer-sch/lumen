import { z } from "zod";

import type { AgentId } from "@/lib/agents/identity";

// Lax wire-shape validator for Report PUT bodies. The sections array is
// jsonb on the server and a discriminated union on the client; the
// renderer guards on section.id, so a row with a malformed section
// falls into the legacy fallback instead of crashing. We validate the
// top-level shape strictly and pass sections through as unknown[].

const AGENT_IDS = ["aria", "max", "nova", "hermes"] as const satisfies readonly AgentId[];

export const ReportPayloadSchema = z.object({
  id: z.string().min(1).max(128),
  client: z.string().min(1).max(64),
  clientLabel: z.string().min(1).max(120),
  title: z.string().min(1).max(280),
  prompt: z.string().max(8000).default(""),
  period: z.string().min(1).max(120),
  filterRange: z.string().max(120).optional(),
  authoredBy: z.enum(AGENT_IDS).optional(),
  source: z.enum(["manual", "hermes"]).optional(),
  agentRunId: z.string().nullable().optional(),
  preparedFor: z.string().max(160).nullable().optional(),
  sections: z.array(z.unknown()).max(40),
  // createdAt/updatedAt are accepted from the client but the server
  // ignores them on insert (defaults to now) and the trigger refreshes
  // updated_at on every update.
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  // Legacy fields the client may still send; tolerated, ignored.
  userId: z.string().optional(),
});

export type ReportPayload = z.infer<typeof ReportPayloadSchema>;
