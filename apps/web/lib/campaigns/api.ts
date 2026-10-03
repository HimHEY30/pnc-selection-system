import "server-only";
import { apiRequest, ApiError, ApiUnavailableError } from "@/lib/api/client";
import type { CampaignDetail, CampaignSummary, Province } from "./types";

// Read-side calls used by server components. Write-side calls live in the server
// actions (app/admin/campaigns/actions.ts), which need to report field errors back.

/** All campaigns, newest first. */
export async function loadCampaigns(): Promise<CampaignSummary[]> {
  const result = await apiRequest<CampaignSummary[]>("/api/campaigns");
  if (!result.ok) throw new ApiError(result.problem);
  return result.data;
}

/**
 * Like loadCampaigns, but returns null instead of throwing when the backend is down or
 * answers with an error, for chrome (the top bar) that must keep rendering. Anything
 * else is rethrown - including the redirect that sends a signed-out user to /login.
 */
export async function loadCampaignsOrNull(): Promise<CampaignSummary[] | null> {
  try {
    return await loadCampaigns();
  } catch (error) {
    if (error instanceof ApiUnavailableError || error instanceof ApiError) {
      console.error("Could not load the campaign list", error);
      return null;
    }
    throw error;
  }
}

/** One campaign, or null when it does not exist (so the page can show "not found"). */
export async function loadCampaign(id: string): Promise<CampaignDetail | null> {
  const result = await apiRequest<CampaignDetail>(`/api/campaigns/${encodeURIComponent(id)}`);
  if (result.ok) return result.data;
  if (result.problem.status === 404) return null;
  throw new ApiError(result.problem);
}

/** Cambodia's 25 provinces, A to Z. */
export async function loadProvinces(): Promise<Province[]> {
  const result = await apiRequest<Province[]>("/api/provinces");
  if (!result.ok) throw new ApiError(result.problem);
  return result.data;
}
