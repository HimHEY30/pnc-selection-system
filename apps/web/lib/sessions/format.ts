import { t } from "@/lib/messages";
import type { InformationSession, SessionHost } from "./types";

// Small pure helpers that turn session data into what a person reads. No React here, so they are easy to test.

const CAMBODIA_OFFSET_HOURS = 7;

/** Today's date on the Cambodia calendar (UTC+7, all year), as yyyy-mm-dd. Sessions are dated on that clock. */
export function cambodiaToday(now: Date = new Date()): string {
  const local = new Date(now.getTime() + CAMBODIA_OFFSET_HOURS * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/** "Sat, 20 Mar 2027" from "2027-03-20". The date has no time zone, so it is never shifted. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "09:00 – 11:00". */
export function formatTimeRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

/** "Alumnus: Chenda Sok", "Partner (High school): Hope School", or the officer's name with their type. */
export function describeHost(host: SessionHost): string {
  const type = t.sessions.labels.hostType[host.type];
  const kind = host.partnerKind ? ` (${t.sessions.labels.partnerKind[host.partnerKind]})` : "";
  return `${type}${kind}: ${host.name}`;
}

/** Whether the session's date has arrived, so its attendance can be entered. The backend decides; this only shapes the form. */
export function hasTakenPlace(session: Pick<InformationSession, "date">, today: string = cambodiaToday()): boolean {
  return session.date <= today;
}

/** Details (and cancelling) are for a planned session, in a campaign that is not closed, for someone who may manage. */
export function canChangeDetails(session: Pick<InformationSession, "status">, campaignEditable: boolean, canManage: boolean): boolean {
  return canManage && campaignEditable && session.status === "Planned";
}

/** The numbers can be entered on any session that is not cancelled, whatever the campaign's status. */
export function canEnterNumbers(session: Pick<InformationSession, "status">): boolean {
  return session.status !== "Cancelled";
}
