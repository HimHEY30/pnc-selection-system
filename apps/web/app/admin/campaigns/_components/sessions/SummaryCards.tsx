import type { ReactNode } from "react";
import type { SessionSummary } from "@/lib/sessions/types";
import { t } from "@/lib/messages";

const text = t.sessions.summary;

function Icon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

function Card({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-overlay">
      <Icon>{icon}</Icon>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
        <dd className="mt-1 text-[28px] font-bold leading-none tabular-nums text-ink">{value}</dd>
        <dd className="mt-2 text-[13px] text-ink-muted">{detail}</dd>
      </div>
    </div>
  );
}

/** The campaign's totals: sessions, how many candidates are expected, and how many came (females and males). */
export default function SummaryCards({ summary }: { summary: SessionSummary }) {
  return (
    <dl aria-label={text.label} className="grid gap-3 sm:grid-cols-3">
      <Card
        label={text.sessions}
        value={summary.total}
        detail={text.sessionsDetail(summary.planned, summary.done, summary.cancelled, summary.unscheduled)}
        icon={<path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />}
      />
      <Card
        label={text.expected}
        value={summary.expectedCandidates}
        detail={text.expectedDetail}
        icon={<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" />}
      />
      <Card
        label={text.attended}
        value={summary.actualTotal}
        detail={text.attendedDetail(summary.actualFemale, summary.actualMale)}
        icon={<path d="M5 12.5l4.5 4.5L19 7.5" />}
      />
    </dl>
  );
}
