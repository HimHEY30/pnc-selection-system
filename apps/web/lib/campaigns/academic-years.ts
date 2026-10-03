const EN_DASH = "–";

function label(startYear: number): string {
  return `${startYear}${EN_DASH}${startYear + 1}`;
}

/**
 * Suggested academic years for the pick-list: last year's through four years ahead
 * (e.g. 2025–2026 ... 2030–2031 in 2026). If the campaign already holds a value that
 * is not in that range (older data), it is kept so the select never silently changes it.
 */
export function academicYearOptions(now: Date = new Date(), keep?: string): string[] {
  const year = now.getFullYear();
  const options = Array.from({ length: 6 }, (_, i) => label(year - 1 + i));
  if (keep && !options.includes(keep)) {
    options.push(keep);
    options.sort();
  }
  return options;
}

/** A new campaign is usually for next year's intake, so that is what is preselected. */
export function defaultAcademicYear(now: Date = new Date()): string {
  return label(now.getFullYear() + 1);
}
