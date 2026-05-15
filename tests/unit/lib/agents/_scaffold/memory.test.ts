// Layer 2 (lib unit). File under test:
// src/lib/agents/_scaffold/memory.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insertTerminal = vi.hoisted(() => vi.fn());
const recallTerminal = vi.hoisted(() => vi.fn());
const listTerminal = vi.hoisted(() => vi.fn());

const supabaseChain: Record<string, unknown> = {};
supabaseChain.from = () => supabaseChain;
supabaseChain.insert = insertTerminal;
supabaseChain.select = (columns: string) => {
  if (columns === "slice") {
    return {
      eq: () => listTerminal(),
    };
  }
  return {
    eq: () => ({
      eq: () => ({
        order: () => ({
          limit: (n: number) => recallTerminal(n),
        }),
      }),
    }),
  };
};

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => supabaseChain,
}));

beforeEach(() => {
  insertTerminal.mockReset();
  recallTerminal.mockReset();
  listTerminal.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rememberSlice", () => {
  it("inserts a row into agent_memory_kv with the given scope, slice, payload", async () => {
    insertTerminal.mockResolvedValueOnce({ error: null });
    const { rememberSlice } = await import(
      "@/lib/agents/_scaffold/memory"
    );
    await rememberSlice("quill", "globalcomix", { bullets: ["a", "b"] });
    expect(insertTerminal).toHaveBeenCalledWith({
      scope: "quill",
      slice: "globalcomix",
      payload: { bullets: ["a", "b"] },
    });
  });

  it("throws on Supabase error", async () => {
    insertTerminal.mockResolvedValueOnce({
      error: { message: "RLS denied" },
    });
    const { rememberSlice } = await import(
      "@/lib/agents/_scaffold/memory"
    );
    await expect(
      rememberSlice("quill", "globalcomix", {}),
    ).rejects.toThrow(/RLS denied/);
  });
});

describe("recallSlices", () => {
  it("returns the most recent N slices for a (scope, slice) tuple", async () => {
    recallTerminal.mockResolvedValueOnce({
      data: [
        { payload: { bullets: ["new"] }, created_at: "2026-05-15T10:00:00Z" },
        { payload: { bullets: ["old"] }, created_at: "2026-05-14T10:00:00Z" },
      ],
      error: null,
    });
    const { recallSlices } = await import("@/lib/agents/_scaffold/memory");
    const r = await recallSlices("quill", "globalcomix");
    expect(r).toHaveLength(2);
    expect(r[0].payload).toEqual({ bullets: ["new"] });
  });

  it("respects the limit option", async () => {
    recallTerminal.mockResolvedValueOnce({ data: [], error: null });
    const { recallSlices } = await import("@/lib/agents/_scaffold/memory");
    await recallSlices("quill", "globalcomix", { limit: 3 });
    expect(recallTerminal).toHaveBeenCalledWith(3);
  });

  it("returns empty array when no rows", async () => {
    recallTerminal.mockResolvedValueOnce({ data: null, error: null });
    const { recallSlices } = await import("@/lib/agents/_scaffold/memory");
    expect(await recallSlices("quill", "globalcomix")).toEqual([]);
  });
});

describe("listSlices", () => {
  it("returns distinct slice values for a scope, sorted", async () => {
    listTerminal.mockResolvedValueOnce({
      data: [
        { slice: "globalcomix" },
        { slice: "playw3" },
        { slice: "globalcomix" },
        { slice: "100play" },
      ],
      error: null,
    });
    const { listSlices } = await import("@/lib/agents/_scaffold/memory");
    expect(await listSlices("quill")).toEqual([
      "100play",
      "globalcomix",
      "playw3",
    ]);
  });
});
