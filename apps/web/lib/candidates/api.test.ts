import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  ApiError: class ApiError extends Error {
    constructor(readonly problem: unknown) {
      super("api error");
    }
  },
}));

import { listQuery, loadCandidateList, loadSchools, loadSessionChoices } from "./api";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

beforeEach(() => apiRequest.mockReset());

describe("listQuery", () => {
  it("asks for the page size and nothing else when there are no filters", () => {
    expect(listQuery({})).toBe("pageSize=20");
  });

  it("carries the search, the filters and the page, with the yes/no answer as true or false", () => {
    const query = new URLSearchParams(listQuery({ q: "  chenda ", province: "Siem Reap", sessionId: ID, ngo: "yes", page: 3 }));

    expect(Object.fromEntries(query)).toEqual({ q: "chenda", province: "Siem Reap", sessionId: ID, ngo: "true", page: "3", pageSize: "20" });
    expect(new URLSearchParams(listQuery({ ngo: "no" })).get("ngo")).toBe("false");
  });

  it("leaves out a blank search and the first page", () => {
    const query = new URLSearchParams(listQuery({ q: "   ", page: 1 }));

    expect(query.has("q")).toBe(false);
    expect(query.has("page")).toBe(false);
  });

  it("escapes what a person typed", () => {
    expect(listQuery({ q: "a&b=c" })).toContain("q=a%26b%3Dc");
  });
});

describe("the loaders", () => {
  it("loads a campaign's page of candidates", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { items: [] } });

    expect(await loadCandidateList(ID, { q: "x" })).toEqual({ items: [] });
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${ID}/candidates?q=x&pageSize=20`);
  });

  it("returns null for a campaign that does not exist, and throws for any other failure", async () => {
    apiRequest.mockResolvedValue({ ok: false, problem: { status: 404, title: "x" } });
    expect(await loadCandidateList(ID, {})).toBeNull();

    apiRequest.mockResolvedValue({ ok: false, problem: { status: 500, title: "x" } });
    await expect(loadCandidateList(ID, {})).rejects.toThrow();
  });

  it("loads session choices, and none for an unknown campaign", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: [{ id: "s1" }] });
    expect(await loadSessionChoices(ID)).toEqual([{ id: "s1" }]);
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${ID}/candidates/session-choices`);

    apiRequest.mockResolvedValue({ ok: false, problem: { status: 404, title: "x" } });
    expect(await loadSessionChoices(ID)).toEqual([]);
  });

  it("loads the schools, and throws when it cannot", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: [{ id: "h1", name: "Bak Touk High School" }] });
    expect(await loadSchools()).toEqual([{ id: "h1", name: "Bak Touk High School" }]);

    apiRequest.mockResolvedValue({ ok: false, problem: { status: 500, title: "x" } });
    await expect(loadSchools()).rejects.toThrow();
  });
});
