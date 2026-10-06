import { stepTitle } from "@/lib/campaigns/steps";
import type { CampaignStep, StepKey } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";

type Props = {
  steps: CampaignStep[];
  current: StepKey;
};

/** The five steps as a strip above the form, with the one being edited marked. */
export default function StepTabs({ steps, current }: Props) {
  return (
    <ol aria-label={t.info.stepTabsLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {steps.map((step) => {
        const isCurrent = step.step === current;
        return (
          <li
            key={step.step}
            aria-current={isCurrent ? "step" : undefined}
            className={`rounded-xl border border-line border-t-[3px] bg-surface px-4 py-3 shadow-card ${
              isCurrent ? "border-t-primary" : "border-t-line-strong"
            }`}
          >
            <p className={`text-xs ${isCurrent ? "font-semibold text-ink" : "text-ink-muted"}`}>
              {isCurrent ? t.info.currentStep(step.order, t.status[step.status]) : t.info.tabLabel(step.order)}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{stepTitle(step.step)}</p>
          </li>
        );
      })}
    </ol>
  );
}
