import { OTHER_SCHOOL, validateCandidateForm, type CandidateField, type CandidateForm } from "./form";

// How far along the candidate form is. Nothing here has rules of its own: a field counts as outstanding exactly when
// `validateCandidateForm` would refuse it, so the progress shown can never disagree with what saving accepts.

export type SectionId = "person" | "location" | "school" | "support";

export const SECTION_ORDER: readonly SectionId[] = ["person", "location", "school", "support"];

/** The fields that can be required in each section. Which of them are required right now depends on the form. */
const SECTION_FIELDS: Record<SectionId, readonly CandidateField[]> = {
  person: ["nameKm", "nameEn", "gender", "dateOfBirth", "phone"],
  location: ["province", "district", "commune"],
  school: ["school", "schoolName"],
  support: ["ngoName"],
};

export type SectionProgress = {
  id: SectionId;
  /** How many fields this section needs right now, and how many of them are still empty. */
  required: number;
  missing: CandidateField[];
  /** Nothing outstanding. A section with nothing required (NGO answered "No") is complete. */
  complete: boolean;
};

export type FormProgress = {
  sections: SectionProgress[];
  required: number;
  missing: CandidateField[];
  /** Whole percent of the required fields that are filled. 100 when the form can be saved. */
  percent: number;
  /** The first section that still needs something, or null when the form is ready. */
  current: SectionId | null;
};

/** The fields that are required given the current answers (a typed school needs its name, an NGO needs its name). */
function requiredFields(form: CandidateForm): CandidateField[] {
  const fields: CandidateField[] = [...SECTION_FIELDS.person, ...SECTION_FIELDS.location, "school"];
  if (form.school === OTHER_SCHOOL) fields.push("schoolName");
  if (form.ngo === "yes") fields.push("ngoName");
  return fields;
}

export function formProgress(form: CandidateForm): FormProgress {
  const outstanding = validateCandidateForm(form);
  const required = new Set(requiredFields(form));

  const sections = SECTION_ORDER.map((id): SectionProgress => {
    const fields = SECTION_FIELDS[id].filter((field) => required.has(field));
    const missing = fields.filter((field) => outstanding[field]);
    return { id, required: fields.length, missing, complete: missing.length === 0 };
  });

  const total = sections.reduce((sum, s) => sum + s.required, 0);
  const missing = sections.flatMap((s) => s.missing);
  const percent = total === 0 ? 100 : Math.round(((total - missing.length) / total) * 100);

  return { sections, required: total, missing, percent, current: sections.find((s) => !s.complete)?.id ?? null };
}
