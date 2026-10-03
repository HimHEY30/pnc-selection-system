"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import ProgressBar from "@/components/ui/ProgressBar";
import type { GuideStep } from "@/lib/guide/guide";
import { t } from "@/lib/messages";

type Props = {
  open: boolean;
  steps: readonly GuideStep[];
  onClose: () => void;
};

const text = t.guide.tour;

/** The welcome tour: one step at a time, in the same dialog the forms use. Closing it at any step is skipping it. */
export default function GuideTour({ open, steps, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  if (!step) return null;

  return (
    <FormDialog open={open} title={step.title} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{text.stepOf(index + 1, steps.length)}</p>
          <ProgressBar total={steps.length} complete={index + 1} inProgress={0} label={text.stepOf(index + 1, steps.length)} />
        </div>

        <p className="text-[15px] leading-relaxed text-ink">{step.body}</p>
        {step.points.length > 0 && (
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink marker:text-primary">
            {step.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {last ? (
            <span />
          ) : (
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-2 text-sm font-semibold text-ink-muted transition hover:text-ink focus-ring">
              {text.skip}
            </button>
          )}
          <div className="flex gap-3">
            {index > 0 && <Button onClick={() => setIndex(index - 1)}>{text.back}</Button>}
            {last ? (
              <Button variant="primary" onClick={onClose}>
                {text.done}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setIndex(index + 1)}>
                {text.next}
              </Button>
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
