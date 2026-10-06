"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
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

/** How long a "saved" notice stays before it goes by itself. */
const NOTICE_MS = 6000;

const FILTER_LABEL = "text-xs font-semibold text-ink-muted";

/**
 * A campaign's candidates: a search box and filters, one page of the table, pages, and the dialogs to add, change and
 * delete. The search, the filters and the page live in the web address, so the server does the narrowing and a long
 * list never has to be sent at once. It keeps no copy of the candidates: every change goes through a server action that
 * refreshes the page.
 */
export default function CandidatesManager({ list, filters, sessions, schools, canDelete }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(filters.q ?? "");
  const [form, setForm] = useState<{ kind: "create" } | { kind: "edit"; id: string } | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [removing, startRemoving] = useTransition();

  const filtering = isFiltering(filters);
  const canEdit = list.canChange;
  const mayDelete = canDelete && list.canChange;
  /** How many of the three filters are set, for the badge on the small-screen Filters button. */
  const activeFilters = [filters.province, filters.sessionId, filters.ngo].filter(Boolean).length;

  const formTarget: CandidateDialogTarget | null = useMemo(() => {
    if (!form) return null;
    if (form.kind === "create") return { kind: "create" };
    const candidate = list.items.find((c) => c.id === form.id);
    return candidate ? { kind: "edit", candidate } : null;
  }, [form, list.items]);

  // A notice goes by itself, so it never sits there after the moment has passed.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

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
      if (result.ok) setNotice(text.saved.deleted);
    });
  }

  const from = (list.page - 1) * list.pageSize + 1;
  const to = from + list.items.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {!list.canChange && <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">{text.readOnlyClosed}</p>}

      {deleteMessage && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {deleteMessage}
        </p>
      )}

      {notice && (
        <div role="status" className="motion-rise flex items-center justify-between gap-3 rounded-lg border border-primary-line bg-primary-soft px-4 py-3 text-sm font-medium text-ink">
          <span className="flex items-center gap-2">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-surface focus-ring">
            {text.saved.dismiss}
          </button>
        </div>
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
        <section aria-label={text.listLabel} aria-busy={removing || navigating} className="flex flex-col gap-4">
          <div role="group" aria-label={text.filters.label} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-end gap-3">
              <form onSubmit={submitSearch} role="search" className="flex min-w-0 flex-1 basis-64 items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="sr-only">{text.filters.search}</span>
                  <span className="relative">
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                    </svg>
                    <TextInput
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={text.filters.searchPlaceholder}
                      maxLength={100}
                      className="py-2 pl-9 text-sm"
                    />
                  </span>
                </label>
                <Button type="submit">{text.filters.searchButton}</Button>
              </form>

              <Button
                aria-expanded={filtersOpen}
                aria-controls="candidate-filters"
                onClick={() => setFiltersOpen((open) => !open)}
                className="md:hidden"
              >
                {text.filters.toggle(activeFilters)}
              </Button>

              {canEdit && (
                <Button variant="primary" onClick={() => setForm({ kind: "create" })} className="max-md:w-full md:ml-auto">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {text.add}
                </Button>
              )}
            </div>

            {/* Always shown from `md` up; on a phone they stay behind the Filters button until it is pressed. */}
            <div id="candidate-filters" className={`${filtersOpen ? "grid" : "hidden"} mt-3 gap-3 border-t border-line pt-3 sm:grid-cols-3 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end`}>
              <label className="flex flex-col gap-1">
                <span className={FILTER_LABEL}>{text.filters.province}</span>
                <Select value={filters.province ?? ""} onChange={(e) => changeFilter({ province: e.target.value || undefined })} className="py-2 text-sm">
                  <option value="">{text.filters.all}</option>
                  {list.provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                  {filters.province && !list.provinces.includes(filters.province) && <option value={filters.province}>{filters.province}</option>}
                </Select>
              </label>

              <label className="flex flex-col gap-1">
                <span className={FILTER_LABEL}>{text.filters.session}</span>
                <Select value={filters.sessionId ?? ""} onChange={(e) => changeFilter({ sessionId: e.target.value || undefined })} className="py-2 text-sm">
                  <option value="">{text.filters.all}</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.date ? `${session.title} · ${formatDate(session.date)}` : session.title}
                    </option>
                  ))}
                  {filters.sessionId && !sessions.some((s) => s.id === filters.sessionId) && <option value={filters.sessionId}>{text.filters.session}</option>}
                </Select>
              </label>

              <label className="flex flex-col gap-1">
                <span className={FILTER_LABEL}>{text.filters.ngo}</span>
                <Select
                  value={filters.ngo ?? ""}
                  onChange={(e) => changeFilter({ ngo: (e.target.value || undefined) as CandidateFilters["ngo"] })}
                  className="py-2 text-sm"
                >
                  <option value="">{text.filters.all}</option>
                  <option value="yes">{text.filters.ngoYes}</option>
                  <option value="no">{text.filters.ngoNo}</option>
                </Select>
              </label>

              {filtering && <Button onClick={clearAll}>{text.filters.clear}</Button>}
            </div>
          </div>

          <p aria-live="polite" className="px-1 text-sm text-ink-muted">
            {list.items.length > 0 ? text.filters.showing(from, to, list.totalCount) : text.filters.none(list.totalCount)}
          </p>

          {/* While a new page or filter is on its way the current rows stay, dimmed, instead of the screen going blank. */}
          <div className={`flex flex-col gap-4 transition-opacity duration-200 ${navigating ? "pointer-events-none opacity-50" : ""}`}>
            {list.items.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center">
                <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                </span>
                <p className="mt-4 text-[17px] font-bold text-ink">{text.empty.filteredTitle}</p>
                <p className="mt-1 max-w-sm text-sm text-ink-muted">{text.empty.filteredDescription}</p>
                {filtering && (
                  <Button className="mt-5" onClick={clearAll}>
                    {text.empty.clearFilters}
                  </Button>
                )}
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
                <nav aria-label={text.pager.label} className="flex items-center justify-between gap-3">
                  <Button disabled={list.page <= 1} onClick={() => go({ ...filters, page: list.page - 1 })}>
                    {text.pager.previous}
                  </Button>
                  <span aria-live="polite" className="text-sm text-ink-muted">
                    {text.pager.pageOf(list.page, list.totalPages)}
                  </span>
                  <Button disabled={list.page >= list.totalPages} onClick={() => go({ ...filters, page: list.page + 1 })}>
                    {text.pager.next}
                  </Button>
                </nav>
              </>
            )}
          </div>
        </section>
      )}

      {canEdit && (
        <CandidateFormDialog
          target={formTarget}
          campaignId={list.campaignId}
          sessions={sessions}
          schools={schools}
          onClose={() => setForm(null)}
          onSaved={(kind) => setNotice(kind === "created" ? text.saved.created : text.saved.updated)}
        />
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
