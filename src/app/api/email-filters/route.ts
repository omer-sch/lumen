import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/env.server";
import { addFilter, listFiltersForUser } from "@/lib/email-filters";

export const runtime = "nodejs";

const AddSchema = z.object({
  type: z.enum(["sender_email", "sender_domain"]),
  value: z.string().min(1).max(160),
});

function gate() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const g = gate();
  if (g) return g;
  const authResult = await requireUser({ scope: "filters.list" });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  const filters = await listFiltersForUser(authResult.userId);
  return NextResponse.json({ filters });
}

export async function POST(req: NextRequest) {
  const g = gate();
  if (g) return g;
  const authResult = await requireUser({
    scope: "filters.add",
    maxPerWindow: 60,
  });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AddSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const filter = await addFilter({
      userId: authResult.userId,
      type: parsed.data.type,
      value: parsed.data.value,
    });
    return NextResponse.json({ filter });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Add failed" },
      { status: 400 },
    );
  }
}
