import { t } from "@/lib/messages";
import { formatDate, isEndAfterStart, isIsoDate } from "./dates";
import type { CampaignInfoInput, CreateCampaignInput } from "./types";

// Client-side mirror of the backend rules (Campaigns.Application/CampaignValidator.cs).
// It exists for instant feedback; the server still checks everything and its messages
// are shown too. Keep the limits and wording in step with the backend.

export const NAME_MAX = 100;
export const ACADEMIC_YEAR_MAX = 20;
export const DESCRIPTION_MAX = 500;

/** What the Step 1 form holds while the user is typing: everything as text. */
export type InfoFormValues = {
  name: string;
  academicYear: string;
  description: string;
  startDate: string;
  endDate: string;
  expectedCandidates: string;
  seatsAvailable: string;
  provinceIds: number[];
};

export type InfoField = keyof InfoFormValues;
export type InfoErrors = Partial<Record<InfoField, string>>;

/** "draft" = Save draft (only name and year required); "complete" = Save and continue. */
export type SaveMode = "draft" | "complete";

/** Parses a typed number: digits only, so "1.5", "-3" and "1e3" are all rejected. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}

export function validateInfo(values: InfoFormValues, mode: SaveMode): InfoErrors {
  const errors: InfoErrors = {};
  const complete = mode === "complete";

  const name = values.name.trim();
  if (!name) errors.name = t.validation.nameRequired;
  else if (name.length > NAME_MAX) errors.name = t.validation.nameTooLong(NAME_MAX);

  const year = values.academicYear.trim();
  if (!year) errors.academicYear = t.validation.academicYearRequired;
  else if (year.length > ACADEMIC_YEAR_MAX) errors.academicYear = t.validation.academicYearTooLong(ACADEMIC_YEAR_MAX);

  if (values.description.trim().length > DESCRIPTION_MAX) {
    errors.description = t.validation.descriptionTooLong(DESCRIPTION_MAX);
  }

  const dateError = validateDates(values.startDate, values.endDate, complete);
  if (dateError.startDate) errors.startDate = dateError.startDate;
  if (dateError.endDate) errors.endDate = dateError.endDate;

  const expectedText = values.expectedCandidates.trim();
  const expected = parseCount(expectedText);
  if (!expectedText) {
    if (complete) errors.expectedCandidates = t.validation.expectedRequired;
  } else if (expected === null || expected <= 0) {
    errors.expectedCandidates = t.validation.expectedInvalid;
  }

  const seatsText = values.seatsAvailable.trim();
  const seats = parseCount(seatsText);
  if (!seatsText) {
    if (complete) errors.seatsAvailable = t.validation.seatsRequired;
  } else if (seats === null || seats <= 0) {
    errors.seatsAvailable = t.validation.seatsInvalid;
  } else if (expected !== null && expected > 0 && seats > expected) {
    errors.seatsAvailable = t.validation.seatsTooMany(expected.toLocaleString("en-US"));
  }

  if (complete && values.provinceIds.length === 0) {
    errors.provinceIds = t.validation.provincesRequired;
  }

  return errors;
}

/**
 * Date rules on their own, so the form can show the end-date error live while the user
 * is still typing - the design shows it before any save.
 */
export function validateDates(
  startDate: string,
  endDate: string,
  complete: boolean,
): { startDate?: string; endDate?: string } {
  const errors: { startDate?: string; endDate?: string } = {};

  if (!startDate) {
    if (complete) errors.startDate = t.validation.startDateRequired;
  } else if (!isIsoDate(startDate)) {
    errors.startDate = t.validation.startDateRequired;
  }

  if (!endDate) {
    if (complete) errors.endDate = t.validation.endDateRequired;
  } else if (!isIsoDate(endDate)) {
    errors.endDate = t.validation.endDateRequired;
  } else if (startDate && isIsoDate(startDate) && !isEndAfterStart(startDate, endDate)) {
    errors.endDate = t.validation.endBeforeStart(formatDate(startDate));
  }

  return errors;
}

export type CreateField = "name" | "academicYear" | "description";
export type CreateErrors = Partial<Record<CreateField, string>>;

export function validateCreate(values: Pick<CreateCampaignInput, CreateField>): CreateErrors {
  const errors: CreateErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = t.validation.nameRequired;
  else if (name.length > NAME_MAX) errors.name = t.validation.nameTooLong(NAME_MAX);

  const year = values.academicYear.trim();
  if (!year) errors.academicYear = t.validation.academicYearRequired;
  else if (year.length > ACADEMIC_YEAR_MAX) errors.academicYear = t.validation.academicYearTooLong(ACADEMIC_YEAR_MAX);

  if (values.description.trim().length > DESCRIPTION_MAX) {
    errors.description = t.validation.descriptionTooLong(DESCRIPTION_MAX);
  }

  return errors;
}

/** Turns the form's text values into the request body. */
export function toInfoInput(values: InfoFormValues, version: number | null): CampaignInfoInput {
  return {
    name: values.name.trim(),
    academicYear: values.academicYear.trim(),
    description: values.description.trim() || null,
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    expectedCandidates: parseCount(values.expectedCandidates),
    seatsAvailable: parseCount(values.seatsAvailable),
    provinceIds: values.provinceIds,
    version,
  };
}
