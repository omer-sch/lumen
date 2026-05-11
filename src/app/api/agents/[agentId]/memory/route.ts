import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type MemoryEntry = {
  runId: string;
  thumbs: "up" | "down" | null;
  note: string;
  score: number;
  date: string;
  savedAt: string;
};

type RouteContext = { params: Promise<{ agentId: string }> };

function memoryPath(agentId: string): string {
  return path.join(process.cwd(), "data/agents", agentId, "memory.json");
}

async function readEntries(file: string): Promise<MemoryEntry[]> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MemoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { agentId } = await ctx.params;
  const entries = await readEntries(memoryPath(agentId));
  return NextResponse.json({ entries });
}

export async function POST(req: Request, ctx: RouteContext) {
  const { agentId } = await ctx.params;
  const file = memoryPath(agentId);

  const incoming = (await req.json()) as Omit<MemoryEntry, "savedAt">;
  const entry: MemoryEntry = { ...incoming, savedAt: new Date().toISOString() };

  const entries = await readEntries(file);
  entries.push(entry);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(entries, null, 2), "utf8");

  return NextResponse.json({ ok: true });
}
