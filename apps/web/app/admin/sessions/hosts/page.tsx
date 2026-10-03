import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { loadHosts } from "@/lib/sessions/api";
import { canManageCampaigns } from "@/lib/permissions";
import { t } from "@/lib/messages";
import HostsManager from "../../campaigns/_components/sessions/HostsManager";

export const metadata: Metadata = { title: "Alumni and partners" };

export default async function HostsPage() {
  const [session, hosts] = await Promise.all([auth(), loadHosts(true)]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/admin/sessions" className="text-sm font-semibold text-primary hover:underline focus-ring">
          {t.sessions.hosts.back}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-ink">{t.sessions.hosts.title}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.sessions.hosts.subtitle}</p>
      </div>

      <HostsManager hosts={hosts} canManage={canManageCampaigns(session?.roles ?? [])} />
    </div>
  );
}
