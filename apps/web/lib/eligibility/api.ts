import "server-only";
import { apiRequest, ApiError } from "@/lib/api/client";
import type { Catalogue, RuleSetData } from "./types";

// Read-side calls used by server components. Writes and the test panel go through the server
// actions (app/admin/campaigns/eligibility-actions.ts), which report field errors back.

/** The fields a rule can check, with the operators and options each allows. */
export async function loadCatalogue(): Promise<Catalogue> {
  const result = await apiRequest<Catalogue>("/api/eligibility/catalogue");
  if (!result.ok) throw new ApiError(result.problem);
  return result.data;
}

/** A campaign's rules, or null when the campaign does not exist (so the page can say "not found"). */
export async function loadEligibility(campaignId: string): Promise<RuleSetData | null> {
  const result = await apiRequest<RuleSetData>(`/api/campaigns/${encodeURIComponent(campaignId)}/eligibility`);
  if (result.ok) return result.data;
  if (result.problem.status === 404) return null;
  throw new ApiError(result.problem);
}
