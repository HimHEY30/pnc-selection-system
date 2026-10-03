import { t } from "@/lib/messages";
import type { Address, Candidate, CandidateRequest, Gender } from "./types";

// The candidate form: its working copy (as typed), how it becomes the request the backend takes, and the checks that
// save a round trip. The backend checks everything again, including the letters in a name and the phone's form, and
// is the authority; these only catch what is plainly missing.

/** The school select's value for "Other: type the name". Never a real host id. */
export const OTHER_SCHOOL = "__other";

export const NAME_MAX = 100;
export const SCHOOL_NAME_MAX = 150;
export const NGO_NAME_MAX = 150;

export type CandidateForm = {
  nameKm: string;
  nameEn: string;
  gender: Gender | "";
  /** yyyy-mm-dd, as a date box gives it. */
  dateOfBirth: string;
  phone: string;
  address: Address;
  /** A school host's id, OTHER_SCHOOL, or "" before one is chosen. */
  school: string;
  /** The typed name, used only with OTHER_SCHOOL. */
  schoolName: string;
  /** A session's id, or "" for none. */
  sessionId: string;
  ngo: "yes" | "no";
  ngoName: string;
};

/** The places in the form where a message can go. */
export type CandidateField =
  | "nameKm"
  | "nameEn"
  | "gender"
  | "dateOfBirth"
  | "phone"
  | "province"
  | "district"
  | "commune"
  | "village"
  | "school"
  | "schoolName"
  | "sessionId"
  | "ngoName";

/** Top to bottom, so the first problem is the one that gets the focus. */
export const CANDIDATE_FIELD_ORDER: readonly CandidateField[] = [
  "nameKm",
  "nameEn",
  "gender",
  "dateOfBirth",
  "phone",
  "province",
  "district",
  "commune",
  "village",
  "school",
  "schoolName",
  "sessionId",
  "ngoName",
];

export type CandidateErrors = Partial<Record<CandidateField, string>>;

const NO_ADDRESS: Address = { province: null, district: null, commune: null, village: null };

export function emptyCandidateForm(): CandidateForm {
  return {
    nameKm: "",
    nameEn: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    address: NO_ADDRESS,
    school: "",
    schoolName: "",
    sessionId: "",
    ngo: "no",
    ngoName: "",
  };
}

/** The form of a candidate being changed. A school that was typed comes back as "Other" with its name. */
export function formFromCandidate(candidate: Candidate): CandidateForm {
  return {
    nameKm: candidate.nameKm,
    nameEn: candidate.nameEn,
    gender: candidate.gender,
    dateOfBirth: candidate.dateOfBirth,
    phone: candidate.phone,
    address: candidate.address,
    school: candidate.schoolHostId ?? OTHER_SCHOOL,
    schoolName: candidate.schoolHostId ? "" : candidate.schoolName,
    sessionId: candidate.session?.id ?? "",
    ngo: candidate.hasNgoSupport ? "yes" : "no",
    ngoName: candidate.ngoName ?? "",
  };
}

const trimmed = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** What is sent. Only the school's id counts when one was picked, and only its name when it was typed. */
export function toCandidateRequest(form: CandidateForm, version: number | null): CandidateRequest {
  const picked = form.school !== "" && form.school !== OTHER_SCHOOL;
  const ngo = form.ngo === "yes";
  return {
    nameKm: form.nameKm.trim(),
    nameEn: form.nameEn.trim(),
    gender: form.gender === "" ? null : form.gender,
    dateOfBirth: trimmed(form.dateOfBirth),
    phone: form.phone.trim(),
    address: form.address,
    schoolHostId: picked ? form.school : null,
    schoolName: picked ? null : trimmed(form.schoolName),
    sessionId: trimmed(form.sessionId),
    hasNgoSupport: ngo,
    ngoName: ngo ? trimmed(form.ngoName) : null,
    version,
  };
}

/** What is plainly missing, per field. Empty when the form is ready to send. */
export function validateCandidateForm(form: CandidateForm): CandidateErrors {
  const missing = t.candidates.form.required;
  const errors: CandidateErrors = {};

  if (!form.nameKm.trim()) errors.nameKm = missing.nameKm;
  if (!form.nameEn.trim()) errors.nameEn = missing.nameEn;
  if (form.gender === "") errors.gender = missing.gender;
  if (!form.dateOfBirth.trim()) errors.dateOfBirth = missing.dateOfBirth;
  if (!form.phone.trim()) errors.phone = missing.phone;
  if (!form.address.province?.name?.trim()) errors.province = missing.province;
  if (!form.address.district?.name?.trim()) errors.district = missing.district;
  if (!form.address.commune?.name?.trim()) errors.commune = missing.commune;
  if (form.school === "") errors.school = missing.school;
  else if (form.school === OTHER_SCHOOL && !form.schoolName.trim()) errors.schoolName = missing.schoolName;
  if (form.ngo === "yes" && !form.ngoName.trim()) errors.ngoName = missing.ngoName;

  return errors;
}

/**
 * Puts the backend's messages where they belong in the form. The backend names the school's id and its name separately;
 * on screen the pick and the typed name are two places, depending on whether "Other" is chosen.
 */
export function placeServerErrors(form: CandidateForm, fieldErrors: Record<string, string> | undefined): CandidateErrors {
  const placed: CandidateErrors = {};
  for (const [key, message] of Object.entries(fieldErrors ?? {})) {
    const field: CandidateField | null =
      key === "schoolHostId"
        ? "school"
        : key === "schoolName"
          ? form.school === OTHER_SCHOOL
            ? "schoolName"
            : "school"
          : (CANDIDATE_FIELD_ORDER as readonly string[]).includes(key)
            ? (key as CandidateField)
            : null;
    if (field && !placed[field]) placed[field] = message;
  }
  return placed;
}

/** True when the form differs from where it started. Compared by value, so changing something and changing it back is no change. */
export const isDirty = (current: CandidateForm, initial: CandidateForm): boolean => JSON.stringify(current) !== JSON.stringify(initial);
