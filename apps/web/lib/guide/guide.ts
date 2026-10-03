import { canManageCampaigns } from "@/lib/permissions";
import { t } from "@/lib/messages";

/** Name of the cookie that remembers this browser has been shown the tour. */
export const GUIDE_COOKIE = "pnc_guide_seen";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type GuideStep = { title: string; body: string; points: readonly string[] };

/** Admins and managers get the campaign guide, officers get the one for what they can do. */
export function guideFor(roles: readonly string[]): { audience: "manager" | "officer"; steps: readonly GuideStep[] } {
  return canManageCampaigns(roles) ? { audience: "manager", steps: t.guide.manager } : { audience: "officer", steps: t.guide.officer };
}

/** The Set-Cookie value for "the tour has been seen": readable by the page, never sent anywhere but this site. */
export function seenCookie(): string {
  return `${GUIDE_COOKIE}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}
