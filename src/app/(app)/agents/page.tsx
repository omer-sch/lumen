import { AgentsView } from "@/components/agents/AgentsView";
import { loadAgentsForPage } from "@/lib/db/agents";
import { isSupabaseConfigured } from "@/lib/env.server";
import { AGENTS } from "@/lib/mock/agents";

// Server component — fetches the seeded state from Postgres once per
// request and passes it to the client AgentsView. The client-side
// progress tick + Run-now flow continue to run on top of that initial
// state without further server roundtrips.
//
// Falls back to the mock module when Supabase env vars are absent so
// LUMEN_PREVIEW (design-only) stays usable on a fresh checkout without
// requiring a database setup.
export default async function AgentsPage() {
  const initialAgents = isSupabaseConfigured()
    ? await loadAgentsForPage()
    : AGENTS;
  return <AgentsView initialAgents={initialAgents} />;
}
