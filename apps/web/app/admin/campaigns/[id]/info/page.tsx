import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import PageHeader from "@/components/ui/PageHeader";
import { loadCampaign, loadProvinces } from "@/lib/campaigns/api";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import CampaignInfoForm from "../../_components/CampaignInfoForm";

export const metadata: Metadata = { title: "Step 1: Campaign info" };

export default async function CampaignInfoPage({ params }: PageProps<"/admin/campaigns/[id]/info">) {
  const { id } = await params;
  const [session, campaign, provinces] = await Promise.all([auth(), loadCampaign(id), loadProvinces()]);
  if (!campaign) notFound();

  const canEdit = canManageCampaigns(session?.roles ?? []) && campaign.status === "Draft";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={t.info.title} description={t.info.subtitle} back={{ href: `/admin/campaigns/${campaign.id}`, label: t.info.back }} />

      {/* Keyed by id so moving between campaigns never carries one form's state into another. */}
      <CampaignInfoForm key={campaign.id} campaign={campaign} provinces={provinces} canEdit={canEdit} />
    </div>
  );
}
