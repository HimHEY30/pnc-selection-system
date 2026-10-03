import { t } from "@/lib/messages";
import { COUNT_MAX, type HostRequest, type InformationSession, type PartnerKind, type SessionRequest } from "./types";

// The session form: its working copy (all strings, as typed), how it becomes the request the backend
// takes, and the checks that save a round trip. The backend checks everything again and is the authority.

export const TITLE_MAX = 120;
export const NOTES_MAX = 1000;
export const CANCEL_REASON_MAX = 300;

export type SessionForm = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  format: string;
  venue: string;
  meetingLink: string;
  /** The province's id as text, or "" for none. */
  provinceId: string;
  notes: string;
  assigneeId: string;
  hostType: string;
  hostId: string;
  hostUserId: string;
};

export type SessionField = keyof SessionForm;

/** A new session: in person, responsible and run by the person adding it. */
export function emptySessionForm(meId: string): SessionForm {
  return {
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "11:00",
    format: "InPerson",
    venue: "",
    meetingLink: "",
    provinceId: "",
    notes: "",
    assigneeId: meId,
    hostType: "Officer",
    hostId: "",
    hostUserId: meId,
  };
}

export function formFromSession(session: InformationSession): SessionForm {
  return {
    title: session.title,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    format: session.format,
    venue: session.venue ?? "",
    meetingLink: session.meetingLink ?? "",
    provinceId: session.province ? String(session.province.id) : "",
    notes: session.notes ?? "",
    assigneeId: session.assignee.id,
    hostType: session.host.type,
    hostId: session.host.hostId ?? "",
    hostUserId: session.host.userId ?? "",
  };
}

const blankToNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

/** What the backend takes. Fields that do not apply to the chosen format or host type are sent as null. */
export function toSessionRequest(form: SessionForm): SessionRequest {
  const needsVenue = form.format === "InPerson" || form.format === "Hybrid";
  const needsLink = form.format === "Online" || form.format === "Hybrid";
  const officer = form.hostType === "Officer";

  return {
    title: form.title.trim(),
    date: blankToNull(form.date),
    startTime: form.startTime.trim(),
    endTime: form.endTime.trim(),
    format: form.format,
    venue: needsVenue ? blankToNull(form.venue) : null,
    meetingLink: needsLink ? blankToNull(form.meetingLink) : null,
    provinceId: form.provinceId === "" ? null : Number(form.provinceId),
    notes: form.notes.trim() === "" ? null : form.notes.trim(),
    assigneeId: form.assigneeId,
    hostType: form.hostType,
    hostId: officer ? null : blankToNull(form.hostId),
    hostUserId: officer ? blankToNull(form.hostUserId) : null,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isWebAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/** The problems the form can find by itself, keyed by field. Empty means it is worth sending. */
export function validateSessionForm(form: SessionForm): Partial<Record<SessionField, string>> {
  const m = t.sessions.validation;
  const errors: Partial<Record<SessionField, string>> = {};

  const title = form.title.trim();
  if (!title) errors.title = m.title;
  else if (title.length > TITLE_MAX) errors.title = m.titleTooLong(TITLE_MAX);

  if (!form.date) errors.date = m.date;

  if (!TIME.test(form.startTime.trim())) errors.startTime = m.startTime;
  if (!TIME.test(form.endTime.trim())) errors.endTime = m.endTime;
  else if (!errors.startTime && form.endTime.trim() <= form.startTime.trim()) errors.endTime = m.endBeforeStart;

  if ((form.format === "InPerson" || form.format === "Hybrid") && !form.venue.trim()) errors.venue = m.venue;
  if (form.format === "Online" || form.format === "Hybrid") {
    const link = form.meetingLink.trim();
    if (!link) errors.meetingLink = m.meetingLink;
    else if (!isWebAddress(link)) errors.meetingLink = m.meetingLinkInvalid;
  }

  if (form.notes.trim().length > NOTES_MAX) errors.notes = m.notesTooLong(NOTES_MAX);
  if (!form.assigneeId) errors.assigneeId = m.assignee;

  if (form.hostType === "Officer" && !form.hostUserId) errors.hostUserId = m.hostOfficer;
  if (form.hostType === "Alumni" && !form.hostId) errors.hostId = m.hostAlumni;
  if (form.hostType === "Partner" && !form.hostId) errors.hostId = m.hostPartner;

  return errors;
}

/** The order the fields appear on screen, so focus can go to the first one with a problem. */
export const SESSION_FIELD_ORDER: readonly SessionField[] = [
  "title",
  "date",
  "startTime",
  "endTime",
  "format",
  "venue",
  "meetingLink",
  "provinceId",
  "notes",
  "assigneeId",
  "hostType",
  "hostUserId",
  "hostId",
];

// ---------- Numbers ----------

/**
 * Reads a number box: "" is no number (null), digits are a whole number from 0 to the maximum, anything else
 * (letters, a minus sign, a decimal, too big) is undefined, which the form reports as a mistake.
 */
export function parseCount(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= COUNT_MAX ? value : undefined;
}

// ---------- Hosts ----------

export type HostForm = {
  name: string;
  partnerKind: string;
  contactPerson: string;
  phone: string;
  email: string;
};

export type HostField = keyof HostForm;

export const emptyHostForm: HostForm = { name: "", partnerKind: "", contactPerson: "", phone: "", email: "" };

export function toHostRequest(type: "Alumni" | "Partner", form: HostForm): HostRequest {
  const partner = type === "Partner";
  return {
    type,
    name: form.name.trim(),
    partnerKind: partner ? blankToNull(form.partnerKind) : null,
    contactPerson: partner ? blankToNull(form.contactPerson) : null,
    phone: blankToNull(form.phone),
    email: blankToNull(form.email),
  };
}

export function validateHostForm(type: "Alumni" | "Partner", form: HostForm): Partial<Record<HostField, string>> {
  const m = t.sessions.host;
  const errors: Partial<Record<HostField, string>> = {};
  if (!form.name.trim()) errors.name = m.nameRequired;
  if (type === "Partner" && !form.partnerKind) errors.partnerKind = m.partnerKindRequired;
  if (!form.phone.trim() && !form.email.trim()) errors.phone = m.contactRequired;
  return errors;
}

export function isPartnerKind(value: string): value is PartnerKind {
  return value === "Ngo" || value === "HighSchool" || value === "University" || value === "Other";
}
