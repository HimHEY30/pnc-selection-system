import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignSummary } from "@/lib/campaigns/types";

const loadCampaigns = vi.fn<() => Promise<CampaignSummary[]>>();
vi.mock("@/lib/campaigns/api", () => ({ loadCampaigns: () => loadCampaigns() }));

const redirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import CandidatesEntryPage from "./page";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const campaign = (id: string, status: CampaignSummary["status"], createdAt: string): CampaignSummary => ({
  id,
  name: "Selection",
  academicYear: "2027–2028",
  status,
  createdAt,
});

beforeEach(() => {
  loadCampaigns.mockReset();
  redirect.mockClear();
});

describe("the sidebar's Candidates link", () => {
  it("opens the candidates of the running campaign", async () => {
    loadCampaigns.mockResolvedValue([campaign("other", "Draft", "2027-05-01T00:00:00Z"), campaign(ID, "Active", "2027-01-01T00:00:00Z")]);

    await expect(CandidatesEntryPage()).rejects.toThrow(`redirect:/admin/campaigns/${ID}/candidates`);
  });

  it("sends a person with no campaigns to the campaigns page, where one is made", async () => {
    loadCampaigns.mockResolvedValue([]);

    await expect(CandidatesEntryPage()).rejects.toThrow("redirect:/admin/campaigns");
  });
});
