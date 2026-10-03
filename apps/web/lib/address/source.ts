import "server-only";
import { PARENT_PARAM, isPlaceId, readPlace, type Level, type PlaceOption } from "./places";

// Where the address lists come from. The browser cannot ask the public Cambodia address service itself (it does not
// allow other websites to read its answers), so the web server asks it and the browser asks the web server. Only place
// codes are sent: nothing about a candidate ever leaves our system.

/** Pumi, an open-source Cambodia geodata project. Change it with ADDRESS_API_URL if the service moves. */
const DEFAULT_URL = "https://pumi.onrender.com/pumi";

/** The lists almost never change, so a copy is kept for a day. */
const FRESH_MS = 24 * 60 * 60 * 1000;
/** A free-tier host can take a while to wake up. Past this we give up and the form lets the person type instead. */
const TIMEOUT_MS = 15_000;

export type PlacesResult = { ok: true; places: PlaceOption[] } | { ok: false };

type Options = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
  freshMs?: number;
  timeoutMs?: number;
};

/**
 * Lists the places at one level, optionally under a parent. Keeps what it has read for a day, and when the service is
 * down serves the last copy it has, however old, before giving up. Pass options only in tests.
 */
export function createAddressSource(options: Options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? process.env.ADDRESS_API_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const now = options.now ?? Date.now;
  const freshMs = options.freshMs ?? FRESH_MS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const kept = new Map<string, { at: number; places: PlaceOption[] }>();

  async function ask(level: Level, parentId: string | null): Promise<PlaceOption[] | null> {
    const url = new URL(`${baseUrl}/${level}`);
    if (level !== "provinces") url.searchParams.set(PARENT_PARAM[level].upstream, parentId!);

    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!Array.isArray(body)) return null;
      return body.map(readPlace).filter((p): p is PlaceOption => p !== null);
    } catch {
      return null;
    }
  }

  return {
    async list(level: Level, parentId: string | null): Promise<PlacesResult> {
      if (level !== "provinces" && !isPlaceId(parentId)) return { ok: false };

      const key = `${level}:${parentId ?? ""}`;
      const have = kept.get(key);
      if (have && now() - have.at < freshMs) return { ok: true, places: have.places };

      const places = await ask(level, parentId);
      if (places) {
        // An empty list is a real answer only for a level that can be empty (a commune with no villages listed).
        if (places.length === 0 && level === "provinces") return have ? { ok: true, places: have.places } : { ok: false };
        kept.set(key, { at: now(), places });
        return { ok: true, places };
      }

      return have ? { ok: true, places: have.places } : { ok: false };
    },
  };
}

/** The one source the route uses, so its cache is shared by every request. */
export const addressSource = createAddressSource();
