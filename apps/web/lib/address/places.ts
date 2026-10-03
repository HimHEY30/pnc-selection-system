// What the address picker works with. Safe to import from client components: no server-only code.

/** The four levels of a Cambodian address, from the biggest down. */
export const LEVELS = ["provinces", "districts", "communes", "villages"] as const;
export type Level = (typeof LEVELS)[number];

/**
 * One place in a list. `code` is the address service's own id (text, because it keeps leading zeros: "01" is Banteay
 * Meanchey). `name` is the English (Latin) spelling that is saved with a candidate; `nameKm` is shown beside it.
 */
export type PlaceOption = { code: string; name: string; nameKm: string | null };

export const isLevel = (value: string): value is Level => (LEVELS as readonly string[]).includes(value);

/** The level above, whose id the list is asked for. Provinces have none. */
export const PARENT_LEVEL: Record<Level, Level | null> = {
  provinces: null,
  districts: "provinces",
  communes: "districts",
  villages: "communes",
};

/** The name of the query parameter that carries the parent's id, in our route and in the address service. */
export const PARENT_PARAM: Record<Exclude<Level, "provinces">, { ours: string; upstream: string }> = {
  districts: { ours: "provinceId", upstream: "province_id" },
  communes: { ours: "districtId", upstream: "district_id" },
  villages: { ours: "communeId", upstream: "commune_id" },
};

/** A place id is digits only. Checked before it goes into a URL, so nothing else can be asked of the service. */
export const isPlaceId = (value: string | null | undefined): value is string => /^\d{1,8}$/.test(value ?? "");

/** Reads one place from the address service's answer. Null if it has no usable id or name. */
export function readPlace(raw: unknown): PlaceOption | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const code = typeof item.id === "string" ? item.id : null;
  const name = [item.name_en, item.name_latin].find((n): n is string => typeof n === "string" && n.trim() !== "");
  if (!code || !isPlaceId(code) || !name) return null;
  const nameKm = typeof item.name_km === "string" && item.name_km.trim() !== "" ? item.name_km.trim() : null;
  return { code, name: name.trim(), nameKm };
}

/** What a list shows for a place: the English name, and the Khmer one beside it when there is one. */
export const placeLabel = (place: PlaceOption): string => (place.nameKm ? `${place.name} · ${place.nameKm}` : place.name);
