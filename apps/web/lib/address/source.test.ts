import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAddressSource } from "./source";

const fetchMock = vi.fn();
let clock = 0;

const source = (overrides: Parameters<typeof createAddressSource>[0] = {}) =>
  createAddressSource({ fetchImpl: fetchMock as unknown as typeof fetch, baseUrl: "https://geo.example/pumi/", now: () => clock, ...overrides });

const reply = (items: unknown) => Promise.resolve(Response.json(items));
const rawPlace = (id: string, name: string) => ({ id, name_en: name, name_km: `km-${name}` });
const askedUrl = (call = 0) => String(fetchMock.mock.calls[call][0]);

beforeEach(() => {
  fetchMock.mockReset();
  clock = 1_000;
});

describe("asking the address service", () => {
  it("asks for provinces with no parent", async () => {
    fetchMock.mockReturnValue(reply([rawPlace("12", "Phnom Penh")]));

    const result = await source().list("provinces", null);

    expect(result).toEqual({ ok: true, places: [{ code: "12", name: "Phnom Penh", nameKm: "km-Phnom Penh" }] });
    expect(askedUrl()).toBe("https://geo.example/pumi/provinces");
  });

  it.each([
    ["districts", "12", "https://geo.example/pumi/districts?province_id=12"],
    ["communes", "1201", "https://geo.example/pumi/communes?district_id=1201"],
    ["villages", "120101", "https://geo.example/pumi/villages?commune_id=120101"],
  ] as const)("asks for %s under their parent with the service's own parameter name", async (level, parent, url) => {
    fetchMock.mockReturnValue(reply([rawPlace("1", "X")]));

    await source().list(level, parent);

    expect(askedUrl()).toBe(url);
  });

  it("never asks when the parent is missing or is not plain digits", async () => {
    for (const parent of [null, "", "12/../../x", "1;2", "12 "]) {
      expect(await source().list("districts", parent)).toEqual({ ok: false });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves out items it cannot read, and refuses an answer that is not a list", async () => {
    fetchMock.mockReturnValueOnce(reply([rawPlace("1", "Good"), { name_en: "No id" }, null]));
    expect(await source().list("districts", "12")).toEqual({ ok: true, places: [{ code: "1", name: "Good", nameKm: "km-Good" }] });

    fetchMock.mockReturnValueOnce(reply({ error: "nope" }));
    expect(await source().list("districts", "99")).toEqual({ ok: false });
  });
});

describe("keeping what it has read", () => {
  it("does not ask again within the day, but does after it", async () => {
    fetchMock.mockImplementation(() => reply([rawPlace("1", "X")]));
    const s = source({ freshMs: 1_000 });

    await s.list("districts", "12");
    clock += 999;
    await s.list("districts", "12");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock += 2;
    await s.list("districts", "12");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps each level and parent apart", async () => {
    fetchMock.mockImplementation(() => reply([rawPlace("1", "X")]));
    const s = source();

    await s.list("districts", "12");
    await s.list("districts", "13");
    await s.list("communes", "12");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("serves the last copy, however old, when the service is down", async () => {
    fetchMock.mockReturnValueOnce(reply([rawPlace("1", "Old")]));
    const s = source({ freshMs: 1_000 });
    await s.list("districts", "12");

    clock += 1_000_000;
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await s.list("districts", "12")).toEqual({ ok: true, places: [{ code: "1", name: "Old", nameKm: "km-Old" }] });
  });

  it("fails when the service is down and there is nothing kept", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await source().list("districts", "12")).toEqual({ ok: false });
  });

  it("treats an error status as down", async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response("busy", { status: 503 })));

    expect(await source().list("provinces", null)).toEqual({ ok: false });
  });

  it("never keeps a failure, so the next ask tries again", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    fetchMock.mockReturnValueOnce(reply([rawPlace("12", "Phnom Penh")]));
    const s = source();

    expect(await s.list("provinces", null)).toEqual({ ok: false });
    expect((await s.list("provinces", null)).ok).toBe(true);
  });

  it("does not take an empty list of provinces for an answer, but lets a commune have no villages", async () => {
    fetchMock.mockImplementation(() => reply([]));

    expect(await source().list("provinces", null)).toEqual({ ok: false });
    expect(await source().list("villages", "120101")).toEqual({ ok: true, places: [] });
  });

  it("gives up after its timeout instead of waiting for a sleeping service", async () => {
    fetchMock.mockImplementation((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
    }));

    expect(await source({ timeoutMs: 20 }).list("provinces", null)).toEqual({ ok: false });
  });
});
