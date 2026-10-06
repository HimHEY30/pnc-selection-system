import { describe, expect, it } from "vitest";
import { OTHER_SCHOOL, emptyCandidateForm, validateCandidateForm, type CandidateForm } from "./form";
import { formProgress } from "./progress";

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

describe("formProgress", () => {
  it("starts an empty form at 0% with the personal section next", () => {
    const progress = formProgress(emptyCandidateForm());

    expect(progress.percent).toBe(0);
    expect(progress.current).toBe("person");
    expect(progress.required).toBe(9); // five personal, three location, the school
    expect(progress.sections.map((s) => s.complete)).toEqual([false, false, false, true]);
  });

  it("is 100% with nothing current when the form is ready to send", () => {
    const progress = formProgress(filled());

    expect(progress.percent).toBe(100);
    expect(progress.current).toBeNull();
    expect(progress.missing).toEqual([]);
  });

  it("counts a section complete when it has nothing required, as with no NGO", () => {
    const support = formProgress(filled()).sections.find((s) => s.id === "support")!;

    expect(support).toMatchObject({ required: 0, complete: true });
  });

  it("asks for the school's name only when Other is chosen, and the NGO's name only for Yes", () => {
    const other = formProgress(filled({ school: OTHER_SCHOOL }));
    expect(other.required).toBe(10);
    expect(other.missing).toEqual(["schoolName"]);
    expect(other.current).toBe("school");

    const ngo = formProgress(filled({ ngo: "yes" }));
    expect(ngo.missing).toEqual(["ngoName"]);
    expect(ngo.current).toBe("support");
  });

  it("points at the first unfinished section, not the first empty field", () => {
    const progress = formProgress(filled({ address: { ...address, commune: null } }));

    expect(progress.current).toBe("location");
    expect(progress.missing).toEqual(["commune"]);
    expect(progress.percent).toBe(89);
  });

  it("never disagrees with the validation that guards saving", () => {
    const forms = [
      emptyCandidateForm(),
      filled(),
      filled({ phone: "  ", gender: "" }),
      filled({ school: OTHER_SCHOOL, schoolName: " " }),
      filled({ ngo: "yes", ngoName: "Hope" }),
      filled({ address: { ...address, province: null, district: null } }),
    ];

    for (const form of forms) {
      const refused = Object.keys(validateCandidateForm(form)).sort();
      expect([...formProgress(form).missing].sort()).toEqual(refused);
    }
  });
});
