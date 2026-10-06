import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import PageHeader from "@/components/ui/PageHeader";
import { loadCampaign } from "@/lib/campaigns/api";
import { loadEligibility, loadExamSetup } from "@/lib/eligibility/api";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import EligibilityBuilder from "../../_components/eligibility/EligibilityBuilder";

export const metadata: Metadata = { title: "Step 2: Eligibility rules" };

export default async function EligibilityPage({ params }: PageProps<"/admin/campaigns/[id]/eligibility">) {
  const { id } = await params;
  // The exam setup is the campaign's own catalogue: the shared fields plus its exam subjects. Reading it
  // is also what gives a new draft campaign Math, Logic and English, so it runs with the rules, not after.
  const [session, campaign, rules, examSetup] = await Promise.all([
    auth(),
    loadCampaign(id),
    loadEligibility(id),
    loadExamSetup(id),
  ]);
  if (!campaign || !rules || !examSetup) notFound();

  // Admin and manager may edit, and only while the campaign is a draft. Everyone else
  // who can open the admin area sees the same page, read only.
  const canEdit = canManageCampaigns(session?.roles ?? []) && !rules.isLocked;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={t.eligibility.ui.title} description={t.eligibility.ui.subtitle} back={{ href: `/admin/campaigns/${campaign.id}`, label: t.info.back }} />

      {/* Keyed by id so moving between campaigns never carries one page's working copy into another. */}
      <EligibilityBuilder key={campaign.id} campaignId={campaign.id} initial={rules} examSetup={examSetup} steps={campaign.steps} canEdit={canEdit} />
    </div>
  );
}
