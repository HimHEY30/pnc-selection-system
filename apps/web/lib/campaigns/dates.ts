const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as yyyy-mm-dd (what <input type="date"> produces). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * "2026-11-02" -> "2 Nov 2026". Done by hand from the string, not through Date and a
 * locale, so the result is identical on the server and in the browser in any time zone.
 */
export function formatDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** yyyy-mm-dd strings sort the same as the dates they describe. */
export function isEndAfterStart(start: string, end: string): boolean {
  return end > start;
}

// PNC staff work in Cambodia, so times are always shown in that zone. A fixed zone
// also keeps server-rendered and browser-rendered text the same.
const SAVED_TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Phnom_Penh",
});

/** ISO timestamp -> "9:12 AM". */
export function formatSavedTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : SAVED_TIME.format(date);
}
