import Button from "@/components/ui/Button";
import { formatDate, formatTimeRange } from "@/lib/sessions/format";
import type { SortDirection } from "@/lib/sessions/list";
import type { InformationSession } from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import { SessionStatusBadge } from "./SessionCard";

type Props = {
  /** The rows to show: already filtered, ordered and cut to one page. */
  sessions: InformationSession[];
  direction: SortDirection;
  onToggleSort: () => void;
  /** Edit and cancel are offered when this says so for the session (a manager, a planned session, an open campaign). */
  canChange: (session: InformationSession) => boolean;
  canEnterNumbers: (session: InformationSession) => boolean;
  onEdit: (session: InformationSession) => void;
  onCancel: (session: InformationSession) => void;
  onNumbers: (session: InformationSession) => void;
};

const text = t.sessions.table;
const card = t.sessions.card;

const HEAD = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";
const CELL = "px-3 py-3 align-top text-sm text-ink";

/** The campaign's sessions as a table, one row each, so a long list stays easy to scan. */
export default function SessionsTable({ sessions, direction, onToggleSort, canChange, canEnterNumbers, onEdit, onCancel, onNumbers }: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table aria-label={t.sessions.listLabel} className="w-full min-w-[56rem] border-collapse">
        <thead className="border-b border-line bg-canvas">
          <tr>
            <th scope="col" aria-sort={direction === "asc" ? "ascending" : "descending"} className={HEAD}>
              <button
                type="button"
                onClick={onToggleSort}
                title={direction === "asc" ? text.sortedAsc : text.sortedDesc}
                className="inline-flex items-center gap-1 rounded uppercase tracking-wide focus-ring"
              >
                {text.date}
                <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
              </button>
            </th>
            <th scope="col" className={HEAD}>{text.session}</th>
            <th scope="col" className={HEAD}>{text.runBy}</th>
            <th scope="col" className={HEAD}>{text.responsible}</th>
            <th scope="col" className={HEAD}>{text.status}</th>
            <th scope="col" className={`${HEAD} text-right`}>{text.expected}</th>
            <th scope="col" className={`${HEAD} text-right`}>{text.attended}</th>
            <th scope="col" className={HEAD}>{text.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sessions.map((session) => {
            const cancelled = session.status === "Cancelled";
            const attendance = session.attendance;
            const changeable = canChange(session);
            const numbers = canEnterNumbers(session);
            return (
              <tr key={session.id}>
                <td className={`${CELL} whitespace-nowrap`}>
                  <span className="font-semibold">{formatDate(session.date)}</span>
                  <span className="block text-ink-muted">{formatTimeRange(session.startTime, session.endTime)}</span>
                </td>
                <td className={`${CELL} max-w-64`}>
                  <span className={`font-semibold ${cancelled ? "text-ink-muted line-through" : ""}`}>{session.title}</span>
                  <span className="block break-words text-ink-muted">
                    {t.sessions.labels.format[session.format]}
                    {session.venue ? ` · ${session.venue}` : ""}
                  </span>
                  {cancelled && session.cancelReason && (
                    <span className="mt-1 block text-ink-muted">{card.cancelReason(session.cancelReason)}</span>
                  )}
                </td>
                <td className={CELL}>
                  <span className="font-semibold">{session.host.name}</span>
                  <span className="block text-ink-muted">
                    {t.sessions.labels.hostType[session.host.type]}
                    {session.host.partnerKind ? ` (${t.sessions.labels.partnerKind[session.host.partnerKind]})` : ""}
                    {!session.host.isActive ? ` · ${card.hostOff}` : ""}
                  </span>
                </td>
                <td className={CELL}>{session.assignee.name}</td>
                <td className={CELL}>
                  <SessionStatusBadge status={session.status} />
                </td>
                <td className={`${CELL} text-right tabular-nums`}>{session.expectedCandidates ?? <span className="text-ink-muted">{text.notSet}</span>}</td>
                <td className={`${CELL} text-right tabular-nums`}>
                  {attendance ? (
                    <>
                      <span className="font-semibold">{attendance.total}</span>
                      <span className="block text-ink-muted">
                        {attendance.female} {card.female} · {attendance.male} {card.male}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-muted">{text.notSet}</span>
                  )}
                </td>
                <td className={CELL}>
                  {(numbers || changeable) && (
                    <div className="flex flex-wrap gap-2">
                      {numbers && (
                        <Button variant="primary" aria-label={text.rowAction(card.numbers, session.title)} onClick={() => onNumbers(session)}>
                          {card.numbers}
                        </Button>
                      )}
                      {changeable && (
                        <>
                          <Button aria-label={text.rowAction(card.edit, session.title)} onClick={() => onEdit(session)}>
                            {card.edit}
                          </Button>
                          <Button aria-label={text.rowAction(card.cancel, session.title)} onClick={() => onCancel(session)}>
                            {card.cancel}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
