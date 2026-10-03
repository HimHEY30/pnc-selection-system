import Button from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import type { CampaignDetail } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";

type Props = { campaign: Pick<CampaignDetail, "progress" | "canActivate" | "academicYear" | "createdByName"> };

/** Overall progress, the "Review and activate" button, and two facts about the campaign. */
export default function SetupProgressCard({ campaign }: Props) {
  const { total, complete, inProgress } = campaign.progress;
  const summary = `${t.setup.stepsComplete(complete, total)}, ${t.setup.stepsInProgress(inProgress)}`;

  return (
    <aside aria-labelledby="setup-progress-title" className="rounded-xl border border-line bg-surface p-6">
      <h2 id="setup-progress-title" className="text-[17px] font-bold text-ink">
        {t.setup.progress}
      </h2>

      <div className="mt-4 flex items-baseline justify-between gap-3 text-sm text-ink-muted">
        <span>{t.setup.stepsComplete(complete, total)}</span>
        <span>{t.setup.stepsInProgress(inProgress)}</span>
      </div>
      <div className="mt-2">
        <ProgressBar total={total} complete={complete} inProgress={inProgress} label={summary} />
      </div>

      {/* Stays disabled until every step is complete. Activating a campaign is a later
          feature, so there is no action to run yet even when it becomes enabled. */}
      <Button variant="primary" className="mt-4 w-full" disabled={!campaign.canActivate}>
        {t.setup.activate}
      </Button>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">{t.setup.activateHint}</p>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
        <dt className="text-ink-muted">{t.setup.academicYear}</dt>
        <dd className="text-right font-semibold text-ink">{campaign.academicYear}</dd>
        <dt className="text-ink-muted">{t.setup.createdBy}</dt>
        <dd className="text-right font-semibold text-ink">{campaign.createdByName}</dd>
      </dl>
    </aside>
  );
}
