import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const redirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", (...args: unknown[]) => fetchMock(...args));

import { apiRequest, ApiUnavailableError } from "./client";

const signedIn = () => auth.mockResolvedValue({ accessToken: "token-1" });

beforeEach(() => {
  auth.mockReset();
  fetchMock.mockReset();
  redirect.mockClear();
});

describe("apiRequest", () => {
  it("calls the backend as the signed-in user and returns what it sends", async () => {
    signedIn();
    fetchMock.mockResolvedValue(Response.json({ id: 1 }));

    const result = await apiRequest<{ id: number }>("/api/things");

    expect(result).toEqual({ ok: true, data: { id: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/things$/);
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(init.cache).toBe("no-store");
  });

  it("treats 204 No Content (a delete) as success with nothing to read", async () => {
    signedIn();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiRequest<void>("/api/things/1", { method: "DELETE" });

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("reports a refusal with its title, code and field messages", async () => {
    signedIn();
    fetchMock.mockResolvedValue(
      Response.json({ title: "Some fields need your attention.", code: "x.invalid", errors: { phone: ["Bad phone."] } }, { status: 400 }),
    );

    const result = await apiRequest("/api/things", { method: "POST", body: {} });

    expect(result).toEqual({
      ok: false,
      problem: { status: 400, title: "Some fields need your attention.", code: "x.invalid", fieldErrors: { phone: ["Bad phone."] } },
    });
  });

  it("sends people to sign in when there is no session, and when the backend says 401", async () => {
    auth.mockResolvedValue(null);
    await expect(apiRequest("/api/things")).rejects.toThrow("redirect:/login");

    signedIn();
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(apiRequest("/api/things")).rejects.toThrow("redirect:/login");
  });

  it("says the backend is unavailable when it cannot be reached", async () => {
    signedIn();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(apiRequest("/api/things")).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
