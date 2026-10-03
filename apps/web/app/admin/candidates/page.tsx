import { redirect } from "next/navigation";
import { loadCampaigns } from "@/lib/campaigns/api";
import { pickCurrentCampaign } from "@/lib/campaigns/pick";

// The sidebar's Candidates link names no campaign, so it opens the candidates of the one that is running (or, failing
// that, the newest). With no campaigns yet, the campaigns page is where to start.
export default async function CandidatesEntryPage() {
  const current = pickCurrentCampaign(await loadCampaigns());
  redirect(current ? `/admin/campaigns/${current.id}/candidates` : "/admin/campaigns");
}
