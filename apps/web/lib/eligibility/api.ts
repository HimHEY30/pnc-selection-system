import "server-only";
import { apiRequest, ApiError } from "@/lib/api/client";
import type { ExamSetup, RuleSetData } from "./types";

// Read-side calls used by server components. Writes and the test panel go through the server
// actions (app/admin/campaigns/eligibility-actions.ts), which report field errors back.

/**
 * A campaign's exam subjects and the fields its rules can check (the shared fields, the subjects, and the
 * total and average), or null when the campaign does not exist. A draft campaign opened for the first time
 * gets Math, Logic and English.
 */
export async function loadExamSetup(campaignId: string): Promise<ExamSetup | null> {
  const result = await apiRequest<ExamSetup>(`/api/campaigns/${encodeURIComponent(campaignId)}/eligibility/exam-subjects`);
  if (result.ok) return result.data;
  if (result.problem.status === 404) return null;
  throw new ApiError(result.problem);
}

/** A campaign's rules, or null when the campaign does not exist (so the page can say "not found"). */
export async function loadEligibility(campaignId: string): Promise<RuleSetData | null> {
  const result = await apiRequest<RuleSetData>(`/api/campaigns/${encodeURIComponent(campaignId)}/eligibility`);
  if (result.ok) return result.data;
  if (result.problem.status === 404) return null;
  throw new ApiError(result.problem);
}
