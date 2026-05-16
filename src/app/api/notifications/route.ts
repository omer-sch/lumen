import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/env.server";
import {
  countUnread,
  listNotifications,
} from "@/lib/notifications/server";

export const runtime = "nodejs";

// GET /api/notifications -> {notifications, unread}
// POST /api/notifications/read-all
//
// Bell-in-topbar polls the GET endpoint; the dropdown's "mark all
// read" action fires the POST.

export async function GET(_req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ notifications: [], unread: 0 });
  }
  const authResult = await requireUser({
    scope: "notifications.list",
    maxPerWindow: 600,
  });
  if (!authResult.ok) {
    return NextResponse.json({ notifications: [], unread: 0 });
  }
  try {
    const [items, unread] = await Promise.all([
      listNotifications(authResult.userId, 20),
      countUnread(authResult.userId),
    ]);
    return NextResponse.json({
      notifications: items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
    });
  } catch {
    return NextResponse.json({ notifications: [], unread: 0 });
  }
}
