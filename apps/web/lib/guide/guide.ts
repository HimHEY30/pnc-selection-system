import { canManageCampaigns } from "@/lib/permissions";
import { t } from "@/lib/messages";

/** Name of the cookie that remembers this browser has been shown the tour. */
export const GUIDE_COOKIE = "pnc_guide_seen";

/**
 * Sent on `window` while the tour is open. On a phone the sidebar is a drawer that is off the screen until opened,
 * so the tour asks the shell to open it for steps that point at a sidebar link, and to close it afterwards.
 */
export const GUIDE_NAV_EVENT = "guide:nav";
export type GuideNavDetail = { open: boolean };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** A part of the admin shell the tour can point at: the value of its `data-guide` attribute. */
export type TourTarget = "switcher" | "nav-campaigns" | "nav-sessions" | "nav-guide" | "profile";

/** One stop of the tour. A step with no target is shown in the middle of the screen. */
export type TourStep = {
  target?: TourTarget;
  /** Which side of the target the card prefers. */
  side?: "top" | "bottom" | "left" | "right";
  title: string;
  body: string;
};

export type GuideStep = { title: string; body: string; points: readonly string[] };

/** The sections of the Guide page: admins and managers get the campaign guide, officers get the one for their work. */
export function guideFor(roles: readonly string[]): { audience: "manager" | "officer"; steps: readonly GuideStep[] } {
  return canManageCampaigns(roles) ? { audience: "manager", steps: t.guide.manager } : { audience: "officer", steps: t.guide.officer };
}

/** The welcome tour for a person's role. */
export function tourFor(roles: readonly string[]): readonly TourStep[] {
  return canManageCampaigns(roles) ? t.guide.tour.manager : t.guide.tour.officer;
}

/** The Set-Cookie value for "the tour has been seen": readable by the page, never sent anywhere but this site. */
export function seenCookie(): string {
  return `${GUIDE_COOKIE}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}
