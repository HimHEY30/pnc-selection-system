import "server-only";
import { apiRequest, ApiError, type ApiProblem } from "@/lib/api/client";
import { PAGE_SIZE, type CandidateFilters, type CandidateList, type SchoolChoice, type SessionChoice } from "./types";

// Read-side calls used by server components. Writes go through the server actions
// (app/admin/campaigns/candidates-actions.ts), which report field errors back to the form.

/** The query string for the list: only what was asked for, so a bookmarked page stays tidy. */
export function listQuery(filters: CandidateFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.province) params.set("province", filters.province);
  if (filters.sessionId) params.set("sessionId", filters.sessionId);
  if (filters.ngo) params.set("ngo", filters.ngo === "yes" ? "true" : "false");
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  params.set("pageSize", String(PAGE_SIZE));
  return params.toString();
}

/** The code the backend gives when the campaign itself does not exist (Campaigns.Domain.CampaignErrors.NotFound). */
const CAMPAIGN_NOT_FOUND = "campaign.not_found";

/**
 * True only for "this campaign does not exist". A plain 404 can also mean the route is missing (a backend that is older
 * than this page), which must not be shown as a missing campaign: that sends people looking for the wrong problem.
 */
const campaignIsMissing = (problem: ApiProblem): boolean => problem.status === 404 && problem.code === CAMPAIGN_NOT_FOUND;

/** One page of a campaign's candidates, or null when the campaign does not exist (so the page can say "not found"). */
export async function loadCandidateList(campaignId: string, filters: CandidateFilters): Promise<CandidateList | null> {
  const result = await apiRequest<CandidateList>(`/api/campaigns/${encodeURIComponent(campaignId)}/candidates?${listQuery(filters)}`);
  if (result.ok) return result.data;
  if (campaignIsMissing(result.problem)) return null;
  throw new ApiError(result.problem);
}

/** The campaign's sessions that a candidate can be said to have come to. Empty when the campaign does not exist. */
export async function loadSessionChoices(campaignId: string): Promise<SessionChoice[]> {
  const result = await apiRequest<SessionChoice[]>(`/api/campaigns/${encodeURIComponent(campaignId)}/candidates/session-choices`);
  if (result.ok) return result.data;
  if (campaignIsMissing(result.problem)) return [];
  throw new ApiError(result.problem);
}

/** The high schools in the partner directory that are switched on. */
export async function loadSchools(): Promise<SchoolChoice[]> {
  const result = await apiRequest<SchoolChoice[]>("/api/candidate-schools");
  if (result.ok) return result.data;
  throw new ApiError(result.problem);
}
