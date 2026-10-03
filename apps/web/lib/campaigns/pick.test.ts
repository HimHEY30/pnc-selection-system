import { describe, expect, it } from "vitest";
import { pickCurrentCampaign } from "./pick";
import type { CampaignStatus, CampaignSummary } from "./types";

const campaign = (id: string, status: CampaignStatus, createdAt: string): CampaignSummary => ({
  id,
  name: `Selection ${id}`,
  academicYear: "2027–2028",
  status,
  createdAt,
});

describe("pickCurrentCampaign", () => {
  it("is null when there are no campaigns", () => {
    expect(pickCurrentCampaign([])).toBeNull();
  });

  it("prefers the running campaign over a newer draft", () => {
    const picked = pickCurrentCampaign([
      campaign("draft-new", "Draft", "2027-03-05T00:00:00Z"),
      campaign("active", "Active", "2027-01-01T00:00:00Z"),
      campaign("closed", "Closed", "2026-01-01T00:00:00Z"),
    ]);

    expect(picked?.id).toBe("active");
  });

  it("takes the newest when several are running", () => {
    const picked = pickCurrentCampaign([
      campaign("older", "Active", "2027-01-01T00:00:00Z"),
      campaign("newer", "Active", "2027-02-01T00:00:00Z"),
    ]);

    expect(picked?.id).toBe("newer");
  });

  it("takes the newest campaign of any kind when none is running", () => {
    const picked = pickCurrentCampaign([
      campaign("closed", "Closed", "2026-01-01T00:00:00Z"),
      campaign("draft", "Draft", "2027-03-05T00:00:00Z"),
    ]);

    expect(picked?.id).toBe("draft");
  });

  it("does not depend on the order it is given, and does not change it", () => {
    const list = [campaign("a", "Closed", "2026-01-01T00:00:00Z"), campaign("b", "Closed", "2027-01-01T00:00:00Z")];
    const before = list.map((c) => c.id);

    expect(pickCurrentCampaign(list)?.id).toBe("b");
    expect(pickCurrentCampaign([...list].reverse())?.id).toBe("b");
    expect(list.map((c) => c.id)).toEqual(before);
  });
});
