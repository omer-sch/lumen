import type { PinnedConfig } from "@/lib/pins/types";

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
};

export type Answer = AnswerBase & { config: PinnedConfig };
