import { describe, expect, it } from "vitest";
import { filtersToUrl, isFiltering, parseFilters } from "./filters";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

describe("parseFilters", () => {
  it("reads every filter from the address", () => {
    expect(parseFilters({ q: "chenda", province: "Siem Reap", sessionId: ID, ngo: "yes", page: "3" })).toEqual({
      q: "chenda",
      province: "Siem Reap",
      sessionId: ID,
      ngo: "yes",
      page: 3,
    });
  });

  it("gives nothing for an empty address", () => {
    expect(parseFilters({})).toEqual({});
  });

  it("trims the search and drops a blank one", () => {
    expect(parseFilters({ q: "  chenda  " }).q).toBe("chenda");
    expect(parseFilters({ q: "   " })).toEqual({});
  });

  it("takes the first when a parameter is repeated", () => {
    expect(parseFilters({ q: ["first", "second"], ngo: ["no", "yes"] })).toEqual({ q: "first", ngo: "no" });
  });

  it.each([
    ["a session that is not a GUID", { sessionId: "1; drop table" }],
    ["an NGO answer that is neither yes nor no", { ngo: "maybe" }],
    ["page 0", { page: "0" }],
    ["page 1 (no page means the first)", { page: "1" }],
    ["a negative page", { page: "-4" }],
    ["a fractional page", { page: "2.5" }],
    ["a page that is not a number", { page: "two" }],
    ["an absurd page", { page: "99999999" }],
  ])("leaves out %s", (_label, params) => {
    expect(parseFilters(params)).toEqual({});
  });

  it("cuts a very long search and province short", () => {
    const filters = parseFilters({ q: "a".repeat(500), province: "b".repeat(500) });

    expect(filters.q).toHaveLength(100);
    expect(filters.province).toHaveLength(100);
  });
});

describe("filtersToUrl", () => {
  it("is empty when there is nothing to say, and page 1 is left out", () => {
    expect(filtersToUrl({})).toBe("");
    expect(filtersToUrl({ page: 1 })).toBe("");
  });

  it("writes only what is set, escaped", () => {
    const query = new URLSearchParams(filtersToUrl({ q: " a&b ", province: "Siem Reap", sessionId: ID, ngo: "no", page: 2 }));

    expect(Object.fromEntries(query)).toEqual({ q: "a&b", province: "Siem Reap", sessionId: ID, ngo: "no", page: "2" });
    expect(filtersToUrl({ q: "a&b" })).toBe("?q=a%26b");
  });

  it("round-trips through parseFilters", () => {
    const filters = { q: "chenda", province: "Siem Reap", sessionId: ID, ngo: "yes" as const, page: 4 };

    expect(parseFilters(Object.fromEntries(new URLSearchParams(filtersToUrl(filters))))).toEqual(filters);
  });
});

describe("isFiltering", () => {
  it("is true for a search or any filter, false for none, and the page alone does not count", () => {
    expect(isFiltering({})).toBe(false);
    expect(isFiltering({ page: 5 })).toBe(false);
    expect(isFiltering({ q: "   " })).toBe(false);
    expect(isFiltering({ q: "x" })).toBe(true);
    expect(isFiltering({ province: "Kampot" })).toBe(true);
    expect(isFiltering({ sessionId: ID })).toBe(true);
    expect(isFiltering({ ngo: "no" })).toBe(true);
  });
});
