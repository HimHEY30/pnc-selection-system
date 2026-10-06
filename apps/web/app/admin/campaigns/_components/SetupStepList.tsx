import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import { stepDescription, stepHref, stepTitle } from "@/lib/campaigns/steps";
import type { CampaignStep, StepStatus } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";

type Props = {
  campaignId: string;
  steps: CampaignStep[];
  /** False for people who may only view the campaign. */
  canEdit: boolean;
};

function actionLabel(status: StepStatus, canEdit: boolean): string {
  if (!canEdit) return t.setup.view;
  if (status === "Complete") return t.setup.review;
  if (status === "InProgress") return t.setup.continue;
  return t.setup.start;
}

/**
 * The five setup steps, each with its status and an action. The first step that is not
 * complete is highlighted as "where to go next". Steps whose page does not exist yet
 * show a disabled button instead of a link that would lead nowhere.
 */
export default function SetupStepList({ campaignId, steps, canEdit }: Props) {
  const next = steps.find((s) => s.status !== "Complete")?.step;

  return (
    <ol aria-label={t.setup.listLabel} className="flex flex-col gap-3">
      {steps.map((step) => {
        const href = stepHref(step.step, campaignId);
        const highlighted = step.step === next && href !== null;
        const label = actionLabel(step.status, canEdit);
        const primary = highlighted && canEdit;

        return (
          <li
            key={step.step}
            className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-surface px-5 py-4 shadow-card transition-shadow duration-200 hover:shadow-overlay ${
              highlighted ? "border-brand-blue ring-1 ring-brand-blue" : "border-line"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-ink ${
                highlighted ? "bg-brand-blue" : "bg-neutral-soft"
              }`}
            >
              {step.order}
            </span>

            <div className="min-w-0 flex-1 basis-56">
              <h2 className="text-[17px] font-bold leading-tight text-ink">{stepTitle(step.step)}</h2>
              <p className="mt-0.5 text-sm text-ink-muted">{stepDescription(step.step)}</p>
            </div>

            <div className="flex items-center gap-4">
              <StatusBadge status={step.status} />
              {href ? (
                <Link href={href} className={`${buttonClasses(primary ? "primary" : "secondary")} min-w-24`}>
                  {label}
                </Link>
              ) : (
                <button type="button" disabled className={`${buttonClasses("secondary")} min-w-24`}>
                  {label}
                  <span className="sr-only"> ({t.common.comingSoon})</span>
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
