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
import type { CandidateRequest } from "@/lib/candidates/types";
import { t } from "@/lib/messages";
import { createCandidateAction, deleteCandidateAction, updateCandidateAction } from "./candidates-actions";

const CAMPAIGN = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const CANDIDATE = "0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4d";

const request: CandidateRequest = {
  nameKm: "សុខ ចិន្តា",
  nameEn: "Sok Chenda",
  gender: "Female",
  dateOfBirth: "2009-05-20",
  phone: "012 345 678",
  address: {
    province: { code: "12", name: "Phnom Penh" },
    district: { code: "1201", name: "Chamkar Mon" },
    commune: { code: "120101", name: "Tonle Basak" },
    village: null,
  },
  schoolHostId: null,
  schoolName: "Bak Touk High School",
  sessionId: null,
  hasNgoSupport: false,
  ngoName: null,
  version: null,
};

const signedInAs = (...roles: string[]) => auth.mockResolvedValue({ roles });
const backendReplies = (data: unknown) => apiRequest.mockResolvedValue({ ok: true, data });
const backendRefuses = (status: number, title: string, fieldErrors?: Record<string, string[]>) =>
  apiRequest.mockResolvedValue({ ok: false, problem: { status, title, fieldErrors } });

beforeEach(() => {
  auth.mockReset();
  apiRequest.mockReset();
  revalidatePath.mockReset();
});

describe("createCandidateAction", () => {
  it.each([["system-admin"], ["selection-manager"], ["selection-officer"]])(
    "lets a %s add a candidate, sending the form as it is, and refreshes the pages",
    async (role) => {
      signedInAs(role);
      backendReplies({ id: CANDIDATE });

      const result = await createCandidateAction(CAMPAIGN, request);

      expect(result).toEqual({ ok: true, data: { id: CANDIDATE } });
      expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/candidates`, { method: "POST", body: request });
      expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
    },
  );

  it.each([["committee-user"], ["some-other-role"]])("refuses a %s without calling the backend", async (role) => {
    signedInAs(role);

    expect(await createCandidateAction(CAMPAIGN, request)).toEqual({ ok: false, message: t.errors.forbidden });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not signed in", async () => {
    auth.mockResolvedValue(null);

    expect(await createCandidateAction(CAMPAIGN, request)).toEqual({ ok: false, message: t.errors.forbidden });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("refuses a campaign id that is not a GUID, so nothing odd reaches the URL", async () => {
    signedInAs("selection-manager");

    expect(await createCandidateAction("../../admin", request)).toEqual({ ok: false, message: t.errors.generic });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("hands back the backend's message and its first message for each field", async () => {
    signedInAs("selection-officer");
    backendRefuses(400, "Some fields need your attention.", { nameEn: ["Use English letters.", "Second"], phone: ["Bad phone."] });

    expect(await createCandidateAction(CAMPAIGN, request)).toEqual({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { nameEn: "Use English letters.", phone: "Bad phone." },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes on a taken phone's message", async () => {
    signedInAs("selection-officer");
    backendRefuses(409, "This phone number already belongs to Vann Dara in this campaign.");

    const result = await createCandidateAction(CAMPAIGN, request);

    expect(result).toEqual({ ok: false, message: "This phone number already belongs to Vann Dara in this campaign." });
  });

  it("says so when the backend cannot be reached", async () => {
    signedInAs("selection-officer");
    apiRequest.mockRejectedValue(new ApiUnavailableError());

    expect(await createCandidateAction(CAMPAIGN, request)).toEqual({ ok: false, message: t.errors.unavailable });
  });
});

describe("updateCandidateAction", () => {
  it("puts the form, with its version, to the candidate", async () => {
    signedInAs("selection-officer");
    backendReplies({ id: CANDIDATE, version: 8 });

    const result = await updateCandidateAction(CAMPAIGN, CANDIDATE, { ...request, version: 7 });

    expect(result.ok).toBe(true);
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/candidates/${CANDIDATE}`, {
      method: "PUT",
      body: { ...request, version: 7 },
    });
  });

  it("passes on a concurrent edit's message", async () => {
    signedInAs("selection-manager");
    backendRefuses(409, "Someone else changed this. Reload the page and try again.");

    expect(await updateCandidateAction(CAMPAIGN, CANDIDATE, { ...request, version: 1 })).toEqual({
      ok: false,
      message: "Someone else changed this. Reload the page and try again.",
    });
  });

  it("refuses a committee user and bad ids", async () => {
    signedInAs("committee-user");
    expect(await updateCandidateAction(CAMPAIGN, CANDIDATE, request)).toEqual({ ok: false, message: t.errors.forbidden });

    signedInAs("selection-manager");
    expect(await updateCandidateAction(CAMPAIGN, "nope", request)).toEqual({ ok: false, message: t.errors.generic });
    expect(await updateCandidateAction("nope", CANDIDATE, request)).toEqual({ ok: false, message: t.errors.generic });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("deleteCandidateAction", () => {
  it.each([["system-admin"], ["selection-manager"]])("lets a %s delete, and refreshes the pages", async (role) => {
    signedInAs(role);
    backendReplies(undefined);

    const result = await deleteCandidateAction(CAMPAIGN, CANDIDATE);

    expect(result).toEqual({ ok: true, data: null });
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN}/candidates/${CANDIDATE}`, { method: "DELETE", body: undefined });
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("refuses an officer without calling the backend", async () => {
    signedInAs("selection-officer");

    expect(await deleteCandidateAction(CAMPAIGN, CANDIDATE)).toEqual({ ok: false, message: t.errors.forbidden });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("passes on a refusal, such as a closed campaign", async () => {
    signedInAs("selection-manager");
    backendRefuses(409, "This campaign is closed, so its candidates can no longer be changed.");

    expect(await deleteCandidateAction(CAMPAIGN, CANDIDATE)).toEqual({
      ok: false,
      message: "This campaign is closed, so its candidates can no longer be changed.",
    });
  });
});
