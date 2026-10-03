import { redirect } from "next/navigation";
import { loadCampaigns } from "@/lib/campaigns/api";

// "Campaigns" in the sidebar. There is no separate campaigns list: the top-bar switcher
// is the list. So this opens the newest campaign, or the empty dashboard if there is none.
export default async function CampaignsIndexPage() {
  const campaigns = await loadCampaigns();
  redirect(campaigns.length > 0 ? `/admin/campaigns/${campaigns[0].id}` : "/admin");
}
