import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/env.server";
import { deleteFilter, toggleFilter } from "@/lib/email-filters";

export const runtime = "nodejs";

const PatchSchema = z.object({ active: z.boolean() });

function gate() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = gate();
  if (g) return g;
  const { id } = await ctx.params;
  const authResult = await requireUser({
    scope: "filters.toggle",
    maxPerWindow: 120,
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
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await toggleFilter({
    userId: authResult.userId,
    id,
    active: parsed.data.active,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = gate();
  if (g) return g;
  const { id } = await ctx.params;
  const authResult = await requireUser({
    scope: "filters.delete",
    maxPerWindow: 60,
  });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  await deleteFilter(authResult.userId, id);
  return NextResponse.json({ ok: true });
}
