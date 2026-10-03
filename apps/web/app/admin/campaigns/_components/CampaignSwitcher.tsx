"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState, useId } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import type { CampaignSummary } from "@/lib/campaigns/types";
import { useDismiss } from "@/lib/hooks/useDismiss";
import { t } from "@/lib/messages";
import { useCreateCampaign } from "./CreateCampaignProvider";

type Props = {
  /** null means the list could not be loaded. */
  campaigns: CampaignSummary[] | null;
};

const CAMPAIGN_URL = /^\/admin\/campaigns\/([0-9a-f-]{36})/i;

/**
 * The campaign picker in the top bar. The current campaign is the one in the URL
 * (/admin/campaigns/[id]/...), so a link, a refresh and the back button all agree.
 *
 * Built as a disclosure (a button that shows a list of links) rather than an ARIA
 * "menu": it is plain links, so Tab and Enter work with no custom key handling, and
 * Escape or a click outside closes it.
 */
export default function CampaignSwitcher({ campaigns }: Props) {
  const pathname = usePathname();
  const { canCreate, open: openCreateDialog } = useCreateCampaign();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);

  const currentId = CAMPAIGN_URL.exec(pathname)?.[1]?.toLowerCase();
  const current = campaigns?.find((c) => c.id.toLowerCase() === currentId);

  const triggerLabel = campaigns === null
    ? t.switcher.unavailable
    : current
      ? current.name
      : campaigns.length === 0
        ? t.switcher.none
        : t.switcher.choose;

  return (
    <div ref={rootRef} data-guide="switcher" className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t.switcher.label}: ${triggerLabel}`}
        className="flex max-w-[16rem] items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink transition hover:bg-canvas focus-ring sm:max-w-xs"
      >
        <span className={`truncate ${current ? "font-semibold" : "text-ink-muted"}`}>{triggerLabel}</span>
        {current && <StatusBadge status={current.status} className="shrink-0" />}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-muted" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="absolute left-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-2 shadow-lg">
          {campaigns === null && <p className="px-3 py-2 text-sm text-danger-text">{t.switcher.listUnavailable}</p>}
          {campaigns?.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">{t.switcher.noneInList}</p>}

          {campaigns && campaigns.length > 0 && (
            <ul className="max-h-72 overflow-y-auto">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <Link
                    href={`/admin/campaigns/${campaign.id}`}
                    aria-current={campaign.id === current?.id ? "true" : undefined}
                    onClick={close}
                    className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition focus-ring hover:bg-canvas ${
                      campaign.id === current?.id ? "bg-primary-soft" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{campaign.name}</span>
                      <span className="block text-xs text-ink-muted">{campaign.academicYear}</span>
                    </span>
                    <StatusBadge status={campaign.status} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {canCreate && (
            <div className={campaigns && campaigns.length > 0 ? "mt-2 border-t border-line pt-2" : ""}>
              <button
                type="button"
                onClick={() => {
                  close();
                  openCreateDialog();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-canvas focus-ring"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t.switcher.create}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
