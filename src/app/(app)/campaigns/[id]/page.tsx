import { CampaignProfile } from "@/components/campaigns/CampaignProfile";

export const metadata = { title: "Campaign - Lumen" };

/**
 * Dynamic per-campaign route. We deliberately do NOT pre-render at
 * build time — campaign ids are warehouse-derived and change with
 * every Rivery sync, so any pre-rendered list goes stale immediately.
 * The CampaignProfile renderer shows an empty state if the id resolves
 * to no rows in the active window (handled by the API dispatcher's
 * `summary: null` shape, not a notFound() throw).
 */
export default async function CampaignProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignProfile campaignId={id} />;
}
