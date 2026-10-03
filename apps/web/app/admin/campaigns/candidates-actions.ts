"use server";

import { revalidatePath } from "next/cache";
import { callApi, isGuid, problemToFailure, requireRole } from "@/lib/api/action-helpers";
import type { ApiResult } from "@/lib/api/client";
import type { ActionResult } from "@/lib/campaigns/types";
import type { Candidate, CandidateRequest } from "@/lib/candidates/types";
import { t } from "@/lib/messages";
import { canAccessAdminArea, canManageCampaigns } from "@/lib/permissions";

// The write side of Step 4. Admin, manager and officer add and change candidates; only admin and manager
// delete them. Each action re-checks the role (the backend checks again).

const badId: ActionResult<never> = { ok: false, message: t.errors.generic };

function outcome<T>(result: ApiResult<T> | null): ActionResult<T> {
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return problemToFailure(result.problem);
  revalidatePath("/admin", "layout");
  return { ok: true, data: result.data };
}

const candidatesPath = (campaignId: string) => `/api/campaigns/${campaignId}/candidates`;

export async function createCandidateAction(campaignId: string, request: CandidateRequest): Promise<ActionResult<Candidate>> {
  const denied = await requireRole(canAccessAdminArea);
  if (denied) return denied;
  if (!isGuid(campaignId)) return badId;

  return outcome(await callApi<Candidate>(candidatesPath(campaignId), "POST", request));
}

/** Changes a candidate. The request carries the version the person was looking at. */
export async function updateCandidateAction(
  campaignId: string,
  candidateId: string,
  request: CandidateRequest,
): Promise<ActionResult<Candidate>> {
  const denied = await requireRole(canAccessAdminArea);
  if (denied) return denied;
  if (!isGuid(campaignId) || !isGuid(candidateId)) return badId;

  return outcome(await callApi<Candidate>(`${candidatesPath(campaignId)}/${candidateId}`, "PUT", request));
}

/** Deletes a candidate for good. Admin and manager only. */
export async function deleteCandidateAction(campaignId: string, candidateId: string): Promise<ActionResult<null>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId) || !isGuid(candidateId)) return badId;

  const result = outcome(await callApi<void>(`${candidatesPath(campaignId)}/${candidateId}`, "DELETE"));
  return result.ok ? { ok: true, data: null } : result;
}
