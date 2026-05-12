import type { PinnedConfig } from "@/lib/pins/types";
import type { AgentId } from "@/lib/agents/identity";

export type Channel = "Meta" | "TikTok" | "Google" | "AppsFlyer";
export type Metric = "spend" | "installs" | "cpi" | "roas" | "revenue";

export type Formatter = "money" | "count" | "ratio" | "percent";

export type AnswerBase = {
  question: string;
  /** Single-sentence narration shown above the chart. */
  narration: string;
  /** Why Lumen picked this chart kind for this question. */
  rationale: string;
  /** A close-second alternative the user can switch to. */
  alternative?: { kind: PinnedConfig["kind"]; reason: string };
  /** Which agent produced this answer — drives the byline on the answer card.
   *  Optional so historical mocks still satisfy the type; consumers fall
   *  back to Aria (the visual/chart agent) when absent. */
  answeredBy?: AgentId;
};

export type Answer = AnswerBase & { config: PinnedConfig };
