import type { CandidateFilters } from "./types";

// The list's search, filters and page live in the web address (?q=chenda&province=Siem Reap&ngo=yes&page=2), so a page
// can be bookmarked, shared and reached with the Back button. What arrives in the address is whatever anyone typed, so
// it is cleaned before it is used.

type RawParams = Record<string, string | string[] | undefined>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 100;
const MAX_PAGE = 100_000;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The filters in an address's query string. Anything that is not understood is left out, never guessed. */
export function parseFilters(params: RawParams): CandidateFilters {
  const filters: CandidateFilters = {};

  const q = first(params.q)?.trim().slice(0, MAX_TEXT);
  if (q) filters.q = q;

  const province = first(params.province)?.trim().slice(0, MAX_TEXT);
  if (province) filters.province = province;

  const session = first(params.sessionId)?.trim();
  if (session && GUID.test(session)) filters.sessionId = session;

  const ngo = first(params.ngo);
  if (ngo === "yes" || ngo === "no") filters.ngo = ngo;

  const page = Number(first(params.page));
  if (Number.isInteger(page) && page > 1 && page <= MAX_PAGE) filters.page = page;

  return filters;
}

/** The query string (with its "?", or empty) for a set of filters. Page 1 is left out: it is what no page means. */
export function filtersToUrl(filters: CandidateFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.province) params.set("province", filters.province);
  if (filters.sessionId) params.set("sessionId", filters.sessionId);
  if (filters.ngo) params.set("ngo", filters.ngo);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when anything narrows the list (the page does not count). */
export const isFiltering = (filters: CandidateFilters): boolean =>
  Boolean(filters.q?.trim() || filters.province || filters.sessionId || filters.ngo);
