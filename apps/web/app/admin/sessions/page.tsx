import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { cambodiaToday } from "@/lib/sessions/format";
import { loadMySessions } from "@/lib/sessions/api";
import { t } from "@/lib/messages";
import MySessionsList from "../campaigns/_components/sessions/MySessionsList";

export const metadata: Metadata = { title: "My information sessions" };

export default async function MySessionsPage() {
  const sessions = await loadMySessions();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={t.sessions.mine.title}
        description={t.sessions.mine.subtitle}
        actions={
          <Link href="/admin/sessions/hosts" className={buttonClasses("secondary")}>
            {t.sessions.mine.hosts}
          </Link>
        }
      />

      <MySessionsList sessions={sessions} today={cambodiaToday()} />
    </div>
  );
}
