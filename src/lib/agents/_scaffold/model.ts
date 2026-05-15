import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env.server";

// Single place that knows which Claude model ID corresponds to each
// abstract tier. Agents call `pickModel("haiku")` rather than hard-
// coding the model string so upgrading to a new Claude family is a
// one-line change in this file.
//
// Per CLAUDE.md the latest family is 4.X: Haiku 4.5, Sonnet 4.6, Opus
// 4.7. When a new minor lands, bump it here, not at every call site.

export type ModelTier = "haiku" | "sonnet" | "opus";

export const ANTHROPIC_MODEL_IDS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

export function pickModel(tier: ModelTier): string {
  const id = ANTHROPIC_MODEL_IDS[tier];
  if (!id) {
    throw new Error(`Unknown model tier: ${tier}`);
  }
  return id;
}

let _anthropic: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = serverEnv.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY not set; agent code calling getAnthropicClient() needs it. Add to .env.local.",
    );
  }
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

// Test seam: tests inject a fake client; resetting to null forces
// re-creation. Not part of the public API.
export function __setAnthropicClientForTesting(
  client: Anthropic | null,
): void {
  _anthropic = client;
}
