import type { CalloutColor } from "@/lib/reports/types";

/** Exact hex palette spec'd in globalcomix-w18-learnings.html. */
export const CALLOUT_HEX: Record<CalloutColor, string> = {
  pink: "#F49EC8",
  orange: "#F2A65A",
  blue: "#5BB1FF",
  green: "#54F0A3",
  violet: "#926FDE",
};

/** Highlight background uses 40% alpha so the underlying text stays readable. */
export const CALLOUT_HIGHLIGHT_RGBA: Record<CalloutColor, string> = {
  pink: "rgba(244, 158, 200, 0.40)",
  orange: "rgba(242, 166, 90, 0.40)",
  blue: "rgba(91, 177, 255, 0.40)",
  green: "rgba(84, 240, 163, 0.40)",
  violet: "rgba(146, 111, 222, 0.40)",
};
