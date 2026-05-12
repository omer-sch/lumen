import { notFound } from "next/navigation";
import { AgentPlaygroundPage } from "@/components/agents/playground/AgentPlaygroundPage";
import { loadAgentsForPage } from "@/lib/db/agents";
import { isSupabaseConfigured } from "@/lib/env.server";
import { AGENTS } from "@/lib/mock/agents";

export const metadata = { title: "Agent workspace — Lumen" };

export default async function AgentPlaygroundRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agents = isSupabaseConfigured()
    ? await loadAgentsForPage()
    : AGENTS;
  const agent = agents.find((a) => a.id === id);
  if (!agent) notFound();
  return <AgentPlaygroundPage agent={agent} />;
}
