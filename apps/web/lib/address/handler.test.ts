import { describe, expect, it, vi } from "vitest";
import { answerAddress } from "./handler";

const places = [{ code: "12", name: "Phnom Penh", nameKm: "ភ្នំពេញ" }];
const sourceReturning = (result: { ok: true; places: typeof places } | { ok: false }) => ({ list: vi.fn().mockResolvedValue(result) });
const query = (qs = "") => new URLSearchParams(qs);

describe("answerAddress", () => {
  it("lists the provinces with no parent", async () => {
    const source = sourceReturning({ ok: true, places });

    expect(await answerAddress("provinces", query(), source)).toEqual({ status: 200, body: { places } });
    expect(source.list).toHaveBeenCalledWith("provinces", null);
  });

  it.each([
    ["districts", "provinceId=12", "12"],
    ["communes", "districtId=1201", "1201"],
    ["villages", "communeId=120101", "120101"],
  ])("lists %s under the parent in %s", async (level, qs, parent) => {
    const source = sourceReturning({ ok: true, places });

    expect((await answerAddress(level, query(qs), source)).status).toBe(200);
    expect(source.list).toHaveBeenCalledWith(level, parent);
  });

  it.each([
    ["an unknown level", "region", ""],
    ["a missing parent", "districts", ""],
    ["the wrong parent parameter for the level", "districts", "districtId=12"],
    ["a parent that is not digits", "communes", "districtId=12%2F..%2Fx"],
  ])("refuses %s without asking the source", async (_label, level, qs) => {
    const source = sourceReturning({ ok: true, places });

    expect(await answerAction(level, qs, source)).toEqual({ status: 400, body: { error: "bad_request" } });
    expect(source.list).not.toHaveBeenCalled();
  });

  it("says bad gateway when the lists cannot be had", async () => {
    expect(await answerAddress("provinces", query(), sourceReturning({ ok: false }))).toEqual({
      status: 502,
      body: { error: "unavailable" },
    });
  });
});

const answerAction = (level: string, qs: string, source: ReturnType<typeof sourceReturning>) => answerAddress(level, query(qs), source);
