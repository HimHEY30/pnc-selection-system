import type { AssignableStaff, Host, InformationSession, MySession, SessionList, SessionSummary } from "@/lib/sessions/types";

export const CAMPAIGN_ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

/** A planned, in-person session on a future date, assigned to and run by the same officer. */
export function sessionFixture(overrides: Partial<InformationSession> = {}): InformationSession {
  return {
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    campaignId: CAMPAIGN_ID,
    title: "Open day at Kampong Cham High School",
    date: "2099-03-20",
    startTime: "09:00",
    endTime: "11:00",
    format: "InPerson",
    venue: "School hall",
    meetingLink: null,
    province: null,
    notes: null,
    assignee: { id: "officer-1", name: "Sokha Officer" },
    host: { type: "Officer", name: "Sokha Officer", userId: "officer-1", hostId: null, partnerKind: null, phone: null, email: null, isActive: true },
    status: "Planned",
    cancelReason: null,
    expectedCandidates: null,
    attendance: null,
    createdByName: "Dara Manager",
    updatedAt: "2027-03-01T02:00:00Z",
    ...overrides,
  };
}

/** A session that took place long ago, with its attendance recorded. */
export function doneSession(overrides: Partial<InformationSession> = {}): InformationSession {
  return sessionFixture({
    id: "1b2c3d4e-5f6a-4b7c-8d8e-0f1a2b3c4d5e",
    title: "Visit to Hope School",
    date: "2000-03-01",
    status: "Done",
    expectedCandidates: 40,
    attendance: { female: 18, male: 12, total: 30, recordedAt: "2000-03-01T10:00:00Z", recordedByName: "Sokha Officer" },
    ...overrides,
  });
}

export function cancelledSession(overrides: Partial<InformationSession> = {}): InformationSession {
  return sessionFixture({
    id: "2c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f",
    title: "Session at the community centre",
    status: "Cancelled",
    cancelReason: "Heavy rain",
    ...overrides,
  });
}

export function summaryOf(sessions: InformationSession[]): SessionSummary {
  const counted = sessions.filter((s) => s.status !== "Cancelled");
  const female = counted.reduce((n, s) => n + (s.attendance?.female ?? 0), 0);
  const male = counted.reduce((n, s) => n + (s.attendance?.male ?? 0), 0);
  return {
    total: counted.length,
    planned: counted.filter((s) => s.status === "Planned").length,
    done: counted.filter((s) => s.status === "Done").length,
    cancelled: sessions.length - counted.length,
    expectedCandidates: counted.reduce((n, s) => n + (s.expectedCandidates ?? 0), 0),
    actualFemale: female,
    actualMale: male,
    actualTotal: female + male,
  };
}

export function listFixture(sessions: InformationSession[] = [], overrides: Partial<SessionList> = {}): SessionList {
  return {
    campaignId: CAMPAIGN_ID,
    campaignName: "Selection 2027",
    campaignStatus: "Draft",
    isEditable: true,
    targetProvinces: [
      { id: 2, name: "Battambang" },
      { id: 17, name: "Siem Reap" },
    ],
    sessions,
    summary: summaryOf(sessions),
    ...overrides,
  };
}

export function mySession(session: InformationSession, campaignName = "Selection 2027"): MySession {
  return { campaignName, campaignStatus: "Draft", session };
}

export const ALUMNUS: Host = {
  id: "11111111-2222-4333-8444-555555555555",
  type: "Alumni",
  name: "Chenda Sok",
  partnerKind: null,
  contactPerson: null,
  phone: "012 345 678",
  email: null,
  isActive: true,
};

export const PARTNER: Host = {
  id: "22222222-3333-4444-8555-666666666666",
  type: "Partner",
  name: "Hope School",
  partnerKind: "HighSchool",
  contactPerson: "Mr Rith",
  phone: null,
  email: "info@hope.example.org",
  isActive: true,
};

export const HOSTS: Host[] = [ALUMNUS, PARTNER];

export function assignableFixture(overrides: Partial<AssignableStaff> = {}): AssignableStaff {
  return {
    me: { id: "manager-1", name: "Dara Manager" },
    staff: [
      { id: "officer-1", name: "Sokha Officer", role: "selection-officer" },
      { id: "officer-2", name: "Vanna Officer", role: "selection-officer" },
      { id: "manager-1", name: "Dara Manager", role: "selection-manager" },
      { id: "admin-1", name: "Admin Demo", role: "system-admin" },
    ],
    directoryAvailable: true,
    ...overrides,
  };
}
