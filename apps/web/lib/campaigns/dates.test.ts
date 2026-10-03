import { describe, expect, it } from "vitest";
import { academicYearOptions, defaultAcademicYear } from "./academic-years";
import { formatDate, formatSavedTime, isEndAfterStart, isIsoDate } from "./dates";

describe("formatDate", () => {
  it("writes day, short month and year", () => {
    expect(formatDate("2026-11-02")).toBe("2 Nov 2026");
    expect(formatDate("2027-03-31")).toBe("31 Mar 2027");
    expect(formatDate("2026-01-09")).toBe("9 Jan 2026");
  });

  it("returns anything that is not a date unchanged", () => {
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("isIsoDate", () => {
  it.each(["2026-11-02", "2028-02-29"])("accepts %s", (value) => expect(isIsoDate(value)).toBe(true));
  it.each(["", "2026-1", "2026-13-01", "2027-02-29", "2026-11-31", "11/02/2026"])("rejects %j", (value) =>
    expect(isIsoDate(value)).toBe(false),
  );
});

describe("isEndAfterStart", () => {
  it("is strict: the same day is not after", () => {
    expect(isEndAfterStart("2026-11-02", "2026-11-03")).toBe(true);
    expect(isEndAfterStart("2026-11-02", "2026-11-02")).toBe(false);
    expect(isEndAfterStart("2026-11-02", "2026-10-30")).toBe(false);
  });
});

describe("formatSavedTime", () => {
  it("shows Cambodia time whatever the machine's zone is", () => {
    expect(formatSavedTime("2026-10-03T02:12:00Z")).toBe("9:12 AM");
    expect(formatSavedTime("2026-10-03T08:05:00Z")).toBe("3:05 PM");
  });

  it("returns nothing for an unreadable timestamp", () => {
    expect(formatSavedTime("nope")).toBe("");
  });
});

describe("academic years", () => {
  const october2026 = new Date(2026, 9, 3);

  it("offers last year through four years ahead", () => {
    expect(academicYearOptions(october2026)).toEqual([
      "2025–2026",
      "2026–2027",
      "2027–2028",
      "2028–2029",
      "2029–2030",
      "2030–2031",
    ]);
  });

  it("preselects next year's intake, as in the design", () => {
    expect(defaultAcademicYear(october2026)).toBe("2027–2028");
  });

  it("keeps a stored value that is outside the usual range", () => {
    const options = academicYearOptions(october2026, "2019–2020");

    expect(options).toContain("2019–2020");
    expect(options).toContain("2027–2028");
  });
});
