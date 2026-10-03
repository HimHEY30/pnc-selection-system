import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/test-utils/session-fixtures";
import { canChangeDetails, canEnterNumbers, cambodiaToday, describeHost, formatDate, formatTimeRange, hasTakenPlace } from "./format";

describe("cambodiaToday", () => {
  it("is the date on the UTC+7 clock", () => {
    // 16:59 UTC on the 10th is 23:59 in Cambodia; one minute later it is the 11th.
    expect(cambodiaToday(new Date("2027-03-10T16:59:00Z"))).toBe("2027-03-10");
    expect(cambodiaToday(new Date("2027-03-10T17:00:00Z"))).toBe("2027-03-11");
  });

  it("rolls over month and year ends", () => {
    expect(cambodiaToday(new Date("2027-12-31T17:00:00Z"))).toBe("2028-01-01");
  });
});

describe("formatDate", () => {
  it("writes the weekday, day, month and year, without shifting the date by a time zone", () => {
    expect(formatDate("2027-03-20")).toBe("Sat, 20 Mar 2027");
    expect(formatDate("2027-01-01")).toBe("Fri, 1 Jan 2027");
  });

  it("returns what it cannot read as it is", () => {
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("formatTimeRange", () => {
  it("joins the two times", () => {
    expect(formatTimeRange("09:00", "11:30")).toBe("09:00 – 11:30");
  });
});

describe("describeHost", () => {
  it("names the type and the host", () => {
    expect(describeHost(sessionFixture().host)).toBe("Officer: Sokha Officer");
    expect(describeHost({ ...sessionFixture().host, type: "Alumni", name: "Chenda Sok", userId: null })).toBe("Alumnus: Chenda Sok");
  });

  it("adds a partner's kind", () => {
    expect(describeHost({ ...sessionFixture().host, type: "Partner", name: "Hope School", partnerKind: "HighSchool" })).toBe(
      "Partner (High school): Hope School",
    );
  });
});

describe("hasTakenPlace", () => {
  it("is true on the day and after, false before", () => {
    expect(hasTakenPlace({ date: "2027-03-10" }, "2027-03-10")).toBe(true);
    expect(hasTakenPlace({ date: "2027-03-01" }, "2027-03-10")).toBe(true);
    expect(hasTakenPlace({ date: "2027-03-11" }, "2027-03-10")).toBe(false);
  });
});

describe("what can be changed", () => {
  it("lets a manager change a planned session of a campaign that is not closed", () => {
    expect(canChangeDetails({ status: "Planned" }, true, true)).toBe(true);
  });

  it.each([
    ["an officer", { status: "Planned" as const }, true, false],
    ["a closed campaign", { status: "Planned" as const }, false, true],
    ["a done session", { status: "Done" as const }, true, true],
    ["a cancelled session", { status: "Cancelled" as const }, true, true],
  ])("does not for %s", (_name, session, editable, manage) => {
    expect(canChangeDetails(session, editable, manage)).toBe(false);
  });

  it("lets the numbers be entered on every session that is not cancelled", () => {
    expect(canEnterNumbers({ status: "Planned" })).toBe(true);
    expect(canEnterNumbers({ status: "Done" })).toBe(true);
    expect(canEnterNumbers({ status: "Cancelled" })).toBe(false);
  });
});
