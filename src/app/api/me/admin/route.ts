import "server-only";

import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin";

export const runtime = "nodejs";

/**
 * Tiny "is the current session an admin" probe. The client-side
 * SyncNowButton fetches this once on mount to decide whether to render.
 *
 * We deliberately keep the response shape minimal — leaking the
 * allowlist or the user id back to the browser has zero upside. The
 * answer is just "true or false".
 */
export async function GET() {
  const isAdmin = await isAdminUser();
  return NextResponse.json({ isAdmin });
}
