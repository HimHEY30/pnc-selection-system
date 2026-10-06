import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import PageHeader from "@/components/ui/PageHeader";
import { loadCampaign } from "@/lib/campaigns/api";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import SetupProgressCard from "../_components/SetupProgressCard";
import SetupStepList from "../_components/SetupStepList";

export const metadata: Metadata = { title: "Campaign setup" };

export default async function CampaignSetupPage({ params }: PageProps<"/admin/campaigns/[id]">) {
  const { id } = await params;
  const [session, campaign] = await Promise.all([auth(), loadCampaign(id)]);
  if (!campaign) notFound();

  const isDraft = campaign.status === "Draft";
  const canEdit = canManageCampaigns(session?.roles ?? []) && isDraft;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={t.setup.title}
        description={t.setup.subtitle}
        breadcrumbsLabel={t.setup.breadcrumbs}
        breadcrumbs={[{ label: t.setup.campaigns, href: "/admin/campaigns" }, { label: campaign.name, current: true }]}
      />

      {!canEdit && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">
          {isDraft ? t.setup.readOnly : t.setup.notDraft}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SetupStepList campaignId={campaign.id} steps={campaign.steps} canEdit={canEdit} />
        <SetupProgressCard campaign={campaign} />
      </div>
    </div>
  );
}
