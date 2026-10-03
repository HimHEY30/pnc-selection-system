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
import type { CreateCampaignInput } from "@/lib/campaigns/types";
import { createCampaignAction, loadCopyPreviewAction } from "./actions";

const SOURCE = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const scratch: CreateCampaignInput = { name: "Selection 2028", academicYear: "2028–2029", description: "", startMode: "scratch" };
const copy: CreateCampaignInput = {
  ...scratch,
  startMode: "copy",
  copyFrom: { sourceCampaignId: SOURCE, parts: ["Provinces", "EligibilityRules"] },
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

describe("createCampaignAction", () => {
  it("sends a copy with its source and parts, and gives back how each part went", async () => {
    signedInAs("selection-manager");
    const copyResults = [
      { part: "Provinces", outcome: "Copied", count: 4, issues: [] },
      { part: "EligibilityRules", outcome: "Partly", count: 3, issues: ["1 rule(s) name provinces this campaign does not target yet."] },
    ];
    backendReplies({ id: "new-1", copyResults });

    const result = await createCampaignAction(copy);

    expect(apiRequest).toHaveBeenCalledWith("/api/campaigns", { method: "POST", body: copy });
    expect(result).toEqual({ ok: true, data: { id: "new-1", copyResults } });
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("gives null results for a campaign started from scratch, and never sends a copyFrom with it", async () => {
    signedInAs("system-admin");
    backendReplies({ id: "new-2" });

    const result = await createCampaignAction({ ...scratch, copyFrom: copy.copyFrom });

    expect(result).toEqual({ ok: true, data: { id: "new-2", copyResults: null } });
    expect(JSON.parse(JSON.stringify(apiRequest.mock.calls[0][1].body))).not.toHaveProperty("copyFrom");
  });

  it("refuses a copy with no source, or one that is not an id, without asking the backend", async () => {
    signedInAs("selection-manager");

    const none = await createCampaignAction({ ...scratch, startMode: "copy" });
    const bad = await createCampaignAction({ ...copy, copyFrom: { sourceCampaignId: "../../etc", parts: ["Provinces"] } });

    expect(none.ok).toBe(false);
    expect(bad.ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows the server's message under the copy source and the parts", async () => {
    signedInAs("selection-manager");
    backendRefuses(400, "Some fields need your attention.", {
      "copyFrom.sourceCampaignId": ["The campaign to copy from no longer exists."],
      "copyFrom.parts": ["Choose at least one thing to copy."],
    });

    const result = await createCampaignAction(copy);

    expect(result).toEqual({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: {
        "copyFrom.sourceCampaignId": "The campaign to copy from no longer exists.",
        "copyFrom.parts": "Choose at least one thing to copy.",
      },
    });
  });

  it("is for admin and manager only", async () => {
    signedInAs("selection-officer");

    const result = await createCampaignAction(copy);

    expect(result.ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("loadCopyPreviewAction", () => {
  it("returns what the source campaign has", async () => {
    signedInAs("selection-manager");
    const preview = { sourceCampaignId: SOURCE, name: "Selection 2027", academicYear: "2027–2028", parts: [] };
    backendReplies(preview);

    const result = await loadCopyPreviewAction(SOURCE);

    expect(apiRequest).toHaveBeenCalledWith(`/api/campaigns/${SOURCE}/copy-preview`, { method: "GET" });
    expect(result).toEqual({ ok: true, data: preview });
  });

  it("is for admin and manager only, and refuses an id that is not a GUID", async () => {
    signedInAs("selection-officer");
    expect((await loadCopyPreviewAction(SOURCE)).ok).toBe(false);

    signedInAs("selection-manager");
    expect((await loadCopyPreviewAction("not-an-id")).ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("says so when the campaign is gone, and when the backend cannot be reached", async () => {
    signedInAs("selection-manager");
    backendRefuses(404, "This campaign does not exist.");
    expect(await loadCopyPreviewAction(SOURCE)).toEqual({ ok: false, message: "This campaign does not exist." });

    apiRequest.mockRejectedValue(new ApiUnavailableError());
    const unreachable = await loadCopyPreviewAction(SOURCE);
    expect(unreachable.ok).toBe(false);
  });
});
