import type { Metadata } from "next";
import { auth } from "@/auth";
import PageHeader from "@/components/ui/PageHeader";
import { loadHosts } from "@/lib/sessions/api";
import { canManageCampaigns } from "@/lib/permissions";
import { t } from "@/lib/messages";
import HostsManager from "../../campaigns/_components/sessions/HostsManager";

export const metadata: Metadata = { title: "Alumni and partners" };

export default async function HostsPage() {
  const [session, hosts] = await Promise.all([auth(), loadHosts(true)]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={t.sessions.hosts.title} description={t.sessions.hosts.subtitle} back={{ href: "/admin/sessions", label: t.sessions.hosts.back }} />

      <HostsManager hosts={hosts} canManage={canManageCampaigns(session?.roles ?? [])} />
    </div>
  );
}
