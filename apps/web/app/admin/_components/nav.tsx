import type { ReactNode } from "react";
import type { TourTarget } from "@/lib/guide/guide";
import { t } from "@/lib/messages";

// Single source of truth for the sidebar. Adding a section means adding one entry here.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Locked until a campaign has been set up. Shown, but not a link. */
  disabled?: boolean;
  /** Lets the welcome tour point at this link. */
  guide?: TourTarget;
};

export const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      {
        href: "/admin",
        label: t.nav.dashboard,
        icon: (
          <Icon>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </Icon>
        ),
      },
      {
        href: "/admin/campaigns",
        label: t.nav.campaigns,
        guide: "nav-campaigns",
        icon: (
          <Icon>
            <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
          </Icon>
        ),
      },
      {
        href: "/admin/sessions",
        label: t.nav.sessions,
        guide: "nav-sessions",
        icon: (
          <Icon>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </Icon>
        ),
      },
    ],
  },
  {
    title: t.nav.afterSetup,
    items: [
      {
        href: "/admin/candidates",
        label: t.nav.candidates,
        disabled: true,
        icon: (
          <Icon>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
            <path d="M16 4.5a3.5 3.5 0 010 7M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
          </Icon>
        ),
      },
      {
        href: "/admin/exam",
        label: t.nav.exam,
        disabled: true,
        icon: (
          <Icon>
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M9 12l2 2 4-4" />
          </Icon>
        ),
      },
    ],
  },
  {
    title: t.guide.navGroup,
    items: [
      {
        href: "/admin/guide",
        label: t.guide.nav,
        guide: "nav-guide",
        icon: (
          <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 3.8M12 17h.01" />
          </Icon>
        ),
      },
    ],
  },
];
