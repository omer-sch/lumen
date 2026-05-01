import { notFound } from "next/navigation";
import { ALL_CAMPAIGN_IDS } from "@/lib/mock/campaigns";
import { CampaignProfile } from "@/components/campaigns/CampaignProfile";

export const metadata = { title: "Campaign — Lumen" };

export function generateStaticParams() {
  return ALL_CAMPAIGN_IDS.map((id) => ({ id }));
}

export default async function CampaignProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!ALL_CAMPAIGN_IDS.includes(id)) notFound();
  return <CampaignProfile id={id} />;
}
