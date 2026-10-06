import { describe, expect, it } from "vitest";
import { buildSessionsContext, type SessionsContext } from "./sessionsAssistant";
import { demoSessionsAssistant } from "./demoSessionsAssistant";
import type { InformationSession, SessionSummary } from "@/lib/sessions/types";

const TODAY = "2027-03-20";

const SUMMARY: SessionSummary = { total: 3, planned: 2, done: 0, cancelled: 0, expectedCandidates: 30, actualFemale: 0, actualMale: 0, actualTotal: 0, unscheduled: 1 };

const session = (overrides: Partial<InformationSession>): InformationSession => ({
  id: "secret-session-id",
  campaignId: "secret-campaign-id",
  title: "Secret School Open Day",
  date: "2027-03-01",
  startTime: "09:00",
  endTime: "11:00",
  format: "InPerson",
  venue: "Secret Venue Hall",
  meetingLink: "https://secret.example/meet",
  province: { id: 1, name: "Secret Province" },
  notes: "Secret note",
  assignee: { id: "u1", name: "Secret Assignee" },
  host: { type: "Partner", name: "Secret Host", userId: null, hostId: "h1", partnerKind: "Ngo", phone: "012 345 678", email: "secret@example.org", isActive: true },
  status: "Planned",
  cancelReason: null,
  expectedCandidates: 20,
  attendance: null,
  createdByName: "Secret Creator",
  updatedAt: "2027-01-01T00:00:00Z",
  ...overrides,
});

const context = (overrides: Partial<SessionsContext> = {}): SessionsContext => ({
  campaignStatus: "Active",
  isEditable: true,
  canManage: true,
  summary: SUMMARY,
  attention: [],
  ...overrides,
});

describe("buildSessionsContext", () => {
  it("shares counts only: no title, venue, link, note, person, contact or id", () => {
    const built = buildSessionsContext({
      campaignStatus: "Active",
      isEditable: true,
      canManage: true,
      summary: SUMMARY,
      sessions: [session({}), session({ id: "b", status: "Unscheduled", date: null, expectedCandidates: null })],
      today: TODAY,
    });

    const sent = JSON.stringify(built);
    for (const secret of ["Secret", "secret", "012 345", "https://"]) expect(sent).not.toContain(secret);
    expect(built.attention).toEqual([
      { kind: "missing-attendance", count: 1 },
      { kind: "unscheduled", count: 1 },
    ]);
  });
});

describe("demoSessionsAssistant", () => {
  const ask = (intent: Parameters<typeof demoSessionsAssistant.ask>[0]["intent"], c = context()) => demoSessionsAssistant.ask({ intent, context: c });

  it("is labelled as a demo", () => {
    expect(demoSessionsAssistant.mode).toBe("demo");
  });

  it("summarizes from the totals", async () => {
    const { text } = await ask("summarize");
    expect(text).toContain("3 sessions");
    expect(text).toContain("30 candidates are expected");
    expect(text).toContain("No attendance has been entered yet.");
  });

  it("lists what needs attention, or says all is well", async () => {
    expect((await ask("needs-attention", context({ attention: [{ kind: "unscheduled", count: 2 }] }))).text).toBe("• 2 sessions still need a date, host and person responsible");
    expect((await ask("needs-attention")).text).toBe("Everything is in order. Nothing needs doing right now.");
  });

  it("points to the most urgent step, and does not tell an officer to schedule", async () => {
    const attention = [{ kind: "unscheduled" as const, count: 1 }];
    expect((await ask("next-step", context({ attention }))).text).toContain("choose Schedule");
    expect((await ask("next-step", context({ attention, canManage: false }))).text).toContain("A selection manager or system admin can schedule them");
  });

  it("suggests adding the first session only to someone who can", async () => {
    const empty = { ...SUMMARY, total: 0, planned: 0, unscheduled: 0 };
    expect((await ask("next-step", context({ summary: empty }))).text).toContain("Add the first session");
    expect((await ask("next-step", context({ summary: empty, canManage: false }))).text).toContain("Nothing to do yet");
  });

  it("says plainly that free-form questions need the real service", async () => {
    expect((await demoSessionsAssistant.ask({ intent: "ask", question: "Who is best?", context: context() })).text).toContain("not connected yet");
  });

  it("stops waiting when the request is cancelled", async () => {
    const controller = new AbortController();
    const pending = demoSessionsAssistant.ask({ intent: "summarize", context: context() }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
