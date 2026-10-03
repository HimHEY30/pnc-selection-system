"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import CampaignSwitcher from "@/app/admin/campaigns/_components/CampaignSwitcher";
import { CreateCampaignProvider } from "@/app/admin/campaigns/_components/CreateCampaignProvider";
import type { CampaignSummary } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";
import { NAV_GROUPS } from "./nav";
import ProfileMenu from "./ProfileMenu";

type Props = {
  user: { name: string; email?: string | null; roles: string[] };
  signOutAction: () => Promise<void>;
  /** null = the list could not be loaded. */
  campaigns: CampaignSummary[] | null;
  /** Admin or manager. Officers can look but not create. */
  canCreate: boolean;
  children: ReactNode;
};

// App shell: full-height sidebar (brand + nav) on the left, top bar with the
// campaign switcher and profile, scrollable content on the right.
//  - Desktop (lg+): sidebar is fixed on the left.
//  - Mobile: sidebar is an off-canvas drawer opened from the top bar.
export default function AdminShell({ user, signOutAction, campaigns, canCreate, children }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Escape closes the mobile drawer.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CreateCampaignProvider canCreate={canCreate} copySources={campaigns ?? []}>
      <div className="min-h-screen bg-canvas font-sans text-ink">
        {/* Skips the sidebar for keyboard users. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {t.common.skipToContent}
        </a>

        {/* Backdrop behind the mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        )}

        {/* ---------- Sidebar ---------- */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Link href="/admin" className="flex items-center gap-3 px-4 py-5 focus-ring">
            <Image src="/icon.png" alt="PNC" width={30} height={30} className="shrink-0 rounded-lg" />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-tight">{t.brand.product}</span>
              <span className="block text-xs leading-snug text-ink-muted">{t.brand.organisation}</span>
            </span>
          </Link>

          <nav aria-label={t.nav.label} className="flex-1 overflow-y-auto px-4 pb-4">
            {NAV_GROUPS.map((group, i) => (
              <div key={group.title ?? i} className={i > 0 ? "mt-6" : "mt-1"}>
                {group.title && (
                  <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{group.title}</p>
                )}
                <ul className="space-y-1">
                  {group.items.map(({ href, label, icon, disabled }) => {
                    const active = !disabled && (href === "/admin" ? pathname === href : pathname.startsWith(href));
                    const base = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium";
                    return (
                      <li key={href}>
                        {disabled ? (
                          <span aria-disabled="true" title={t.nav.lockedHint} className={`${base} cursor-not-allowed text-ink-muted/70`}>
                            {icon}
                            {label}
                          </span>
                        ) : (
                          <Link
                            href={href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setDrawerOpen(false)}
                            className={`${base} transition focus-ring ${
                              active
                                ? "bg-primary-soft font-semibold text-primary shadow-[inset_3px_0_0_var(--color-brand-blue)]"
                                : "text-ink-muted hover:bg-canvas hover:text-ink"
                            }`}
                          >
                            {icon}
                            {label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* ---------- Top bar + content ---------- */}
        <div className="flex min-h-screen min-w-0 flex-col lg:pl-60">
          <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label={t.nav.toggle}
              aria-expanded={drawerOpen}
              className="-ml-1 rounded-lg p-2.5 text-ink-muted transition hover:bg-canvas focus-ring lg:hidden"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <CampaignSwitcher campaigns={campaigns} />

            <div className="ml-auto">
              <ProfileMenu {...user} signOutAction={signOutAction} />
            </div>
          </header>

          <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none sm:p-8">
            {children}
          </main>
        </div>
      </div>
    </CreateCampaignProvider>
  );
}
