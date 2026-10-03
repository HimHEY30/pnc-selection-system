"use server";

import { revalidatePath } from "next/cache";
import { callApi, isGuid, problemToFailure, requireRole } from "@/lib/api/action-helpers";
import type { ApiResult } from "@/lib/api/client";
import type { ActionResult } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";
import { canAccessAdminArea, canManageCampaigns } from "@/lib/permissions";
import type { Host, HostRequest, InformationSession, SessionRequest } from "@/lib/sessions/types";

// The write side of Step 3. Creating, changing and cancelling a session, and keeping the alumni and
// partner directory, are for admin and manager; entering the expected number and the actual females and
// males is also open to officers. Each action re-checks the role (the backend checks again).

const badId: ActionResult<never> = { ok: false, message: t.errors.generic };

/** The pages that show sessions and Step 3's status are refreshed after a change. */
function refresh() {
  revalidatePath("/admin", "layout");
}

function outcome<T>(result: ApiResult<T> | null): ActionResult<T> {
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return problemToFailure(result.problem);
  refresh();
  return { ok: true, data: result.data };
}

const sessionsPath = (campaignId: string) => `/api/campaigns/${campaignId}/sessions`;

export async function createSessionAction(campaignId: string, request: SessionRequest): Promise<ActionResult<InformationSession>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId)) return badId;

  return outcome(await callApi<InformationSession>(sessionsPath(campaignId), "POST", request));
}

export async function updateSessionAction(
  campaignId: string,
  sessionId: string,
  request: SessionRequest,
): Promise<ActionResult<InformationSession>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId) || !isGuid(sessionId)) return badId;

  return outcome(await callApi<InformationSession>(`${sessionsPath(campaignId)}/${sessionId}`, "PUT", request));
}

/** Calls off a planned session. A reason is required. */
export async function cancelSessionAction(
  campaignId: string,
  sessionId: string,
  reason: string,
): Promise<ActionResult<InformationSession>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId) || !isGuid(sessionId)) return badId;

  return outcome(await callApi<InformationSession>(`${sessionsPath(campaignId)}/${sessionId}/cancel`, "POST", { reason }));
}

/** Sets how many candidates are expected; null clears it. Open to officers too. */
export async function setExpectedAction(
  campaignId: string,
  sessionId: string,
  expected: number | null,
): Promise<ActionResult<InformationSession>> {
  const denied = await requireRole(canAccessAdminArea);
  if (denied) return denied;
  if (!isGuid(campaignId) || !isGuid(sessionId)) return badId;

  return outcome(await callApi<InformationSession>(`${sessionsPath(campaignId)}/${sessionId}/expected`, "PUT", { expected }));
}

/** Records how many females and males came. Marks the session Done. Open to officers too. */
export async function recordAttendanceAction(
  campaignId: string,
  sessionId: string,
  female: number | null,
  male: number | null,
): Promise<ActionResult<InformationSession>> {
  const denied = await requireRole(canAccessAdminArea);
  if (denied) return denied;
  if (!isGuid(campaignId) || !isGuid(sessionId)) return badId;

  return outcome(await callApi<InformationSession>(`${sessionsPath(campaignId)}/${sessionId}/attendance`, "PUT", { female, male }));
}

// The alumni and partner directory.

export async function createHostAction(request: HostRequest): Promise<ActionResult<Host>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;

  return outcome(await callApi<Host>("/api/session-hosts", "POST", request));
}

export async function updateHostAction(hostId: string, request: HostRequest): Promise<ActionResult<Host>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(hostId)) return badId;

  return outcome(await callApi<Host>(`/api/session-hosts/${hostId}`, "PUT", request));
}

/** Switches a host off (no new session can choose it) or back on. Its past sessions keep it. */
export async function setHostActiveAction(hostId: string, isActive: boolean): Promise<ActionResult<Host>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(hostId)) return badId;

  return outcome(await callApi<Host>(`/api/session-hosts/${hostId}/active`, "PUT", { isActive }));
}
