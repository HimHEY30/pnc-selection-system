import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { loadCampaign } from "@/lib/campaigns/api";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import { cambodiaToday } from "@/lib/sessions/format";
import { loadAssignable, loadHosts, loadSessionList } from "@/lib/sessions/api";
import SessionsManager from "../../_components/sessions/SessionsManager";
import StepTabs from "../../_components/StepTabs";

export const metadata: Metadata = { title: "Step 3: Information sessions" };

export default async function SessionsPage({ params }: PageProps<"/admin/campaigns/[id]/sessions">) {
  const { id } = await params;
  const [session, campaign, list] = await Promise.all([auth(), loadCampaign(id), loadSessionList(id)]);
  if (!campaign || !list) notFound();

  // Admin and manager may add and change sessions (unless the campaign is closed). Everyone else who can open the
  // admin area sees the same page and can enter the numbers. Only someone who can add sessions needs the host
  // directory and the staff list, so only they cost those two calls.
  const canManage = canManageCampaigns(session?.roles ?? []);
  const [hosts, assignable] = canManage && list.isEditable ? await Promise.all([loadHosts(), loadAssignable()]) : [[], null];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Link href={`/admin/campaigns/${campaign.id}`} className="text-sm font-semibold text-primary hover:underline focus-ring">
          {t.info.back}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-ink">{t.sessions.title}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.sessions.subtitle}</p>
      </div>

      <StepTabs steps={campaign.steps} current="InformationSessions" />

      {/* Keyed by id so moving between campaigns never carries one page's filters or open dialog into another. */}
      <SessionsManager key={campaign.id} list={list} today={cambodiaToday()} hosts={hosts} assignable={assignable} canManage={canManage} />
    </div>
  );
}
