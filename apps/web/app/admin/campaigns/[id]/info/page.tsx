import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
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
      <div>
        <Link href={`/admin/campaigns/${campaign.id}`} className="text-sm font-semibold text-primary hover:underline focus-ring">
          {t.info.back}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-ink">{t.info.title}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.info.subtitle}</p>
      </div>

      {/* Keyed by id so moving between campaigns never carries one form's state into another. */}
      <CampaignInfoForm key={campaign.id} campaign={campaign} provinces={provinces} canEdit={canEdit} />
    </div>
  );
}
