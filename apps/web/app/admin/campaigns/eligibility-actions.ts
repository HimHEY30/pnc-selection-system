"use server";

import { revalidatePath } from "next/cache";
import { callApi, isGuid, problemToFailure, requireRole } from "@/lib/api/action-helpers";
import type { ApiResult } from "@/lib/api/client";
import type { ActionResult } from "@/lib/campaigns/types";
import type { ExamSetup, RuleSetData, SampleCandidate, SaveRequest, SuggestedData, TestResult } from "@/lib/eligibility/types";
import { t } from "@/lib/messages";
import { canAccessAdminArea, canManageCampaigns } from "@/lib/permissions";

// The write side of Step 2. Saving and asking for suggestions are for admin and manager;
// running a test only reads, so anyone who can open the admin area may do it.

const badId: ActionResult<never> = { ok: false, message: t.errors.generic };

/** A subject's key goes into a URL path, so refuse anything that is not the shape the backend gives them. */
const SUBJECT_KEY = /^exam_[0-9a-f]{32}$/;

/** "draft" = Save draft, "complete" = Save and continue. */
export async function saveEligibilityAction(
  campaignId: string,
  mode: "draft" | "complete",
  request: SaveRequest,
): Promise<ActionResult<RuleSetData>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId)) return badId;

  const path = `/api/campaigns/${campaignId}/eligibility${mode === "draft" ? "/draft" : ""}`;
  const result = await callApi<RuleSetData>(path, "PUT", request);
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return problemToFailure(result.problem);

  // The step list and the setup overview show this step's status, so refresh them.
  revalidatePath("/admin", "layout");
  return { ok: true, data: result.data };
}

/** Runs a sample candidate against the rules on screen (saved or not). Changes nothing. */
export async function testEligibilityAction(
  campaignId: string,
  request: SaveRequest,
  candidate: SampleCandidate,
): Promise<ActionResult<TestResult>> {
  const denied = await requireRole(canAccessAdminArea);
  if (denied) return denied;
  if (!isGuid(campaignId)) return badId;

  const result = await callApi<TestResult>(`/api/campaigns/${campaignId}/eligibility/test`, "POST", {
    ruleSet: request,
    candidate,
  });
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return problemToFailure(result.problem);
  return { ok: true, data: result.data };
}

// Exam subjects (Math, Logic, English, ...) are saved at once, not with the rules. Each answers with the
// whole list and the catalogue it results in. A problem with the name comes back under the key "name".

/** Adds an exam subject to the campaign. */
export async function addSubjectAction(campaignId: string, name: string): Promise<ActionResult<ExamSetup>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId)) return badId;

  return subjectResult(await callApi<ExamSetup>(`/api/campaigns/${campaignId}/eligibility/exam-subjects`, "POST", { name }));
}

/** Renames an exam subject. Rules that use it keep working, because they hold its key. */
export async function renameSubjectAction(campaignId: string, subjectKey: string, name: string): Promise<ActionResult<ExamSetup>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId) || !SUBJECT_KEY.test(subjectKey)) return badId;

  return subjectResult(
    await callApi<ExamSetup>(`/api/campaigns/${campaignId}/eligibility/exam-subjects/${subjectKey}`, "PUT", { name }),
  );
}

/** Removes an exam subject that no saved rule uses. */
export async function removeSubjectAction(campaignId: string, subjectKey: string): Promise<ActionResult<ExamSetup>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId) || !SUBJECT_KEY.test(subjectKey)) return badId;

  return subjectResult(await callApi<ExamSetup>(`/api/campaigns/${campaignId}/eligibility/exam-subjects/${subjectKey}`, "DELETE"));
}

function subjectResult(result: ApiResult<ExamSetup> | null): ActionResult<ExamSetup> {
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return problemToFailure(result.problem);
  return { ok: true, data: result.data };
}

/** The starter rules for this campaign. Nothing is saved; the page adds them to its working copy. */
export async function loadSuggestedRulesAction(campaignId: string): Promise<ActionResult<SuggestedData>> {
  const denied = await requireRole(canManageCampaigns);
  if (denied) return denied;
  if (!isGuid(campaignId)) return badId;

  const result = await callApi<SuggestedData>(`/api/campaigns/${campaignId}/eligibility/suggested`, "GET");
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return problemToFailure(result.problem);
  return { ok: true, data: result.data };
}
