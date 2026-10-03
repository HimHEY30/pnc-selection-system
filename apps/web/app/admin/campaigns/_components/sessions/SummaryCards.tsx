import type { SessionSummary } from "@/lib/sessions/types";
import { t } from "@/lib/messages";

const text = t.sessions.summary;

function Card({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[28px] font-bold leading-none text-ink">{value}</dd>
      <dd className="mt-2 text-[13px] text-ink-muted">{detail}</dd>
    </div>
  );
}

/** The campaign's totals: sessions, how many candidates are expected, and how many came (females and males). */
export default function SummaryCards({ summary }: { summary: SessionSummary }) {
  return (
    <dl aria-label={text.label} className="grid gap-3 sm:grid-cols-3">
      <Card label={text.sessions} value={summary.total} detail={text.sessionsDetail(summary.planned, summary.done, summary.cancelled)} />
      <Card label={text.expected} value={summary.expectedCandidates} detail={text.expectedDetail} />
      <Card label={text.attended} value={summary.actualTotal} detail={text.attendedDetail(summary.actualFemale, summary.actualMale)} />
    </dl>
  );
}
