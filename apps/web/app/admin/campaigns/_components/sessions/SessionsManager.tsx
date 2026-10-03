"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Select, TextInput } from "@/components/ui/inputs";
import { canChangeDetails, canEnterNumbers } from "@/lib/sessions/format";
import { matchesSearch, pageOf, sortByStart, upcomingSessions, type SortDirection } from "@/lib/sessions/list";
import {
  HOST_TYPES,
  type AssignableStaff,
  type Host,
  type HostType,
  type InformationSession,
  type SessionList,
  type SessionStatus,
} from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import CancelDialog from "./CancelDialog";
import NumbersDialog from "./NumbersDialog";
import SessionCard from "./SessionCard";
import SessionFormDialog, { type SessionDialogTarget } from "./SessionFormDialog";
import SessionsTable from "./SessionsTable";
import SummaryCards from "./SummaryCards";

type Props = {
  list: SessionList;
  /** Today on the Cambodia calendar (yyyy-mm-dd), worked out on the server so the first paint matches. */
  today: string;
  /** The alumni and partners that can be chosen. Empty for someone who cannot add or change sessions. */
  hosts: Host[];
  /** Who sessions can be assigned to. Null for someone who cannot add or change sessions. */
  assignable: AssignableStaff | null;
  /** The signed-in person may add and change sessions (admin or manager). */
  canManage: boolean;
};

type Filters = { status: "" | SessionStatus; hostType: "" | HostType; assignee: string };
const NO_FILTERS: Filters = { status: "", hostType: "", assignee: "" };
const STATUSES: SessionStatus[] = ["Planned", "Done", "Cancelled"];

const text = t.sessions;

/**
 * A campaign's information sessions: the totals, the next three as cards, then every session in a table with
 * filters, search and pages (a campaign can have 60 or more), and the dialogs to add, change, cancel and enter
 * numbers. It holds no copy of the sessions: every change goes through a server action that refreshes the page, so
 * what is shown always comes from the server. The dialogs are told which session by id, so they follow the
 * refreshed data.
 */
export default function SessionsManager({ list, today, hosts, assignable, canManage }: Props) {
  const [filters, setFiltersState] = useState<Filters>(NO_FILTERS);
  const [search, setSearchState] = useState("");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ kind: "create" } | { kind: "edit"; id: string } | null>(null);
  const [numbersId, setNumbersId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const manageNow = canManage && list.isEditable && assignable !== null;
  const byId = (id: string | null) => list.sessions.find((s) => s.id === id) ?? null;

  const formTarget: SessionDialogTarget | null = useMemo(() => {
    if (!form) return null;
    if (form.kind === "create") return { kind: "create" };
    const session = list.sessions.find((s) => s.id === form.id);
    return session ? { kind: "edit", session } : null;
  }, [form, list.sessions]);

  const assignees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of list.sessions) seen.set(s.assignee.id, s.assignee.name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list.sessions]);

  // Narrowing the list can leave the current page past its end, so every change of what is shown goes back to page 1.
  const setFilters = (update: (f: Filters) => Filters) => {
    setFiltersState(update);
    setPage(1);
  };
  const setSearch = (value: string) => {
    setSearchState(value);
    setPage(1);
  };
  const clearAll = () => {
    setFiltersState(NO_FILTERS);
    setSearchState("");
    setPage(1);
  };

  const shown = sortByStart(
    list.sessions.filter(
      (s) =>
        (!filters.status || s.status === filters.status) &&
        (!filters.hostType || s.host.type === filters.hostType) &&
        (!filters.assignee || s.assignee.id === filters.assignee) &&
        matchesSearch(s, search),
    ),
    direction,
  );
  const filtering = filters.status !== "" || filters.hostType !== "" || filters.assignee !== "" || search.trim() !== "";
  const current = pageOf(shown, page);
  const upcoming = useMemo(() => upcomingSessions(list.sessions, today), [list.sessions, today]);
  const upcomingTotal = useMemo(() => list.sessions.filter((s) => s.status === "Planned" && s.date >= today).length, [list.sessions, today]);

  const openNumbers = (s: InformationSession) => setNumbersId(s.id);
  const canChange = (s: InformationSession) => manageNow && canChangeDetails(s, list.isEditable, canManage);

  return (
    <div className="flex flex-col gap-6">
      {!canManage && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">{text.readOnlyOfficer}</p>
      )}
      {canManage && !list.isEditable && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">{text.readOnlyClosed}</p>
      )}

      <SummaryCards summary={list.summary} />

      {list.sessions.length === 0 ? (
        <EmptyState
          compact
          title={text.empty.title}
          description={manageNow ? text.empty.description : text.empty.readOnly}
          action={manageNow ? <Button variant="primary" size="lg" onClick={() => setForm({ kind: "create" })}>{text.add}</Button> : undefined}
        />
      ) : (
        <>
        <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="upcoming-title" className="text-[17px] font-bold text-ink">
              {text.upcoming.title}
            </h2>
            {upcomingTotal > upcoming.length && (
              <p className="text-sm text-ink-muted">{text.upcoming.more(upcomingTotal - upcoming.length)}</p>
            )}
          </div>
          {upcoming.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-ink-muted">{text.upcoming.none}</p>
          ) : (
            <ul aria-label={text.upcoming.title} className="grid gap-4 lg:grid-cols-3">
              {upcoming.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  compact
                  canChange={canChange(session)}
                  canEnterNumbers={canEnterNumbers(session)}
                  onEdit={(s) => setForm({ kind: "edit", id: s.id })}
                  onCancel={(s) => setCancelId(s.id)}
                  onNumbers={openNumbers}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="sessions-list-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="sessions-list-title" className="text-[17px] font-bold text-ink">
              {text.table.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div role="group" aria-label={text.filters.label} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.table.search}
                <TextInput
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={text.table.searchPlaceholder}
                  className="min-w-52 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.filters.status}
                <Select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}
                  className="min-w-36 py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {text.labels.status[status]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.filters.hostType}
                <Select
                  value={filters.hostType}
                  onChange={(e) => setFilters((f) => ({ ...f, hostType: e.target.value as Filters["hostType"] }))}
                  className="min-w-36 py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  {HOST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {text.labels.hostType[type]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.filters.assignee}
                <Select
                  value={filters.assignee}
                  onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
                  className="min-w-44 py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  {assignees.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </label>
              {filtering && <Button onClick={clearAll}>{text.filters.clear}</Button>}
            </div>

            {manageNow && (
              <Button variant="primary" onClick={() => setForm({ kind: "create" })}>
                {text.add}
              </Button>
            )}
          </div>

          <p aria-live="polite" className="text-sm text-ink-muted">
            {text.filters.showing(shown.length, list.sessions.length)}
          </p>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center">
              <p className="text-[17px] font-bold text-ink">{text.empty.filteredTitle}</p>
              <p className="mt-1 text-sm text-ink-muted">{text.empty.filteredDescription}</p>
            </div>
          ) : (
            <>
              <SessionsTable
                sessions={current.items}
                direction={direction}
                onToggleSort={() => {
                  setDirection((d) => (d === "asc" ? "desc" : "asc"));
                  setPage(1);
                }}
                canChange={canChange}
                canEnterNumbers={canEnterNumbers}
                onEdit={(s) => setForm({ kind: "edit", id: s.id })}
                onCancel={(s) => setCancelId(s.id)}
                onNumbers={openNumbers}
              />
              <nav aria-label={text.table.pageLabel} className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-muted">{text.table.rows(current.from, current.to, shown.length)}</p>
                <div className="flex items-center gap-3">
                  <Button disabled={current.page <= 1} onClick={() => setPage(current.page - 1)}>
                    {text.table.previous}
                  </Button>
                  <span aria-live="polite" className="text-sm text-ink">
                    {text.table.pageOf(current.page, current.pageCount)}
                  </span>
                  <Button disabled={current.page >= current.pageCount} onClick={() => setPage(current.page + 1)}>
                    {text.table.next}
                  </Button>
                </div>
              </nav>
            </>
          )}
        </section>
        </>
      )}

      {assignable && (
        <SessionFormDialog
          target={formTarget}
          campaignId={list.campaignId}
          targetProvinces={list.targetProvinces}
          hosts={hosts}
          assignable={assignable}
          onClose={() => setForm(null)}
        />
      )}
      <NumbersDialog session={byId(numbersId)} onClose={() => setNumbersId(null)} />
      <CancelDialog session={byId(cancelId)} onClose={() => setCancelId(null)} />
    </div>
  );
}
