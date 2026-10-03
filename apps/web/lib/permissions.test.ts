import { describe, expect, it } from "vitest";
import { canAccessAdminArea, canManageCampaigns } from "./permissions";

describe("permissions", () => {
  it.each(["system-admin", "selection-manager", "selection-officer"])("%s can open the admin area", (role) => {
    expect(canAccessAdminArea([role])).toBe(true);
  });

  it("keeps committee members and role-less users out of the admin area", () => {
    expect(canAccessAdminArea(["committee-user"])).toBe(false);
    expect(canAccessAdminArea([])).toBe(false);
  });

  it.each(["system-admin", "selection-manager"])("%s can create and edit campaigns", (role) => {
    expect(canManageCampaigns([role])).toBe(true);
  });

  it("lets an officer look but not create or edit", () => {
    expect(canManageCampaigns(["selection-officer"])).toBe(false);
    expect(canManageCampaigns(["committee-user"])).toBe(false);
    expect(canManageCampaigns([])).toBe(false);
  });

  it("allows a user who holds several roles if any one is enough", () => {
    expect(canManageCampaigns(["selection-officer", "selection-manager"])).toBe(true);
  });
});
