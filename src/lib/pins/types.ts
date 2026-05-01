/** Persistent tile pinned by the user from Ask onto their dashboard. The
 *  shape mirrors what we'd write to a DB row in Phase 2 — swapping
 *  localStorage for a real backend is a one-line change in the read/write
 *  layer, not a rearchitect. */

export type PinnedKind = "kpi" | "line" | "bar" | "table";

export type PinnedConfig =
  | { kind: "kpi";   metric: string; value: string;  delta?: number; deltaLabel?: string; direction?: "higher-better" | "lower-better" }
  | { kind: "line";  metric: string; formatter: "money" | "count" | "ratio" | "percent"; data: { date: string; value: number }[] }
  | { kind: "bar";   metric: string; formatter: "money" | "count" | "ratio" | "percent"; data: { label: string; value: number }[]; highlightLabel?: string }
  | { kind: "table"; columns: { key: string; label: string; align?: "left" | "right"; format?: "money" | "count" | "ratio" | "percent" }[]; rows: Record<string, string | number>[] };

export type PinnedTile = {
  id: string;
  /** Owner — phase 1 we mock this; phase 2 it becomes the auth user id. */
  userId: string;
  /** Unix ms — used for sort order and the "Pinned X ago" footer. */
  pinnedAt: number;
  /** Short human label, falls back to the question if absent. */
  label?: string;
  /** The free-text question that produced this tile (for re-running later). */
  question?: string;
  config: PinnedConfig;
};
