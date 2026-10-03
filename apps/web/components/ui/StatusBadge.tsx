import type { CampaignStatus, StepStatus } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";

export type BadgeStatus = StepStatus | CampaignStatus;

// Fills carry dark text (or the dark blue on a pale blue); white text is never used here.
const TONES: Record<BadgeStatus, string> = {
  NotStarted: "bg-neutral-soft text-ink-muted",
  InProgress: "bg-warning-soft text-ink",
  Complete: "bg-primary-soft text-primary",
  Draft: "bg-neutral-soft text-ink-muted",
  Active: "bg-primary-soft text-primary",
  Closed: "bg-neutral-soft text-ink-muted",
};

type Props = { status: BadgeStatus; className?: string };

/** The label is always text, so the status never depends on colour alone. */
export default function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[status]} ${className ?? ""}`}
    >
      {status === "Complete" && (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {t.status[status]}
    </span>
  );
}
