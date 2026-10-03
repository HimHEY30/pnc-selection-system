import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPlaces, forgetPlaces } from "./client";

const fetchMock = vi.fn();
const asFetch = fetchMock as unknown as typeof fetch;
const places = [{ code: "12", name: "Phnom Penh", nameKm: "ភ្នំពេញ" }];

beforeEach(() => {
  fetchMock.mockReset();
  forgetPlaces();
});

describe("fetchPlaces", () => {
  it("asks our own server for provinces with no parent", async () => {
    fetchMock.mockResolvedValue(Response.json({ places }));

    expect(await fetchPlaces("provinces", null, asFetch)).toEqual(places);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/address/provinces");
  });

  it.each([
    ["districts", "12", "/api/address/districts?provinceId=12"],
    ["communes", "1201", "/api/address/communes?districtId=1201"],
    ["villages", "120101", "/api/address/villages?communeId=120101"],
  ] as const)("asks for %s under their parent", async (level, parent, url) => {
    fetchMock.mockResolvedValue(Response.json({ places }));

    await fetchPlaces(level, parent, asFetch);

    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it("keeps a list it has read, per level and parent", async () => {
    fetchMock.mockImplementation(async () => Response.json({ places }));

    await fetchPlaces("districts", "12", asFetch);
    await fetchPlaces("districts", "12", asFetch);
    await fetchPlaces("districts", "13", asFetch);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an error status", () => Promise.resolve(new Response("{}", { status: 502 }))],
    ["an answer that is not a list", () => Promise.resolve(Response.json({ places: "nope" }))],
    ["a broken answer", () => Promise.resolve(new Response("<html>", { status: 200 }))],
    ["no connection", () => Promise.reject(new TypeError("fetch failed"))],
  ])("gives null for %s, and does not keep the failure", async (_label, answer) => {
    fetchMock.mockImplementationOnce(answer);
    fetchMock.mockImplementationOnce(async () => Response.json({ places }));

    expect(await fetchPlaces("provinces", null, asFetch)).toBeNull();
    expect(await fetchPlaces("provinces", null, asFetch)).toEqual(places);
  });

  it("puts nothing odd into the URL", async () => {
    fetchMock.mockResolvedValue(Response.json({ places: [] }));

    await fetchPlaces("districts", "12&x=1", asFetch);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/address/districts?provinceId=12%26x%3D1");
  });
});
