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
import type { SaveRequest } from "@/lib/eligibility/types";
import { loadSuggestedRulesAction, saveEligibilityAction, testEligibilityAction } from "./eligibility-actions";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const request: SaveRequest = { ageReferenceDate: "2026-11-02", groups: [], version: 3 };

const signedInAs = (...roles: string[]) => auth.mockResolvedValue({ roles });
const backendReplies = (data: unknown) => apiRequest.mockResolvedValue({ ok: true, data });
const backendRefuses = (status: number, title: string, fieldErrors?: Record<string, string[]>) =>
  apiRequest.mockResolvedValue({ ok: false, problem: { status, title, fieldErrors } });

beforeEach(() => {
  auth.mockReset();
  apiRequest.mockReset();
  revalidatePath.mockReset();
});

describe("saveEligibilityAction", () => {
  it.each([["selection-manager"], ["system-admin"]])("lets a %s save, and refreshes the pages that show the step", async (role) => {
    signedInAs(role);
    backendReplies({ version: 4 });

    const result = await saveEligibilityAction(ID, "draft", request);

    expect(result).toEqual({ ok: true, data: { version: 4 } });
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("saves a draft to the draft endpoint and a finished step to the other, sending the rules as they are", async () => {
    signedInAs("selection-manager");
    backendReplies({});

    await saveEligibilityAction(ID, "draft", request);
    await saveEligibilityAction(ID, "complete", request);

    expect(apiRequest).toHaveBeenNthCalledWith(1, `/api/campaigns/${ID}/eligibility/draft`, { method: "PUT", body: request });
    expect(apiRequest).toHaveBeenNthCalledWith(2, `/api/campaigns/${ID}/eligibility`, { method: "PUT", body: request });
  });

  it.each([["selection-officer"], ["committee-user"]])("refuses a %s without calling the backend", async (role) => {
    signedInAs(role);

    const result = await saveEligibilityAction(ID, "draft", request);

    expect(result).toEqual({ ok: false, message: "You do not have permission to do this." });
    expect(apiRequest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses someone who is not signed in", async () => {
    auth.mockResolvedValue(null);

    expect((await saveEligibilityAction(ID, "draft", request)).ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a GUID, so it can never become part of another URL", async () => {
    signedInAs("selection-manager");

    const result = await saveEligibilityAction("../../admin", "draft", request);

    expect(result.ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("hands back the backend's messages under the inputs they belong to", async () => {
    signedInAs("selection-manager");
    backendRefuses(400, "Some rules need your attention.", {
      "rules.r1.values": ["Enter a number.", "second message"],
      "rules.r2": ["The same rule already exists in this group."],
      rules: ["Add at least one active mandatory rule."],
    });

    const result = await saveEligibilityAction(ID, "complete", request);

    expect(result).toEqual({
      ok: false,
      message: "Some rules need your attention.",
      fieldErrors: {
        "rules.r1.values": "Enter a number.",
        "rules.r2": "The same rule already exists in this group.",
        rules: "Add at least one active mandatory rule.",
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes a conflict on as a message with no field errors", async () => {
    signedInAs("selection-manager");
    backendRefuses(409, "Someone else changed these rules. Reload the page and try again.");

    const result = await saveEligibilityAction(ID, "draft", request);

    expect(result).toEqual({ ok: false, message: "Someone else changed these rules. Reload the page and try again." });
  });

  it("turns a 403 from the backend into the permission message", async () => {
    signedInAs("selection-manager");
    backendRefuses(403, "Forbidden");

    expect(await saveEligibilityAction(ID, "draft", request)).toEqual({ ok: false, message: "You do not have permission to do this." });
  });

  it("says so when the backend cannot be reached", async () => {
    signedInAs("selection-manager");
    apiRequest.mockRejectedValue(new ApiUnavailableError());

    const result = await saveEligibilityAction(ID, "draft", request);

    expect(result).toEqual({ ok: false, message: "We could not reach the server. Check your connection and try again." });
  });

  it("lets other failures surface instead of hiding them", async () => {
    signedInAs("selection-manager");
    apiRequest.mockRejectedValue(new Error("boom"));

    await expect(saveEligibilityAction(ID, "draft", request)).rejects.toThrow("boom");
  });
});

describe("testEligibilityAction", () => {
  const candidate = { gender: "female", date_of_birth: "2006-06-01" };

  it.each([["selection-officer"], ["selection-manager"], ["system-admin"]])("lets a %s run a test", async (role) => {
    signedInAs(role);
    backendReplies({ eligible: true });

    const result = await testEligibilityAction(ID, request, candidate);

    expect(result).toEqual({ ok: true, data: { eligible: true } });
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${ID}/eligibility/test`, {
      method: "POST",
      body: { ruleSet: request, candidate },
    });
  });

  it("changes nothing: it does not refresh any page", async () => {
    signedInAs("selection-officer");
    backendReplies({});

    await testEligibilityAction(ID, request, candidate);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a committee member", async () => {
    signedInAs("committee-user");

    expect((await testEligibilityAction(ID, request, candidate)).ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("refuses a bad id", async () => {
    signedInAs("selection-manager");

    expect((await testEligibilityAction("nope", request, candidate)).ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("hands back problems with the rules, keyed to their inputs", async () => {
    signedInAs("selection-manager");
    backendRefuses(400, "Some rules need your attention.", { "rules.r1.values": ["Enter a number."] });

    const result = await testEligibilityAction(ID, request, candidate);

    expect(result).toMatchObject({ ok: false, fieldErrors: { "rules.r1.values": "Enter a number." } });
  });

  it("says so when the backend cannot be reached", async () => {
    signedInAs("selection-manager");
    apiRequest.mockRejectedValue(new ApiUnavailableError());

    expect(await testEligibilityAction(ID, request, candidate)).toEqual({
      ok: false,
      message: "We could not reach the server. Check your connection and try again.",
    });
  });
});

describe("loadSuggestedRulesAction", () => {
  it("returns the starter rules to a manager, and saves nothing", async () => {
    signedInAs("selection-manager");
    backendReplies({ ageReferenceDate: "2026-11-02", groups: [] });

    const result = await loadSuggestedRulesAction(ID);

    expect(result).toEqual({ ok: true, data: { ageReferenceDate: "2026-11-02", groups: [] } });
    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${ID}/eligibility/suggested`, { method: "GET", body: undefined });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is for people who can edit, not for an officer", async () => {
    signedInAs("selection-officer");

    expect((await loadSuggestedRulesAction(ID)).ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("refuses a bad id, and reports a backend failure", async () => {
    signedInAs("selection-manager");
    expect((await loadSuggestedRulesAction("nope")).ok).toBe(false);

    backendRefuses(404, "This campaign does not exist.");
    expect(await loadSuggestedRulesAction(ID)).toEqual({ ok: false, message: "This campaign does not exist." });
  });
});
