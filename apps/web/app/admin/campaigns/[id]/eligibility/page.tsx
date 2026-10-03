import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { loadCampaign } from "@/lib/campaigns/api";
import { loadCatalogue, loadEligibility } from "@/lib/eligibility/api";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import EligibilityBuilder from "../../_components/eligibility/EligibilityBuilder";

export const metadata: Metadata = { title: "Step 2: Eligibility rules" };

export default async function EligibilityPage({ params }: PageProps<"/admin/campaigns/[id]/eligibility">) {
  const { id } = await params;
  const [session, campaign, rules, catalogue] = await Promise.all([
    auth(),
    loadCampaign(id),
    loadEligibility(id),
    loadCatalogue(),
  ]);
  if (!campaign || !rules) notFound();

  // Admin and manager may edit, and only while the campaign is a draft. Everyone else
  // who can open the admin area sees the same page, read only.
  const canEdit = canManageCampaigns(session?.roles ?? []) && !rules.isLocked;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <Link href={`/admin/campaigns/${campaign.id}`} className="text-sm font-semibold text-primary hover:underline focus-ring">
          {t.info.back}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-ink">{t.eligibility.ui.title}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.eligibility.ui.subtitle}</p>
      </div>

      {/* Keyed by id so moving between campaigns never carries one page's working copy into another. */}
      <EligibilityBuilder key={campaign.id} campaignId={campaign.id} initial={rules} catalogue={catalogue} steps={campaign.steps} canEdit={canEdit} />
    </div>
  );
}
