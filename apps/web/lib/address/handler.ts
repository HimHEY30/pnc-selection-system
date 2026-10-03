import { PARENT_PARAM, isLevel, isPlaceId, type PlaceOption } from "./places";
import type { PlacesResult } from "./source";

export type AddressReply =
  | { status: 200; body: { places: PlaceOption[] } }
  | { status: 400; body: { error: "bad_request" } }
  | { status: 502; body: { error: "unavailable" } };

/**
 * The answer to "list the places at this level (under this parent)". Kept apart from the route file so it can be
 * tested without a server. Refuses anything that is not a known level and a plain numeric parent id.
 */
export async function answerAddress(
  level: string,
  query: URLSearchParams,
  source: { list(level: "provinces" | "districts" | "communes" | "villages", parentId: string | null): Promise<PlacesResult> },
): Promise<AddressReply> {
  if (!isLevel(level)) return { status: 400, body: { error: "bad_request" } };

  let parentId: string | null = null;
  if (level !== "provinces") {
    parentId = query.get(PARENT_PARAM[level].ours);
    if (!isPlaceId(parentId)) return { status: 400, body: { error: "bad_request" } };
  }

  const result = await source.list(level, parentId);
  return result.ok ? { status: 200, body: { places: result.places } } : { status: 502, body: { error: "unavailable" } };
}
