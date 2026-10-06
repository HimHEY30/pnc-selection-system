import { describe, expect, it } from "vitest";
import { needsAttention } from "./attention";
import type { InformationSession } from "./types";

const TODAY = "2027-03-20";

function session(overrides: Partial<InformationSession>): InformationSession {
  return {
    id: "s",
    campaignId: "c",
    title: "Session",
    date: "2027-04-01",
    startTime: "09:00",
    endTime: "11:00",
    format: "InPerson",
    venue: null,
    meetingLink: null,
    province: null,
    notes: null,
    assignee: null,
    host: null,
    status: "Planned",
    cancelReason: null,
    expectedCandidates: 40,
    attendance: null,
    createdByName: "Admin",
    updatedAt: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("needsAttention", () => {
  it("is empty when every session is in order", () => {
    expect(needsAttention([session({}), session({ status: "Cancelled", expectedCandidates: null })], TODAY)).toEqual([]);
  });

  it("counts copies that still need scheduling, ordered by title", () => {
    const items = needsAttention(
      [session({ status: "Unscheduled", date: null, startTime: null, endTime: null, title: "B" }), session({ status: "Unscheduled", date: null, title: "A" })],
      TODAY,
    );
    expect(items).toEqual([{ kind: "unscheduled", count: 2, examples: ["A", "B"] }]);
  });

  it("flags planned sessions whose day has come with no attendance, oldest first, but not done ones", () => {
    const items = needsAttention(
      [
        session({ title: "Today", date: TODAY }),
        session({ title: "Earlier", date: "2027-03-01" }),
        session({ title: "Recorded", date: "2027-03-02", status: "Done", attendance: { female: 1, male: 1, total: 2, recordedAt: "x", recordedByName: "y" } }),
      ],
      TODAY,
    );
    expect(items).toEqual([{ kind: "missing-attendance", count: 2, examples: ["Earlier", "Today"] }]);
  });

  it("flags upcoming planned sessions with no expected number, but not past ones or cancelled ones", () => {
    const items = needsAttention(
      [
        session({ title: "Ahead", expectedCandidates: null }),
        session({ title: "Past", date: "2027-03-01", expectedCandidates: null, attendance: { female: 1, male: 0, total: 1, recordedAt: "x", recordedByName: "y" } }),
        session({ title: "Off", status: "Cancelled", expectedCandidates: null }),
        session({ title: "Zero", expectedCandidates: 0 }),
      ],
      TODAY,
    );
    expect(items).toEqual([{ kind: "missing-expected", count: 1, examples: ["Ahead"] }]);
  });

  it("lists the most urgent first and shows at most three examples", () => {
    const items = needsAttention(
      [
        session({ title: "Up", expectedCandidates: null }),
        ...["a", "b", "c", "d"].map((title, i) => session({ title, date: `2027-03-0${i + 1}` })),
        session({ title: "Copy", status: "Unscheduled", date: null }),
      ],
      TODAY,
    );
    expect(items.map((i) => i.kind)).toEqual(["missing-attendance", "unscheduled", "missing-expected"]);
    expect(items[0]).toEqual({ kind: "missing-attendance", count: 4, examples: ["a", "b", "c"] });
  });
});
