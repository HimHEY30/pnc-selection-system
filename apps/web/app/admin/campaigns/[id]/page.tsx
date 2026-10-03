import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
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
      <div>
        <nav aria-label={t.setup.breadcrumbs} className="text-xs text-ink-muted">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/admin/campaigns" className="hover:underline focus-ring">
                {t.setup.campaigns}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{campaign.name}</li>
          </ol>
        </nav>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink">{t.setup.title}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.setup.subtitle}</p>
      </div>

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
