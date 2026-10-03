"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { Select, TextInput } from "@/components/ui/inputs";
import { filtersToUrl, isFiltering } from "@/lib/candidates/filters";
import type { Candidate, CandidateFilters, CandidateList, SchoolChoice, SessionChoice } from "@/lib/candidates/types";
import { t } from "@/lib/messages";
import { formatDate } from "@/lib/sessions/format";
import { deleteCandidateAction } from "../../candidates-actions";
import CandidateFormDialog, { type CandidateDialogTarget } from "./CandidateFormDialog";
import CandidatesTable from "./CandidatesTable";

type Props = {
  list: CandidateList;
  /** What the address asked for, already cleaned. The inputs start from it. */
  filters: CandidateFilters;
  /** The campaign's sessions a candidate can be said to have come to (for the form and for the filter). */
  sessions: SessionChoice[];
  /** The active high schools (for the form). Empty for someone who cannot add or change candidates. */
  schools: SchoolChoice[];
  /** The signed-in person may delete (admin or manager). */
  canDelete: boolean;
};

const text = t.candidates.list;

/**
 * A campaign's candidates: a search box and filters, one page of the table, pages, and the dialogs to add, change and
 * delete. The search, the filters and the page live in the web address, so the server does the narrowing and a long
 * list never has to be sent at once. It keeps no copy of the candidates: every change goes through a server action that
 * refreshes the page.
 */
export default function CandidatesManager({ list, filters, sessions, schools, canDelete }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startNavigation] = useTransition();
  const [search, setSearch] = useState(filters.q ?? "");
  const [form, setForm] = useState<{ kind: "create" } | { kind: "edit"; id: string } | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  const filtering = isFiltering(filters);
  const canEdit = list.canChange;
  const mayDelete = canDelete && list.canChange;

  const formTarget: CandidateDialogTarget | null = useMemo(() => {
    if (!form) return null;
    if (form.kind === "create") return { kind: "create" };
    const candidate = list.items.find((c) => c.id === form.id);
    return candidate ? { kind: "edit", candidate } : null;
  }, [form, list.items]);

  /** Goes to the page for these filters. Changing what is asked for always goes back to the first page. */
  const go = (next: CandidateFilters) => startNavigation(() => router.replace(`${pathname}${filtersToUrl({ ...next, page: next.page ?? 1 })}`));

  const changeFilter = (change: Partial<CandidateFilters>) => go({ ...filters, ...change, page: 1 });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    changeFilter({ q: search.trim() || undefined });
  }

  function clearAll() {
    setSearch("");
    go({});
  }

  function confirmDelete() {
    const target = deleting;
    if (!target) return;
    setDeleting(null);
    startRemoving(async () => {
      const result = await deleteCandidateAction(list.campaignId, target.id);
      setDeleteMessage(result.ok ? null : result.message);
    });
  }

  const from = (list.page - 1) * list.pageSize + 1;
  const to = from + list.items.length - 1;

  return (
    <div className="flex flex-col gap-6">
      {!list.canChange && <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">{text.readOnlyClosed}</p>}

      {deleteMessage && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {deleteMessage}
        </p>
      )}

      {list.totalCount === 0 && !filtering ? (
        <EmptyState
          compact
          title={text.empty.title}
          description={canEdit ? text.empty.description : text.empty.readOnly}
          action={
            canEdit ? (
              <Button variant="primary" size="lg" onClick={() => setForm({ kind: "create" })}>
                {text.add}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-label={text.listLabel} aria-busy={removing} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div role="group" aria-label={text.filters.label} className="flex flex-wrap items-end gap-3">
              <form onSubmit={submitSearch} role="search" className="flex items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                  {text.filters.search}
                  <TextInput
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={text.filters.searchPlaceholder}
                    maxLength={100}
                    className="min-w-52 py-2 text-sm"
                  />
                </label>
                <Button type="submit">{text.filters.searchButton}</Button>
              </form>

              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.filters.province}
                <Select
                  value={filters.province ?? ""}
                  onChange={(e) => changeFilter({ province: e.target.value || undefined })}
                  className="min-w-40 py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  {list.provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                  {filters.province && !list.provinces.includes(filters.province) && <option value={filters.province}>{filters.province}</option>}
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.filters.session}
                <Select
                  value={filters.sessionId ?? ""}
                  onChange={(e) => changeFilter({ sessionId: e.target.value || undefined })}
                  className="min-w-48 py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.date ? `${session.title} · ${formatDate(session.date)}` : session.title}
                    </option>
                  ))}
                  {filters.sessionId && !sessions.some((s) => s.id === filters.sessionId) && (
                    <option value={filters.sessionId}>{text.filters.session}</option>
                  )}
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.filters.ngo}
                <Select
                  value={filters.ngo ?? ""}
                  onChange={(e) => changeFilter({ ngo: (e.target.value || undefined) as CandidateFilters["ngo"] })}
                  className="min-w-40 py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  <option value="yes">{text.filters.ngoYes}</option>
                  <option value="no">{text.filters.ngoNo}</option>
                </Select>
              </label>

              {filtering && <Button onClick={clearAll}>{text.filters.clear}</Button>}
            </div>

            {canEdit && (
              <Button variant="primary" onClick={() => setForm({ kind: "create" })}>
                {text.add}
              </Button>
            )}
          </div>

          <p aria-live="polite" className="text-sm text-ink-muted">
            {list.items.length > 0 ? text.filters.showing(from, to, list.totalCount) : text.filters.none(list.totalCount)}
          </p>

          {list.items.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center">
              <p className="text-[17px] font-bold text-ink">{text.empty.filteredTitle}</p>
              <p className="mt-1 text-sm text-ink-muted">{text.empty.filteredDescription}</p>
            </div>
          ) : (
            <>
              <CandidatesTable
                candidates={list.items}
                canEdit={canEdit}
                canDelete={mayDelete}
                onEdit={(candidate) => setForm({ kind: "edit", id: candidate.id })}
                onDelete={setDeleting}
              />
              <nav aria-label={text.pager.label} className="flex flex-wrap items-center justify-end gap-3">
                <Button disabled={list.page <= 1} onClick={() => go({ ...filters, page: list.page - 1 })}>
                  {text.pager.previous}
                </Button>
                <span aria-live="polite" className="text-sm text-ink">
                  {text.pager.pageOf(list.page, list.totalPages)}
                </span>
                <Button disabled={list.page >= list.totalPages} onClick={() => go({ ...filters, page: list.page + 1 })}>
                  {text.pager.next}
                </Button>
              </nav>
            </>
          )}
        </section>
      )}

      {canEdit && (
        <CandidateFormDialog target={formTarget} campaignId={list.campaignId} sessions={sessions} schools={schools} onClose={() => setForm(null)} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? text.remove.title(deleting.nameEn) : ""}
        description={text.remove.body}
        confirmLabel={text.remove.confirm}
        cancelLabel={text.remove.keep}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
