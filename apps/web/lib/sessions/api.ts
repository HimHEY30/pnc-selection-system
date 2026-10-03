import "server-only";
import { apiRequest, ApiError } from "@/lib/api/client";
import type { AssignableStaff, Host, MySession, SessionList } from "./types";

// Read-side calls used by server components. Writes go through the server actions
// (app/admin/campaigns/sessions-actions.ts), which report field errors back to the forms.

/** A campaign's sessions, or null when the campaign does not exist (so the page can say "not found"). */
export async function loadSessionList(campaignId: string): Promise<SessionList | null> {
  const result = await apiRequest<SessionList>(`/api/campaigns/${encodeURIComponent(campaignId)}/sessions`);
  if (result.ok) return result.data;
  if (result.problem.status === 404) return null;
  throw new ApiError(result.problem);
}

/** The alumni and partners that can run a session. Switched-off ones only when asked for. */
export async function loadHosts(includeInactive = false): Promise<Host[]> {
  const result = await apiRequest<Host[]>(`/api/session-hosts${includeInactive ? "?includeInactive=true" : ""}`);
  if (result.ok) return result.data;
  throw new ApiError(result.problem);
}

/** The caller and the staff a session can be assigned to. Admin and manager only; never fails because Keycloak is down. */
export async function loadAssignable(): Promise<AssignableStaff> {
  const result = await apiRequest<AssignableStaff>("/api/staff/assignable");
  if (result.ok) return result.data;
  throw new ApiError(result.problem);
}

/** The sessions the caller is responsible for or runs, in every campaign, soonest first. */
export async function loadMySessions(): Promise<MySession[]> {
  const result = await apiRequest<MySession[]>("/api/sessions/mine");
  if (result.ok) return result.data;
  throw new ApiError(result.problem);
}
