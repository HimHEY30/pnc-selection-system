import type { ReactNode } from "react";
import { formatDate, isIsoDate } from "@/lib/campaigns/dates";
import { t } from "@/lib/messages";

type Props = {
  /** yyyy-mm-dd, or "" while unset or half-typed. */
  startDate: string;
  endDate: string;
};

type Marker = "filled" | "hollow" | "error";

function Item({ marker, title, children }: { marker: Marker; title: string; children: ReactNode }) {
  const dot =
    marker === "filled"
      ? "bg-primary"
      : marker === "error"
        ? "bg-danger"
        : "border-2 border-line-strong bg-surface";

  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className={`mt-1 size-3 shrink-0 rounded-full ${dot}`} />
      <div>
        <p className="text-[15px] font-semibold leading-tight text-ink">{title}</p>
        <p className={`mt-0.5 text-sm ${marker === "error" ? "font-medium text-danger-text" : "text-ink-muted"}`}>
          {children}
        </p>
      </div>
    </li>
  );
}

/**
 * Start and end dates laid out as a timeline. It follows the form as the user types:
 * an end date that is not after the start date is shown as a problem instead of as a date.
 * The sessions and exam rows are filled in by later steps.
 */
export default function TimelinePreview({ startDate, endDate }: Props) {
  const start = isIsoDate(startDate) ? startDate : null;
  const end = isIsoDate(endDate) ? endDate : null;
  const endBeforeStart = start !== null && end !== null && end <= start;

  return (
    <section aria-labelledby="timeline-title" className="rounded-xl border border-line bg-surface p-6">
      <h2 id="timeline-title" className="text-[17px] font-bold text-ink">
        {t.timeline.title}
      </h2>

      <ol className="mt-5 flex flex-col gap-4">
        <Item marker={start ? "filled" : "hollow"} title={t.timeline.starts}>
          {start ? formatDate(start) : t.timeline.notSet}
        </Item>
        <Item marker="hollow" title={t.timeline.sessions}>
          {t.timeline.sessionsHint}
        </Item>
        <Item marker="hollow" title={t.timeline.exam}>
          {t.timeline.examHint}
        </Item>
        <Item marker={endBeforeStart ? "error" : end ? "filled" : "hollow"} title={t.timeline.ends}>
          {endBeforeStart ? t.timeline.fixEndDate : end ? formatDate(end) : t.timeline.notSet}
        </Item>
      </ol>
    </section>
  );
}
