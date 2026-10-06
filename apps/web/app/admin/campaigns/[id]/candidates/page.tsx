import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import PageHeader from "@/components/ui/PageHeader";
import { addressSource } from "@/lib/address/source";
import { loadCampaign } from "@/lib/campaigns/api";
import { loadCandidateList, loadSchools, loadSessionChoices } from "@/lib/candidates/api";
import { parseFilters } from "@/lib/candidates/filters";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import CandidatesManager from "../../_components/candidates/CandidatesManager";
import StepTabs from "../../_components/StepTabs";

export const metadata: Metadata = { title: "Step 4: Candidates" };

export default async function CandidatesPage({ params, searchParams }: PageProps<"/admin/campaigns/[id]/candidates">) {
  const { id } = await params;
  const filters = parseFilters(await searchParams);
  const [session, campaign, list] = await Promise.all([auth(), loadCampaign(id), loadCandidateList(id, filters)]);
  if (!campaign || !list) notFound();

  // Admin, manager and officer can all add and change candidates (unless the campaign is closed); only admin and manager
  // delete. The form's two lists (sessions and schools) are needed for the filter and the form, so they are read here.
  const [sessions, schools] = await Promise.all([loadSessionChoices(id), list.canChange ? loadSchools() : []]);

  // The public address service sleeps when idle and is slow to wake. Waking it now means it is ready when the form opens.
  if (list.canChange) addressSource.warm();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={t.candidates.list.title} description={t.candidates.list.subtitle} back={{ href: `/admin/campaigns/${campaign.id}`, label: t.info.back }} />

      <StepTabs steps={campaign.steps} current="Candidates" />

      {/* Keyed by id so moving between campaigns never carries one page's search or open dialog into another. */}
      <CandidatesManager
        key={campaign.id}
        list={list}
        filters={filters}
        sessions={sessions}
        schools={schools}
        canDelete={canManageCampaigns(session?.roles ?? [])}
      />
    </div>
  );
}
