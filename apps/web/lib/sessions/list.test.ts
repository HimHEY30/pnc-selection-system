import { describe, expect, it } from "vitest";
import { cancelledSession, doneSession, sessionFixture, unscheduledSession } from "@/test-utils/session-fixtures";
import { matchesSearch, pageOf, sortByStart, upcomingSessions } from "./list";

const on = (date: string, startTime = "09:00", extra = {}) => sessionFixture({ id: `${date}-${startTime}`, date, startTime, ...extra });

describe("upcomingSessions", () => {
  const today = "2027-03-10";

  it("keeps planned sessions from today on, soonest first, at most three", () => {
    const sessions = [on("2027-04-01"), on("2027-03-12"), on("2027-03-10", "14:00"), on("2027-03-10", "08:00"), on("2027-05-01")];

    expect(upcomingSessions(sessions, today).map((s) => s.id)).toEqual(["2027-03-10-08:00", "2027-03-10-14:00", "2027-03-12-09:00"]);
  });

  it("leaves out sessions that are done, cancelled or earlier", () => {
    const sessions = [doneSession(), cancelledSession({ date: "2027-03-15" }), on("2027-03-09"), on("2027-03-20")];

    expect(upcomingSessions(sessions, today).map((s) => s.date)).toEqual(["2027-03-20"]);
  });

  it("does not reorder what it was given", () => {
    const sessions = [on("2027-04-01"), on("2027-03-12")];
    upcomingSessions(sessions, today);

    expect(sessions.map((s) => s.date)).toEqual(["2027-04-01", "2027-03-12"]);
  });
});

describe("sortByStart", () => {
  const sessions = [on("2027-03-12"), on("2027-03-10", "14:00"), on("2027-03-10", "08:00")];

  it("orders by date, then start time, either way", () => {
    expect(sortByStart(sessions, "asc").map((s) => s.id)).toEqual(["2027-03-10-08:00", "2027-03-10-14:00", "2027-03-12-09:00"]);
    expect(sortByStart(sessions, "desc").map((s) => s.id)).toEqual(["2027-03-12-09:00", "2027-03-10-14:00", "2027-03-10-08:00"]);
  });
});

describe("sessions with no date yet", () => {
  const copy = (title: string) => unscheduledSession({ id: title, title });

  it("are never coming up, and do not stop the dated ones being listed", () => {
    const sessions = [copy("Copy"), on("2027-03-12")];

    expect(upcomingSessions(sessions, "2027-03-10").map((s) => s.id)).toEqual(["2027-03-12-09:00"]);
  });

  it("come after the dated ones whichever way the list is ordered, by title", () => {
    const sessions = [copy("Zebra visit"), on("2027-03-12"), copy("Alpha visit"), on("2027-03-10", "08:00")];

    expect(sortByStart(sessions, "asc").map((s) => s.id)).toEqual(["2027-03-10-08:00", "2027-03-12-09:00", "Alpha visit", "Zebra visit"]);
    expect(sortByStart(sessions, "desc").map((s) => s.id)).toEqual(["2027-03-12-09:00", "2027-03-10-08:00", "Alpha visit", "Zebra visit"]);
  });

  it("can still be found by their title, and have no host or person to match", () => {
    const session = copy("Visit to Hope School");

    expect(matchesSearch(session, "hope")).toBe(true);
    expect(matchesSearch(session, "sokha")).toBe(false);
  });
});

describe("matchesSearch", () => {
  const session = sessionFixture({ title: "Open day at Hope School", venue: "School hall" });

  it("matches the title, venue, host and person responsible, ignoring case", () => {
    expect(matchesSearch(session, "hope")).toBe(true);
    expect(matchesSearch(session, "HALL")).toBe(true);
    expect(matchesSearch(session, "sokha")).toBe(true);
  });

  it("matches everything when nothing is typed, and nothing that is absent", () => {
    expect(matchesSearch(session, "  ")).toBe(true);
    expect(matchesSearch(session, "temple")).toBe(false);
  });
});

describe("pageOf", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("cuts a page and says which rows it holds", () => {
    expect(pageOf(items, 2, 10)).toEqual({ items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], page: 2, pageCount: 3, from: 11, to: 20 });
    expect(pageOf(items, 3, 10)).toMatchObject({ items: [21, 22, 23, 24, 25], from: 21, to: 25 });
  });

  it("brings a page past the end back to the last, and below the start to the first", () => {
    expect(pageOf(items, 9, 10).page).toBe(3);
    expect(pageOf(items, 0, 10).page).toBe(1);
  });

  it("is one empty page for an empty list", () => {
    expect(pageOf([], 1, 10)).toEqual({ items: [], page: 1, pageCount: 1, from: 0, to: 0 });
  });
});
