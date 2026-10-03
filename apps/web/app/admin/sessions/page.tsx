import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { cambodiaToday } from "@/lib/sessions/format";
import { loadMySessions } from "@/lib/sessions/api";
import { t } from "@/lib/messages";
import MySessionsList from "../campaigns/_components/sessions/MySessionsList";

export const metadata: Metadata = { title: "My information sessions" };

export default async function MySessionsPage() {
  const sessions = await loadMySessions();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">{t.sessions.mine.title}</h1>
          <p className="mt-1 text-[15px] text-ink-muted">{t.sessions.mine.subtitle}</p>
        </div>
        <Link href="/admin/sessions/hosts" className={buttonClasses("secondary")}>
          {t.sessions.mine.hosts}
        </Link>
      </div>

      <MySessionsList sessions={sessions} today={cambodiaToday()} />
    </div>
  );
}
