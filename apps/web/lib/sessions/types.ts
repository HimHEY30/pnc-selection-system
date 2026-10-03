// Shapes of the backend's information session API (see Sessions.Application/Contracts.cs and
// Identity.Api/StaffController.cs). Safe to import from client components: no server-only code.

export type SessionStatus = "Planned" | "Done" | "Cancelled";
export type SessionFormat = "InPerson" | "Online" | "Hybrid";
export type HostType = "Officer" | "Alumni" | "Partner";
/** What a host in the directory can be: officers are staff, not directory records. */
export type DirectoryHostType = "Alumni" | "Partner";
export type PartnerKind = "Ngo" | "HighSchool" | "University" | "Other";

export const SESSION_FORMATS: readonly SessionFormat[] = ["InPerson", "Online", "Hybrid"];
export const HOST_TYPES: readonly HostType[] = ["Officer", "Alumni", "Partner"];
export const PARTNER_KINDS: readonly PartnerKind[] = ["Ngo", "HighSchool", "University", "Other"];

/** The biggest expected or actual number in one box (the backend refuses more). */
export const COUNT_MAX = 5000;

export type Person = { id: string; name: string };
export type ProvinceRef = { id: number; name: string };

/** Who runs a session: an officer (a user) or an alumnus or a partner from the directory. */
export type SessionHost = {
  type: HostType;
  name: string;
  userId: string | null;
  hostId: string | null;
  partnerKind: PartnerKind | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

export type Attendance = {
  female: number;
  male: number;
  total: number;
  recordedAt: string;
  recordedByName: string;
};

export type InformationSession = {
  id: string;
  campaignId: string;
  title: string;
  /** ISO date, yyyy-mm-dd, on the Cambodia calendar. */
  date: string;
  /** "HH:mm". */
  startTime: string;
  endTime: string;
  format: SessionFormat;
  venue: string | null;
  meetingLink: string | null;
  province: ProvinceRef | null;
  notes: string | null;
  assignee: Person;
  host: SessionHost;
  status: SessionStatus;
  cancelReason: string | null;
  expectedCandidates: number | null;
  attendance: Attendance | null;
  createdByName: string;
  updatedAt: string;
};

export type SessionSummary = {
  total: number;
  planned: number;
  done: number;
  cancelled: number;
  expectedCandidates: number;
  actualFemale: number;
  actualMale: number;
  actualTotal: number;
};

/** A campaign's sessions and what the page needs to show and change them. */
export type SessionList = {
  campaignId: string;
  campaignName: string;
  campaignStatus: "Draft" | "Active" | "Closed";
  /** False once the campaign is closed: details cannot change, but the numbers still can. */
  isEditable: boolean;
  targetProvinces: ProvinceRef[];
  sessions: InformationSession[];
  summary: SessionSummary;
};

export type MySession = { campaignName: string; campaignStatus: "Draft" | "Active" | "Closed"; session: InformationSession };

/** An alumnus or a partner in the host directory. */
export type Host = {
  id: string;
  type: DirectoryHostType;
  name: string;
  partnerKind: PartnerKind | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

export type StaffMember = { id: string; name: string; role: "system-admin" | "selection-manager" | "selection-officer" };

/** Who a session can be assigned to or hosted by. `me` is always there, even when the staff list could not be loaded. */
export type AssignableStaff = { me: Person; staff: StaffMember[]; directoryAvailable: boolean };

// ---------- Request bodies ----------

export type SessionRequest = {
  title: string;
  date: string | null;
  startTime: string;
  endTime: string;
  format: string;
  venue: string | null;
  meetingLink: string | null;
  provinceId: number | null;
  notes: string | null;
  assigneeId: string;
  hostType: string;
  hostId: string | null;
  hostUserId: string | null;
};

export type HostRequest = {
  type: string;
  name: string;
  partnerKind: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
};
