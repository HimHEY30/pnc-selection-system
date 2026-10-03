import type { CampaignSummary } from "./types";

/**
 * The campaign a link that names none (the sidebar's Candidates) should open: the one that is running, and if several are,
 * the newest of them; with none running, the newest campaign of any kind. Null when there are no campaigns.
 */
export function pickCurrentCampaign(campaigns: readonly CampaignSummary[]): CampaignSummary | null {
  const newestFirst = [...campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return newestFirst.find((c) => c.status === "Active") ?? newestFirst[0] ?? null;
}
