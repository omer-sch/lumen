import "server-only";

import { supabaseAdmin } from "./client";
import type { AgentId } from "@/lib/agents/identity";
import type {
  Agent,
  AgentMemory,
  AgentRun,
  AgentStatus,
  RunOutput,
} from "@/lib/mock/agents";

const HISTORY_PER_AGENT = 3;
const KNOWN_AGENT_IDS: readonly AgentId[] = ["aria", "max", "nova"];

// Local PostgrestError-ish shape — narrow enough that we never have to
// import @supabase/supabase-js types just to log a failure.
function throwIfError(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`[db/agents] ${label}: ${error.message}`);
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Hydrate the full Agent[] shape that AgentsView consumes — identities,
 * the last N historical runs (with their outputs), any in-flight live
 * run, memory rules, and derived fields (status / totalRuns / lastRun /
 * keyMetric). Single page-load worth of data; called from the agents
 * page server component.
 */
export async function loadAgentsForPage(): Promise<Agent[]> {
  const sb = supabaseAdmin();

  // Run all the independent queries in parallel — they're each their
  // own table scan and don't depend on each other's results.
  const [
    { data: agentRows,    error: agentErr },
    { data: allRuns,      error: runsErr },
    { data: allImages,    error: imgErr },
    { data: allAnomalies, error: anoErr },
    { data: allReports,   error: repErr },
    { data: allMemory,    error: memErr },
  ] = await Promise.all([
    sb.from("agents").select("*").order("id"),
    sb.from("agent_runs")
      .select("id, agent_id, status, started_at, completed_at, step, progress, note, score, rating")
      .order("started_at", { ascending: false }),
    sb.from("agent_images")
      .select("run_id, title, composition, palette_from, palette_to, image_url, virality_score"),
    sb.from("agent_anomalies")
      .select("run_id, channel, client, metric, delta, direction"),
    sb.from("agent_reports")
      .select("run_id, title, excerpt, metrics_json"),
    sb.from("agent_memory")
      .select("id, agent_id, rule, source, applied_count")
      .order("created_at", { ascending: true }),
  ]);

  throwIfError("agents",          agentErr);
  throwIfError("agent_runs",      runsErr);
  throwIfError("agent_images",    imgErr);
  throwIfError("agent_anomalies", anoErr);
  throwIfError("agent_reports",   repErr);
  throwIfError("agent_memory",    memErr);

  // Index outputs by run_id so we can attach them in O(1).
  const imageByRun = new Map((allImages ?? []).map((r) => [r.run_id, r]));
  const reportByRun = new Map((allReports ?? []).map((r) => [r.run_id, r]));
  const anomaliesByRun = new Map<string, typeof allAnomalies extends (infer T)[] | null ? T[] : never>();
  for (const a of allAnomalies ?? []) {
    const list = anomaliesByRun.get(a.run_id);
    if (list) list.push(a);
    else anomaliesByRun.set(a.run_id, [a]);
  }

  // Group runs by agent.
  const runsByAgent = new Map<string, NonNullable<typeof allRuns>>();
  for (const r of allRuns ?? []) {
    const list = runsByAgent.get(r.agent_id);
    if (list) list.push(r);
    else runsByAgent.set(r.agent_id, [r]);
  }

  // Group memory by agent.
  const memoryByAgent = new Map<string, AgentMemory[]>();
  for (const m of allMemory ?? []) {
    const shaped: AgentMemory = {
      id: m.id,
      rule: m.rule,
      source: m.source ?? "",
      appliedCount: m.applied_count,
    };
    const list = memoryByAgent.get(m.agent_id);
    if (list) list.push(shaped);
    else memoryByAgent.set(m.agent_id, [shaped]);
  }

  return (agentRows ?? [])
    // Keep only the three known agents; ignore any future seeds.
    .filter((a): a is typeof a & { id: AgentId } =>
      (KNOWN_AGENT_IDS as readonly string[]).includes(a.id),
    )
    .map((a) => {
      const runs = runsByAgent.get(a.id) ?? [];
      const liveRunRow = runs.find((r) => r.status === "running");
      const historicalRows = runs
        .filter((r) => r.status !== "running")
        .slice(0, HISTORY_PER_AGENT);

      const history: AgentRun[] = historicalRows.map((r) =>
        shapeRun(r, {
          imageByRun,
          reportByRun,
          anomaliesByRun,
          agentId: a.id as AgentId,
        }),
      );

      const status: AgentStatus = liveRunRow
        ? "running"
        : a.id === "nova"
          ? "scheduled"
          : "completed";

      const liveRun = liveRunRow
        ? {
            progress: liveRunRow.progress ?? 0,
            step: liveRunRow.step ?? "Starting up...",
          }
        : undefined;

      return {
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
        status,
        schedule: a.schedule,
        totalRuns: runs.length,
        keyMetric: deriveKeyMetric(a.id as AgentId, history, anomaliesByRun, liveRunRow),
        lastRun: deriveLastRun(a.id as AgentId, status, liveRunRow, historicalRows[0]),
        history,
        memory: memoryByAgent.get(a.id) ?? [],
        liveRun,
        paused: a.paused,
      } satisfies Agent;
    });
}

// ─────────────────────────────────────────────────────────────────────
// Per-run shaping
// ─────────────────────────────────────────────────────────────────────

type ShapeContext = {
  imageByRun: Map<string, { title: string; composition: string | null; palette_from: string | null; palette_to: string | null; image_url: string | null }>;
  reportByRun: Map<string, { title: string; excerpt: string | null; metrics_json: unknown }>;
  anomaliesByRun: Map<string, { channel: string; client: string; metric: string; delta: string; direction: string }[]>;
  agentId: AgentId;
};

function shapeRun(
  row: {
    id: string;
    status: string;
    started_at: string;
    note: string | null;
    score: number | null;
    rating: number | null;
  },
  ctx: ShapeContext,
): AgentRun {
  return {
    id: row.id,
    date: fmtDate(row.started_at),
    score: row.score ?? undefined,
    rating: row.rating ?? undefined,
    note: row.note ?? "",
    output: shapeOutput(row.id, ctx),
  };
}

function shapeOutput(runId: string, ctx: ShapeContext): RunOutput {
  if (ctx.agentId === "aria") {
    const img = ctx.imageByRun.get(runId);
    if (img) {
      return {
        kind: "image",
        data: {
          title: img.title,
          palette: {
            from: img.palette_from ?? "var(--color-ua)",
            to: img.palette_to ?? "var(--color-yellow)",
          },
          composition: img.composition ?? "",
          ...(img.image_url ? { imageUrl: img.image_url } : {}),
        },
      };
    }
  }
  if (ctx.agentId === "max") {
    const anomalies = ctx.anomaliesByRun.get(runId) ?? [];
    return {
      kind: "anomalies",
      data: anomalies.map((a) => ({
        // We accept the strings from DB at face value — the value-set
        // check constraints on the table already restrict them.
        channel: a.channel as "Meta" | "TikTok" | "Google" | "AppsFlyer",
        client: a.client,
        metric: a.metric,
        delta: a.delta,
        direction: a.direction as "up" | "down",
      })),
    };
  }
  if (ctx.agentId === "nova") {
    const rep = ctx.reportByRun.get(runId);
    if (rep) {
      const metrics = parseMetricsJson(rep.metrics_json);
      return {
        kind: "report",
        data: {
          title: rep.title,
          excerpt: rep.excerpt ?? "",
          metrics,
        },
      };
    }
  }
  // Fallback for an Aria/Nova run with no attached output row yet —
  // the Max branch above always returns, so by here agentId is "aria"
  // or "nova". Keeps the UI rendering instead of crashing.
  if (ctx.agentId === "nova") {
    return { kind: "report", data: { title: "Pending", excerpt: "", metrics: [] } };
  }
  return {
    kind: "image",
    data: {
      title: "Pending",
      composition: "",
      palette: { from: "var(--color-ua)", to: "var(--color-yellow)" },
    },
  };
}

function parseMetricsJson(value: unknown): { label: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { label: string; value: string }[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      "label" in item &&
      "value" in item &&
      typeof (item as { label: unknown }).label === "string" &&
      typeof (item as { value: unknown }).value === "string"
    ) {
      out.push({
        label: (item as { label: string }).label,
        value: (item as { value: string }).value,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Derived header fields
// ─────────────────────────────────────────────────────────────────────

function deriveKeyMetric(
  agentId: AgentId,
  history: AgentRun[],
  anomaliesByRun: Map<string, unknown[]>,
  liveRunRow: { id: string } | undefined,
): { label: string; value: string } {
  const mostRecent = history[0];
  if (agentId === "aria") {
    const v = mostRecent?.score;
    return { label: "Last virality", value: v != null ? String(Math.round(v)) : "—" };
  }
  if (agentId === "max") {
    // Live-run anomaly count if running, otherwise most recent completed.
    const runIdForCount = liveRunRow?.id ?? mostRecent?.id;
    const count = runIdForCount
      ? anomaliesByRun.get(runIdForCount)?.length ?? 0
      : 0;
    return { label: "Found today", value: String(count) };
  }
  // Nova — average rating across the visible history slice.
  const ratings = history.map((r) => r.rating ?? null).filter((v): v is number => v != null);
  if (ratings.length === 0) return { label: "Avg rating", value: "—" };
  const avg = ratings.reduce((s, x) => s + x, 0) / ratings.length;
  return { label: "Avg rating", value: avg.toFixed(1) };
}

function deriveLastRun(
  agentId: AgentId,
  status: AgentStatus,
  liveRunRow: { started_at: string } | undefined,
  mostRecentHistorical: { completed_at: string | null; started_at: string } | undefined,
): string {
  if (status === "running" && liveRunRow) {
    const t = new Date(liveRunRow.started_at);
    const hhmm = t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `Running now · today ${hhmm}`;
  }
  if (status === "scheduled") {
    // Nova: weekly. The schedule string already covers "next run" copy
    // upstream, so just point at it.
    return "Next run · Fri 09:00";
  }
  if (mostRecentHistorical) {
    const t = new Date(mostRecentHistorical.completed_at ?? mostRecentHistorical.started_at);
    const date = t.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    const hhmm = t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const tail = agentId === "max" ? " · sent to Feed" : "";
    return `Completed · ${date} ${hhmm}${tail}`;
  }
  return "No runs yet";
}
