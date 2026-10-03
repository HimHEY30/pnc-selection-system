import type { Group } from "@/auth";

// Who may do what in the admin area. Keep in step with the backend policies
// (OperationsTier and ManagementTier in Identity.Application); the backend is
// the authority, this only decides what the UI offers.

const ADMIN_AREA: readonly Group[] = ["system-admin", "selection-manager", "selection-officer"];
const CAMPAIGN_MANAGERS: readonly Group[] = ["system-admin", "selection-manager"];

/** Admin, manager and officer can open the admin area and read campaigns. */
export function canAccessAdminArea(roles: readonly string[]): boolean {
  return roles.some((role) => ADMIN_AREA.includes(role as Group));
}

/** Only admin and manager can create and edit campaigns. */
export function canManageCampaigns(roles: readonly string[]): boolean {
  return roles.some((role) => CAMPAIGN_MANAGERS.includes(role as Group));
}
