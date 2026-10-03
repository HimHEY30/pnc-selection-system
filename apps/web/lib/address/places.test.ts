import { describe, expect, it } from "vitest";
import { isLevel, isPlaceId, placeLabel, readPlace } from "./places";

describe("readPlace", () => {
  it("reads the code, the English name and the Khmer name from the address service's answer", () => {
    expect(readPlace({ id: "1201", name_en: "Chamkar Mon", name_latin: "Chamkar Mon", name_km: "ចំការមន", geodata: null })).toEqual({
      code: "1201",
      name: "Chamkar Mon",
      nameKm: "ចំការមន",
    });
  });

  it("reads items exactly as the live service sent them (checked on 2026-10-03, trimmed to the fields that matter)", () => {
    const province = { id: "02", administrative_unit: { name_en: "Province" }, name_km: "បាត់ដំបង", name_en: "Battambang", name_latin: "Battambang", geodata: null };
    const village = { id: "12010101", administrative_unit: { name_en: "Village" }, name_km: "ភូមិ ១", name_en: "Phum 1", name_latin: "Phum 1", commune_id: "120101" };

    expect(readPlace(province)).toEqual({ code: "02", name: "Battambang", nameKm: "បាត់ដំបង" });
    expect(readPlace(village)).toEqual({ code: "12010101", name: "Phum 1", nameKm: "ភូមិ ១" });
  });

  it("keeps a code's leading zero", () => {
    expect(readPlace({ id: "01", name_en: "Banteay Meanchey", name_km: "បន្ទាយមានជ័យ" })?.code).toBe("01");
  });

  it("falls back to the Latin spelling when there is no English name", () => {
    expect(readPlace({ id: "12010101", name_en: null, name_latin: " Phum 1 ", name_km: null })).toEqual({
      code: "12010101",
      name: "Phum 1",
      nameKm: null,
    });
  });

  it.each([
    ["no id", { name_en: "X" }],
    ["a numeric id", { id: 12, name_en: "X" }],
    ["an id that is not digits", { id: "12/../x", name_en: "X" }],
    ["a blank name", { id: "12", name_en: " ", name_latin: "" }],
    ["no name at all", { id: "12" }],
    ["null", null],
    ["a string", "Phnom Penh"],
  ])("gives nothing for %s", (_label, raw) => {
    expect(readPlace(raw)).toBeNull();
  });
});

describe("isPlaceId and isLevel", () => {
  it("accepts one to eight digits only", () => {
    expect(["1", "01", "12010101"].every(isPlaceId)).toBe(true);
    expect(["", null, undefined, "123456789", "1a", "../1", "1 ", "-1"].some(isPlaceId)).toBe(false);
  });

  it("knows the four levels and nothing else", () => {
    expect(["provinces", "districts", "communes", "villages"].every(isLevel)).toBe(true);
    expect(["province", "", "admin", "__proto__"].some(isLevel)).toBe(false);
  });
});

describe("placeLabel", () => {
  it("shows the Khmer name beside the English one when there is one", () => {
    expect(placeLabel({ code: "1", name: "Kampot", nameKm: "កំពត" })).toBe("Kampot · កំពត");
    expect(placeLabel({ code: "1", name: "Kampot", nameKm: null })).toBe("Kampot");
  });
});
