import type { Level, PlaceOption } from "./places";
import { PARENT_PARAM } from "./places";

// The browser's side of the address lists: asks our own web server (app/api/address), which asks the public address
// service. A list that was read once is kept for the life of the page, so going back to a province costs nothing.

const kept = new Map<string, PlaceOption[]>();

/** The places at a level (under a parent, except for provinces). Null when they could not be loaded. A failure is not kept. */
export async function fetchPlaces(level: Level, parentCode: string | null, fetchImpl: typeof fetch = fetch): Promise<PlaceOption[] | null> {
  const key = `${level}:${parentCode ?? ""}`;
  const have = kept.get(key);
  if (have) return have;

  const query = level === "provinces" ? "" : `?${PARENT_PARAM[level].ours}=${encodeURIComponent(parentCode ?? "")}`;
  try {
    const response = await fetchImpl(`/api/address/${level}${query}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body = (await response.json()) as { places?: PlaceOption[] };
    if (!Array.isArray(body.places)) return null;
    kept.set(key, body.places);
    return body.places;
  } catch {
    return null;
  }
}

/** Forgets everything read so far. For tests. */
export const forgetPlaces = () => kept.clear();
