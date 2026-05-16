"use client";

import { DraftFromEmailButton } from "@/components/reports/DraftFromEmailModal";

// Thin client island so the server-rendered profile page can host the
// paste-an-email button without becoming a client component itself.
// Workstream C swaps this for a Gmail thread-picker once OAuth lands.
export function HermesDraftCTA() {
  return <DraftFromEmailButton />;
}
