import Link from "next/link";
import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import { formatDate, formatTimeRange } from "@/lib/sessions/format";
import type { InformationSession, SessionStatus } from "@/lib/sessions/types";
import { t } from "@/lib/messages";

type Props = {
  session: InformationSession;
  /** Shown above the title when sessions of several campaigns are listed together. */
  campaign?: { id: string; name: string };
  /** Edit and cancel are for someone who may manage, on a planned session of a campaign that is not closed. */
  canChange: boolean;
  /** Entering the numbers is open to officers too, on any session that is not cancelled. */
  canEnterNumbers: boolean;
  onEdit?: (session: InformationSession) => void;
  onCancel?: (session: InformationSession) => void;
  onNumbers?: (session: InformationSession) => void;
};

// Fills carry dark text (or the dark blue on a pale blue); white text is never used here.
const STATUS_TONE: Record<SessionStatus, string> = {
  Planned: "bg-warning-soft text-ink",
  Done: "bg-primary-soft text-primary",
  Cancelled: "bg-neutral-soft text-ink-muted",
};

/** The label is always text, so the status never depends on colour alone. */
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}>
      {status === "Done" && (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {t.sessions.labels.status[status]}
    </span>
  );
}

const text = t.sessions.card;

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] text-ink">{children}</dd>
    </div>
  );
}

/** One information session: when, where, who is responsible and who runs it, the numbers, and what can be done. */
export default function SessionCard({ session, campaign, canChange, canEnterNumbers, onEdit, onCancel, onNumbers }: Props) {
  const cancelled = session.status === "Cancelled";
  const titleId = `session-${session.id}`;
  const host = session.host;
  const attendance = session.attendance;
  const showActions = (canChange && (onEdit || onCancel)) || (canEnterNumbers && onNumbers);

  return (
    <li aria-labelledby={titleId} className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {campaign && (
            <p className="mb-1 text-xs font-semibold text-ink-muted">
              <Link href={`/admin/campaigns/${campaign.id}/sessions`} className="hover:underline focus-ring">
                {campaign.name}
              </Link>
            </p>
          )}
          <h3 id={titleId} className={`text-[17px] font-bold ${cancelled ? "text-ink-muted line-through" : "text-ink"}`}>
            {session.title}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDate(session.date)} · {formatTimeRange(session.startTime, session.endTime)} · {t.sessions.labels.format[session.format]}
          </p>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>

      {cancelled && session.cancelReason && (
        <p className="mt-3 rounded-lg bg-neutral-soft px-3 py-2 text-sm text-ink">{text.cancelReason(session.cancelReason)}</p>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {session.venue && <Detail label={text.venue}>{session.venue}</Detail>}
        {session.meetingLink && (
          <Detail label={text.link}>
            <a href={session.meetingLink} target="_blank" rel="noopener noreferrer" className="text-primary underline focus-ring">
              {session.meetingLink}
            </a>
          </Detail>
        )}
        {session.province && <Detail label={text.province}>{session.province.name}</Detail>}
        <Detail label={text.responsible}>{session.assignee.name}</Detail>
        <Detail label={text.runBy}>
          <span className="font-semibold">{host.name}</span>
          <span className="text-ink-muted">
            {" "}
            · {t.sessions.labels.hostType[host.type]}
            {host.partnerKind ? ` (${t.sessions.labels.partnerKind[host.partnerKind]})` : ""}
          </span>
          {!host.isActive && <span className="ml-2 rounded-full bg-neutral-soft px-2 py-0.5 text-xs font-semibold text-ink-muted">{text.hostOff}</span>}
          {(host.phone || host.email) && (
            <span className="mt-0.5 block text-sm text-ink-muted">
              {host.phone && (
                <a href={`tel:${host.phone.replace(/[^+\d]/g, "")}`} className="hover:underline focus-ring">
                  {host.phone}
                </a>
              )}
              {host.phone && host.email && " · "}
              {host.email && (
                <a href={`mailto:${host.email}`} className="hover:underline focus-ring">
                  {host.email}
                </a>
              )}
            </span>
          )}
        </Detail>
        <Detail label={text.expected}>
          {session.expectedCandidates === null ? <span className="text-ink-muted">{text.notSet}</span> : session.expectedCandidates}
        </Detail>
        <Detail label={text.attended}>
          {attendance ? (
            <>
              <span className="font-semibold">{attendance.total}</span>{" "}
              <span className="text-ink-muted">
                ({attendance.female} {text.female} · {attendance.male} {text.male})
              </span>
            </>
          ) : (
            <span className="text-ink-muted">{text.notRecorded}</span>
          )}
        </Detail>
        {session.notes && (
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{text.notes}</dt>
            <dd className="mt-0.5 whitespace-pre-line break-words text-[15px] text-ink">{session.notes}</dd>
          </div>
        )}
      </dl>

      {showActions && (
        <div role="group" aria-label={text.actionsFor(session.title)} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {canEnterNumbers && onNumbers && (
            <Button variant="primary" onClick={() => onNumbers(session)}>
              {text.numbers}
            </Button>
          )}
          {canChange && onEdit && <Button onClick={() => onEdit(session)}>{text.edit}</Button>}
          {canChange && onCancel && <Button onClick={() => onCancel(session)}>{text.cancel}</Button>}
        </div>
      )}
    </li>
  );
}
