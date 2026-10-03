import { describe, expect, it } from "vitest";
import {
  parseCount,
  toInfoInput,
  validateCreate,
  validateDates,
  validateInfo,
  type InfoFormValues,
} from "./validation";

const valid: InfoFormValues = {
  name: "Selection 2027",
  academicYear: "2027–2028",
  description: "",
  startDate: "2026-11-02",
  endDate: "2027-03-31",
  expectedCandidates: "1500",
  seatsAvailable: "150",
  provinceIds: [2, 17],
};

const minimal: InfoFormValues = {
  name: "Selection 2027",
  academicYear: "2027–2028",
  description: "",
  startDate: "",
  endDate: "",
  expectedCandidates: "",
  seatsAvailable: "",
  provinceIds: [],
};

describe("validateInfo, Save draft", () => {
  it("needs only a name and an academic year", () => {
    expect(validateInfo(minimal, "draft")).toEqual({});
  });

  it("still requires the name and the year", () => {
    const errors = validateInfo({ ...minimal, name: "  ", academicYear: "" }, "draft");

    expect(errors.name).toBe("Enter a campaign name.");
    expect(errors.academicYear).toBe("Choose an academic year.");
  });

  it("rejects an end date that is not after the start date, naming the start date", () => {
    const errors = validateInfo({ ...minimal, startDate: "2026-11-02", endDate: "2026-10-30" }, "draft");

    expect(errors.endDate).toBe("End date must be after the start date (2 Nov 2026).");
  });

  it("rejects an end date equal to the start date", () => {
    const errors = validateInfo({ ...minimal, startDate: "2026-11-02", endDate: "2026-11-02" }, "draft");

    expect(errors.endDate).toBeDefined();
  });

  it("allows a lone start date or a lone end date", () => {
    expect(validateInfo({ ...minimal, startDate: "2026-11-02" }, "draft")).toEqual({});
    expect(validateInfo({ ...minimal, endDate: "2026-11-02" }, "draft")).toEqual({});
  });

  it.each(["0", "-5", "1.5", "abc", "1e3", " "])("treats %j as an invalid expected-candidates count only if it has text", (text) => {
    const errors = validateInfo({ ...minimal, expectedCandidates: text }, "draft");

    if (text.trim() === "") expect(errors.expectedCandidates).toBeUndefined();
    else expect(errors.expectedCandidates).toBe("Expected candidates must be a whole number greater than 0.");
  });

  it("rejects seats that are not positive whole numbers", () => {
    expect(validateInfo({ ...minimal, seatsAvailable: "0" }, "draft").seatsAvailable).toBe(
      "Seats available must be a whole number greater than 0.",
    );
  });

  it("rejects more seats than expected candidates and formats the limit", () => {
    const errors = validateInfo({ ...minimal, expectedCandidates: "1500", seatsAvailable: "1501" }, "draft");

    expect(errors.seatsAvailable).toBe("Seats available cannot be more than expected candidates (1,500).");
  });

  it("allows seats equal to expected candidates", () => {
    expect(validateInfo({ ...minimal, expectedCandidates: "150", seatsAvailable: "150" }, "draft")).toEqual({});
  });

  it("does not need any province", () => {
    expect(validateInfo({ ...minimal, provinceIds: [] }, "draft").provinceIds).toBeUndefined();
  });

  it("limits the name to 100 characters and the description to 500", () => {
    expect(validateInfo({ ...minimal, name: "a".repeat(101) }, "draft").name).toBe(
      "Campaign name must be 100 characters or fewer.",
    );
    expect(validateInfo({ ...minimal, name: "a".repeat(100) }, "draft").name).toBeUndefined();
    expect(validateInfo({ ...minimal, description: "a".repeat(501) }, "draft").description).toBe(
      "Description must be 500 characters or fewer.",
    );
  });
});

describe("validateInfo, Save and continue", () => {
  it("passes when everything is valid", () => {
    expect(validateInfo(valid, "complete")).toEqual({});
  });

  it("requires every field", () => {
    const errors = validateInfo(minimal, "complete");

    expect(errors).toEqual({
      startDate: "Enter a start date.",
      endDate: "Enter an end date.",
      expectedCandidates: "Enter the expected number of candidates.",
      seatsAvailable: "Enter the number of seats available.",
      provinceIds: "Choose at least one target province.",
    });
  });

  it("requires at least one province", () => {
    expect(validateInfo({ ...valid, provinceIds: [] }, "complete").provinceIds).toBe(
      "Choose at least one target province.",
    );
  });
});

describe("validateDates", () => {
  it("is silent while a date is missing and nothing is required yet", () => {
    expect(validateDates("", "", false)).toEqual({});
    expect(validateDates("2026-11-02", "", false)).toEqual({});
  });

  it("reports the end date as soon as it is not after the start date", () => {
    expect(validateDates("2026-11-02", "2026-10-30", false).endDate).toBe(
      "End date must be after the start date (2 Nov 2026).",
    );
  });

  it("asks for both dates when required", () => {
    expect(validateDates("", "", true)).toEqual({
      startDate: "Enter a start date.",
      endDate: "Enter an end date.",
    });
  });

  it("treats a half-typed date as missing rather than as a wrong order", () => {
    expect(validateDates("2026-11-02", "2026-1", false).endDate).toBe("Enter an end date.");
  });
});

describe("validateCreate", () => {
  it("requires a name and an academic year", () => {
    expect(validateCreate({ name: "", academicYear: "", description: "" })).toEqual({
      name: "Enter a campaign name.",
      academicYear: "Choose an academic year.",
    });
  });

  it("passes with a name and a year, description optional", () => {
    expect(validateCreate({ name: "Selection 2027", academicYear: "2027–2028", description: "" })).toEqual({});
  });
});

describe("parseCount", () => {
  it.each([
    ["1500", 1500],
    [" 150 ", 150],
    ["0", 0],
  ])("reads %j as %i", (text, expected) => expect(parseCount(text)).toBe(expected));

  it.each(["", "1.5", "-1", "1,500", "abc", "1234567890"])("rejects %j", (text) => {
    expect(parseCount(text)).toBeNull();
  });
});

describe("toInfoInput", () => {
  it("turns the typed values into the request body", () => {
    expect(toInfoInput({ ...valid, name: "  Selection 2027 ", description: "  hi  " }, 7)).toEqual({
      name: "Selection 2027",
      academicYear: "2027–2028",
      description: "hi",
      startDate: "2026-11-02",
      endDate: "2027-03-31",
      expectedCandidates: 1500,
      seatsAvailable: 150,
      provinceIds: [2, 17],
      version: 7,
    });
  });

  it("sends null for anything left empty", () => {
    expect(toInfoInput(minimal, null)).toMatchObject({
      description: null,
      startDate: null,
      endDate: null,
      expectedCandidates: null,
      seatsAvailable: null,
      provinceIds: [],
      version: null,
    });
  });
});
