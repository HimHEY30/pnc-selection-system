import RowActionsMenu from "@/components/ui/RowActionsMenu";
import { formatDate, formatTimeRange, isUnscheduled } from "@/lib/sessions/format";
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

// Wide screens get a table. Below `md` the same rows become stacked cards: each cell shows its column's name (from
// data-label) beside its value, so nothing is duplicated in the page and nothing scrolls sideways.
const CELL =
  "px-3 py-3 align-top text-sm text-ink max-md:flex max-md:gap-3 max-md:px-0 max-md:py-1 max-md:before:w-24 max-md:before:shrink-0 max-md:before:text-xs max-md:before:font-semibold max-md:before:text-ink-muted max-md:before:content-[attr(data-label)]";
const NO_LABEL = "max-md:before:hidden";

/** The campaign's sessions as a table, one row each, so a long list stays easy to scan; cards on a phone. */
export default function SessionsTable({ sessions, direction, onToggleSort, canChange, canEnterNumbers, onEdit, onCancel, onNumbers }: Props) {
  return (
    <div className="overflow-x-auto md:rounded-2xl md:border md:border-line md:bg-surface">
      {/* Explicit roles keep the table's meaning for assistive technology when the cards below `md` change its display. */}
      <table role="table" aria-label={t.sessions.listLabel} className="w-full border-collapse md:min-w-[56rem]">
        <thead role="rowgroup" className="border-b border-line bg-canvas max-md:sr-only">
          <tr role="row">
            <th role="columnheader" scope="col" aria-sort={direction === "asc" ? "ascending" : "descending"} className={HEAD}>
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
            <th role="columnheader" scope="col" className={HEAD}>{text.session}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.runBy}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.responsible}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.status}</th>
            <th role="columnheader" scope="col" className={`${HEAD} text-right`}>{text.expected}</th>
            <th role="columnheader" scope="col" className={`${HEAD} text-right`}>{text.attended}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.actions}</th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-md:flex max-md:flex-col max-md:gap-3 md:divide-y md:divide-line">
          {sessions.map((session) => {
            const cancelled = session.status === "Cancelled";
            const attendance = session.attendance;
            const changeable = canChange(session);
            const numbers = canEnterNumbers(session);
            return (
              <tr
                key={session.id}
                role="row"
                className="transition-colors duration-150 hover:bg-canvas/70 max-md:relative max-md:block max-md:rounded-2xl max-md:border max-md:border-line max-md:bg-surface max-md:p-4"
              >
                <td role="cell" data-label={text.date} className={`${CELL} whitespace-nowrap ${NO_LABEL}`}>
                  {session.date && session.startTime && session.endTime ? (
                    <div>
                      <span className="font-semibold">{formatDate(session.date)}</span>
                      <span className="block text-ink-muted">{formatTimeRange(session.startTime, session.endTime)}</span>
                    </div>
                  ) : (
                    <span className="text-ink-muted">{text.notScheduled}</span>
                  )}
                </td>
                <td role="cell" className={`${CELL} max-w-64 max-md:max-w-none max-md:pr-10 ${NO_LABEL}`}>
                  <div className="min-w-0">
                    <span className={`font-semibold ${cancelled ? "text-ink-muted line-through" : ""}`}>{session.title}</span>
                    <span className="block break-words text-ink-muted">
                      {t.sessions.labels.format[session.format]}
                      {session.venue ? ` · ${session.venue}` : ""}
                    </span>
                    {cancelled && session.cancelReason && (
                      <span className="mt-1 block text-ink-muted">{card.cancelReason(session.cancelReason)}</span>
                    )}
                  </div>
                </td>
                <td role="cell" data-label={text.runBy} className={CELL}>
                  {session.host ? (
                    <div>
                      <span className="font-semibold">{session.host.name}</span>
                      <span className="block text-ink-muted">
                        {t.sessions.labels.hostType[session.host.type]}
                        {session.host.partnerKind ? ` (${t.sessions.labels.partnerKind[session.host.partnerKind]})` : ""}
                        {!session.host.isActive ? ` · ${card.hostOff}` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ink-muted">{text.notSet}</span>
                  )}
                </td>
                <td role="cell" data-label={text.responsible} className={CELL}>
                  {session.assignee ? session.assignee.name : <span className="text-ink-muted">{text.notSet}</span>}
                </td>
                <td role="cell" data-label={text.status} className={CELL}>
                  <SessionStatusBadge status={session.status} />
                </td>
                <td role="cell" data-label={text.expected} className={`${CELL} md:text-right tabular-nums`}>
                  {session.expectedCandidates ?? <span className="text-ink-muted">{text.notSet}</span>}
                </td>
                <td role="cell" data-label={text.attended} className={`${CELL} md:text-right tabular-nums`}>
                  {attendance ? (
                    <div>
                      <span className="font-semibold">{attendance.total}</span>
                      <span className="block text-ink-muted">
                        {attendance.female} {card.female} · {attendance.male} {card.male}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ink-muted">{text.notSet}</span>
                  )}
                </td>
                <td role="cell" className={`${CELL} w-px max-md:absolute max-md:right-2 max-md:top-3 max-md:w-auto max-md:p-0 ${NO_LABEL}`}>
                  <RowActionsMenu
                    label={text.actionsFor(session.title)}
                    actions={[
                      ...(numbers ? [{ label: card.numbers, onSelect: () => onNumbers(session) }] : []),
                      ...(changeable
                        ? [
                            { label: isUnscheduled(session) ? card.schedule : card.edit, onSelect: () => onEdit(session) },
                            { label: card.cancel, onSelect: () => onCancel(session) },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
