import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  ApiUnavailableError: class ApiUnavailableError extends Error {},
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { ApiUnavailableError } from "@/lib/api/client";
import type { HostRequest, SessionRequest } from "@/lib/sessions/types";
import {
  cancelSessionAction,
  createHostAction,
  createSessionAction,
  recordAttendanceAction,
  setExpectedAction,
  setHostActiveAction,
  updateHostAction,
  updateSessionAction,
} from "./sessions-actions";

const CAMPAIGN = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const SESSION = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const HOST = "11111111-2222-4333-8444-555555555555";

const request: SessionRequest = {
  title: "Open day",
  date: "2027-03-20",
  startTime: "09:00",
  endTime: "11:00",
  format: "InPerson",
  venue: "School hall",
  meetingLink: null,
  provinceId: null,
  notes: null,
  assigneeId: "officer-1",
  hostType: "Officer",
  hostId: null,
  hostUserId: "officer-1",
};

const hostRequest: HostRequest = { type: "Alumni", name: "Chenda Sok", partnerKind: null, contactPerson: null, phone: "012 345 678", email: null };

const signedInAs = (...roles: string[]) => auth.mockResolvedValue({ roles });
const backendReplies = (data: unknown) => apiRequest.mockResolvedValue({ ok: true, data });
const backendRefuses = (status: number, title: string, fieldErrors?: Record<string, string[]>) =>
  apiRequest.mockResolvedValue({ ok: false, problem: { status, title, fieldErrors } });

const MANAGEMENT_ONLY = [
  ["createSessionAction", () => createSessionAction(CAMPAIGN, request)],
  ["updateSessionAction", () => updateSessionAction(CAMPAIGN, SESSION, request)],
  ["cancelSessionAction", () => cancelSessionAction(CAMPAIGN, SESSION, "Rain")],
  ["createHostAction", () => createHostAction(hostRequest)],
  ["updateHostAction", () => updateHostAction(HOST, hostRequest)],
  ["setHostActiveAction", () => setHostActiveAction(HOST, false)],
] as const;

const OPERATIONS = [
  ["setExpectedAction", () => setExpectedAction(CAMPAIGN, SESSION, 40)],
  ["recordAttendanceAction", () => recordAttendanceAction(CAMPAIGN, SESSION, 18, 12)],
] as const;

beforeEach(() => {
  auth.mockReset();
  apiRequest.mockReset();
  revalidatePath.mockReset();
});

describe("what each action sends", () => {
  it("creates a session with a POST of the form as it is, and refreshes the pages that show it", async () => {
    signedInAs("selection-manager");
    backendReplies({ id: SESSION });

    const result = await createSessionAction(CAMPAIGN, request);

    expect(result).toEqual({ ok: true, data: { id: SESSION } });
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/sessions`, { method: "POST", body: request });
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("changes a session with a PUT", async () => {
    signedInAs("system-admin");
    backendReplies({});

    await updateSessionAction(CAMPAIGN, SESSION, request);

    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/sessions/${SESSION}`, { method: "PUT", body: request });
  });

  it("cancels a session with the reason", async () => {
    signedInAs("selection-manager");
    backendReplies({});

    await cancelSessionAction(CAMPAIGN, SESSION, "School closed");

    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/sessions/${SESSION}/cancel`, {
      method: "POST",
      body: { reason: "School closed" },
    });
  });

  it("sends the expected number, and null to clear it", async () => {
    signedInAs("selection-officer");
    backendReplies({});

    await setExpectedAction(CAMPAIGN, SESSION, 40);
    await setExpectedAction(CAMPAIGN, SESSION, null);

    expect(apiRequest).toHaveBeenNthCalledWith(1, `/api/campaigns/${CAMPAIGN}/sessions/${SESSION}/expected`, { method: "PUT", body: { expected: 40 } });
    expect(apiRequest).toHaveBeenNthCalledWith(2, `/api/campaigns/${CAMPAIGN}/sessions/${SESSION}/expected`, { method: "PUT", body: { expected: null } });
  });

  it("sends the females and the males", async () => {
    signedInAs("selection-officer");
    backendReplies({});

    await recordAttendanceAction(CAMPAIGN, SESSION, 18, 0);

    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/sessions/${SESSION}/attendance`, {
      method: "PUT",
      body: { female: 18, male: 0 },
    });
  });

  it("adds, changes and switches a host", async () => {
    signedInAs("selection-manager");
    backendReplies({});

    await createHostAction(hostRequest);
    await updateHostAction(HOST, hostRequest);
    await setHostActiveAction(HOST, false);

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/session-hosts", { method: "POST", body: hostRequest });
    expect(apiRequest).toHaveBeenNthCalledWith(2, `/api/session-hosts/${HOST}`, { method: "PUT", body: hostRequest });
    expect(apiRequest).toHaveBeenNthCalledWith(3, `/api/session-hosts/${HOST}/active`, { method: "PUT", body: { isActive: false } });
  });
});

describe("who may call what", () => {
  it.each(MANAGEMENT_ONLY)("%s works for admin and manager", async (_name, call) => {
    backendReplies({});

    for (const role of ["selection-manager", "system-admin"]) {
      signedInAs(role);
      expect((await call()).ok).toBe(true);
    }
  });

  it.each(MANAGEMENT_ONLY)("%s is refused for officers and committee users, without calling the backend", async (_name, call) => {
    for (const role of ["selection-officer", "committee-user"]) {
      signedInAs(role);
      expect(await call()).toEqual({ ok: false, message: "You do not have permission to do this." });
    }
    expect(apiRequest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s works for admin, manager and officer", async (_name, call) => {
    backendReplies({});

    for (const role of ["system-admin", "selection-manager", "selection-officer"]) {
      signedInAs(role);
      expect((await call()).ok).toBe(true);
    }
  });

  it.each(OPERATIONS)("%s is refused for committee users and for someone not signed in", async (_name, call) => {
    signedInAs("committee-user");
    expect((await call()).ok).toBe(false);

    auth.mockResolvedValue(null);
    expect((await call()).ok).toBe(false);

    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("ids", () => {
  it("refuses a campaign or session id that is not a GUID, so it can never become part of another URL", async () => {
    signedInAs("selection-manager");

    const results = await Promise.all([
      createSessionAction("../../admin", request),
      updateSessionAction(CAMPAIGN, "../x", request),
      updateSessionAction("x", SESSION, request),
      cancelSessionAction(CAMPAIGN, "../x", "r"),
      setExpectedAction("x", SESSION, 1),
      recordAttendanceAction(CAMPAIGN, "x", 1, 1),
      updateHostAction("../hosts", hostRequest),
      setHostActiveAction("x", true),
    ]);

    expect(results.every((r) => !r.ok)).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("what comes back", () => {
  it("hands back the backend's messages under the inputs they belong to", async () => {
    signedInAs("selection-manager");
    backendRefuses(400, "Some fields need your attention.", { title: ["Enter a title."], endTime: ["The end must be after the start."] });

    const result = await createSessionAction(CAMPAIGN, request);

    expect(result).toEqual({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { title: "Enter a title.", endTime: "The end must be after the start." },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes a conflict's message through, with no field", async () => {
    signedInAs("selection-manager");
    backendRefuses(409, "Sokha Officer already runs another session at that time.");

    const result = await createSessionAction(CAMPAIGN, request);

    expect(result).toEqual({ ok: false, message: "Sokha Officer already runs another session at that time." });
  });

  it("says the server cannot be reached when it cannot", async () => {
    signedInAs("selection-manager");
    apiRequest.mockRejectedValue(new ApiUnavailableError());

    const result = await createSessionAction(CAMPAIGN, request);

    expect(result).toEqual({ ok: false, message: "We could not reach the server. Check your connection and try again." });
  });

  it("shows the permission message for a backend 403", async () => {
    signedInAs("selection-manager");
    backendRefuses(403, "Forbidden");

    expect(await recordAttendanceAction(CAMPAIGN, SESSION, 1, 1)).toEqual({ ok: false, message: "You do not have permission to do this." });
  });
});
