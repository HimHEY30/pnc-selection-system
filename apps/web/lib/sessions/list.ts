import type { InformationSession } from "./types";

// Pure helpers for the sessions page: which sessions are coming up, in what order the table lists them, and how
// it is cut into pages. No React here, so they are easy to test.

/** How many sessions the table shows at a time. A campaign can have 60 or more. */
export const PAGE_SIZE = 10;

/** How many upcoming sessions are shown as cards above the table. */
export const UPCOMING_LIMIT = 3;

export type SortDirection = "asc" | "desc";

const byStart = (a: InformationSession, b: InformationSession) =>
  a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);

/** Planned sessions that have not happened yet, soonest first, at most `limit`. */
export function upcomingSessions(sessions: InformationSession[], today: string, limit: number = UPCOMING_LIMIT): InformationSession[] {
  return sessions
    .filter((s) => s.status === "Planned" && s.date >= today)
    .sort(byStart)
    .slice(0, limit);
}

/** A copy of the sessions ordered by when they start. */
export function sortByStart(sessions: InformationSession[], direction: SortDirection): InformationSession[] {
  const sorted = [...sessions].sort(byStart);
  return direction === "asc" ? sorted : sorted.reverse();
}

/** Whether the title, venue, host or person responsible contains what was typed, ignoring case and outer spaces. */
export function matchesSearch(session: InformationSession, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [session.title, session.venue ?? "", session.host.name, session.assignee.name].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

export type Page<T> = { items: T[]; page: number; pageCount: number; from: number; to: number };

/** One page of `items` (1-based). A page past the end, as when filters shrink the list, is brought back to the last. */
export function pageOf<T>(items: T[], page: number, size: number = PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: current, pageCount, from: slice.length ? start + 1 : 0, to: start + slice.length };
}
