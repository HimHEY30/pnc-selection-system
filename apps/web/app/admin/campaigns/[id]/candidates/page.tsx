import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
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

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <Link href={`/admin/campaigns/${campaign.id}`} className="text-sm font-semibold text-primary hover:underline focus-ring">
          {t.info.back}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-ink">{t.candidates.list.title}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.candidates.list.subtitle}</p>
      </div>

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
