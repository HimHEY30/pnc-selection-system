import { describe, expect, it } from "vitest";
import {
  CANDIDATE_FIELD_ORDER,
  OTHER_SCHOOL,
  emptyCandidateForm,
  formFromCandidate,
  isDirty,
  placeServerErrors,
  toCandidateRequest,
  validateCandidateForm,
  type CandidateForm,
} from "./form";
import type { Candidate } from "./types";

const address = {
  province: { code: "12", name: "Phnom Penh" },
  district: { code: "1201", name: "Chamkar Mon" },
  commune: { code: "120101", name: "Tonle Basak" },
  village: null,
};

const filled = (overrides: Partial<CandidateForm> = {}): CandidateForm => ({
  nameKm: "សុខ ចិន្តា",
  nameEn: "Sok Chenda",
  gender: "Female",
  dateOfBirth: "2009-05-20",
  phone: "012 345 678",
  address,
  school: "host-1",
  schoolName: "",
  sessionId: "",
  ngo: "no",
  ngoName: "",
  ...overrides,
});

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: "c1",
  campaignId: "camp",
  nameKm: "សុខ ចិន្តា",
  nameEn: "Sok Chenda",
  gender: "Female",
  dateOfBirth: "2009-05-20",
  phone: "012345678",
  address,
  schoolHostId: null,
  schoolName: "Tiny Village School",
  session: null,
  hasNgoSupport: false,
  ngoName: null,
  createdByName: "Dara",
  createdAt: "2027-03-10T05:00:00Z",
  updatedAt: "2027-03-10T05:00:00Z",
  version: 4,
  ...overrides,
});

describe("toCandidateRequest", () => {
  it("sends only the school's id when one was picked", () => {
    const request = toCandidateRequest(filled({ school: "host-1", schoolName: "left over text" }), null);

    expect(request.schoolHostId).toBe("host-1");
    expect(request.schoolName).toBeNull();
  });

  it("sends only the typed name when Other was chosen", () => {
    const request = toCandidateRequest(filled({ school: OTHER_SCHOOL, schoolName: "  Tiny Village School " }), null);

    expect(request.schoolHostId).toBeNull();
    expect(request.schoolName).toBe("Tiny Village School");
  });

  it("sends the NGO's name only when there is support, so a left-over name is never sent", () => {
    expect(toCandidateRequest(filled({ ngo: "yes", ngoName: " Hope NGO " }), null)).toMatchObject({ hasNgoSupport: true, ngoName: "Hope NGO" });
    expect(toCandidateRequest(filled({ ngo: "no", ngoName: "Hope NGO" }), null)).toMatchObject({ hasNgoSupport: false, ngoName: null });
  });

  it("trims the text, turns empty choices into null and carries the version", () => {
    const request = toCandidateRequest(filled({ nameEn: "  Sok Chenda ", phone: " 012 345 678 ", sessionId: "", dateOfBirth: "", gender: "" }), 7);

    expect(request).toMatchObject({ nameEn: "Sok Chenda", phone: "012 345 678", sessionId: null, dateOfBirth: null, gender: null, version: 7 });
  });

  it("sends the chosen session and the address as it is", () => {
    const request = toCandidateRequest(filled({ sessionId: "s1" }), null);

    expect(request.sessionId).toBe("s1");
    expect(request.address).toBe(address);
  });
});

describe("formFromCandidate", () => {
  it("opens a typed school as Other with its name", () => {
    const form = formFromCandidate(candidate({ schoolHostId: null, schoolName: "Tiny Village School" }));

    expect(form).toMatchObject({ school: OTHER_SCHOOL, schoolName: "Tiny Village School" });
  });

  it("opens a picked school by its id, with no typed name", () => {
    expect(formFromCandidate(candidate({ schoolHostId: "host-9", schoolName: "Bak Touk" }))).toMatchObject({ school: "host-9", schoolName: "" });
  });

  it("carries the session, the NGO and the rest", () => {
    const form = formFromCandidate(
      candidate({ session: { id: "s1", title: "Open day", date: "2027-03-01", status: "Planned" }, hasNgoSupport: true, ngoName: "Hope NGO" }),
    );

    expect(form).toMatchObject({ sessionId: "s1", ngo: "yes", ngoName: "Hope NGO", gender: "Female", dateOfBirth: "2009-05-20" });
  });

  it("round-trips: the request made from the form of a candidate matches the candidate", () => {
    const original = candidate({ schoolHostId: "host-9", schoolName: "Bak Touk", hasNgoSupport: true, ngoName: "Hope NGO" });

    expect(toCandidateRequest(formFromCandidate(original), original.version)).toMatchObject({
      nameKm: original.nameKm,
      nameEn: original.nameEn,
      phone: original.phone,
      schoolHostId: "host-9",
      hasNgoSupport: true,
      ngoName: "Hope NGO",
      version: 4,
    });
  });
});

describe("validateCandidateForm", () => {
  it("passes a form with everything", () => {
    expect(validateCandidateForm(filled())).toEqual({});
  });

  it("says what is missing on an empty form, but not the optional parts", () => {
    const errors = validateCandidateForm(emptyCandidateForm());

    expect(Object.keys(errors).sort()).toEqual(
      ["nameKm", "nameEn", "gender", "dateOfBirth", "phone", "province", "district", "commune", "school"].sort(),
    );
  });

  it("needs a name for the school when Other is chosen, not when one is picked", () => {
    expect(validateCandidateForm(filled({ school: OTHER_SCHOOL, schoolName: " " })).schoolName).toBeDefined();
    expect(validateCandidateForm(filled({ school: "host-1", schoolName: "" })).schoolName).toBeUndefined();
  });

  it("needs the NGO's name only with support", () => {
    expect(validateCandidateForm(filled({ ngo: "yes", ngoName: " " })).ngoName).toBeDefined();
    expect(validateCandidateForm(filled({ ngo: "no", ngoName: "" })).ngoName).toBeUndefined();
  });

  it("does not need a village or a session", () => {
    expect(validateCandidateForm(filled({ sessionId: "" }))).toEqual({});
  });

  it("accepts a typed address (names, no codes) as much as a picked one", () => {
    const typed = { province: { code: null, name: "Kampong Cham" }, district: { code: null, name: "Cheung Prey" }, commune: { code: null, name: "Prey Chhor" }, village: null };

    expect(validateCandidateForm(filled({ address: typed }))).toEqual({});
  });

  it("treats a level with only blanks as missing", () => {
    const blank = { ...address, commune: { code: null, name: "  " } };

    expect(validateCandidateForm(filled({ address: blank })).commune).toBeDefined();
  });
});

describe("placeServerErrors", () => {
  it("puts a message under its own field", () => {
    expect(placeServerErrors(filled(), { nameEn: "Use English letters.", phone: "Bad phone." })).toEqual({
      nameEn: "Use English letters.",
      phone: "Bad phone.",
    });
  });

  it("puts the school's messages under the pick, or under the typed name once Other is chosen", () => {
    expect(placeServerErrors(filled({ school: "host-1" }), { schoolHostId: "Not a high school.", schoolName: "x" })).toEqual({ school: "Not a high school." });
    expect(placeServerErrors(filled({ school: OTHER_SCHOOL }), { schoolName: "Enter the name." })).toEqual({ schoolName: "Enter the name." });
    expect(placeServerErrors(filled({ school: "" }), { schoolName: "Choose the school." })).toEqual({ school: "Choose the school." });
  });

  it("ignores a key the form has no place for, and keeps the first message for a place", () => {
    expect(placeServerErrors(filled(), { unknown: "?", sessionId: "Not this campaign's." })).toEqual({ sessionId: "Not this campaign's." });
    expect(placeServerErrors(filled(), undefined)).toEqual({});
  });

  it("knows every place in the form", () => {
    const all = Object.fromEntries(CANDIDATE_FIELD_ORDER.map((f) => [f, f]));

    expect(Object.keys(placeServerErrors(filled({ school: OTHER_SCHOOL }), all)).sort()).toEqual([...CANDIDATE_FIELD_ORDER].sort());
  });
});

describe("isDirty", () => {
  it("is false for the same form, and for a change that was changed back", () => {
    const start = filled();

    expect(isDirty(filled(), start)).toBe(false);
    expect(isDirty(filled({ nameEn: "Sok Dara" }), start)).toBe(true);
    expect(isDirty({ ...filled({ nameEn: "Sok Dara" }), nameEn: "Sok Chenda" }, start)).toBe(false);
  });

  it("sees a change inside the address", () => {
    expect(isDirty(filled({ address: { ...address, village: { code: "1", name: "Phum 1" } } }), filled())).toBe(true);
  });
});
