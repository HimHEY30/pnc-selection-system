import type { ReactNode } from "react";
import type { FormProgress, SectionId, SectionProgress } from "@/lib/candidates/progress";
import { t } from "@/lib/messages";

const text = t.candidates.form.progress;

/** The id of a section's element, so the progress chips can scroll to it. */
export const sectionElementId = (id: SectionId) => `candidate-section-${id}`;

type ChipState = "complete" | "current" | "todo";

const stateOf = (section: SectionProgress, current: SectionId | null): ChipState =>
  section.complete ? "complete" : section.id === current ? "current" : "todo";

function Marker({ state }: { state: ChipState }) {
  const base = "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200";
  if (state === "complete") {
    return (
      <span aria-hidden="true" className={`${base} bg-primary text-white`}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${base} border-2 ${state === "current" ? "border-brand-blue bg-primary-soft" : "border-line-strong bg-surface"}`}>
      {state === "current" && <span className="size-1.5 rounded-full bg-brand-blue" />}
    </span>
  );
}

type HeaderProps = {
  title: string;
  progress: FormProgress;
  onJump: (id: SectionId) => void;
};

/**
 * The form's progress, kept in view while scrolling: how much of what is required is filled in, which section is next,
 * and one sentence saying what to do. All of it comes from the form's own checks (see lib/candidates/progress.ts).
 */
export function FormProgressHeader({ title, progress, onJump }: HeaderProps) {
  const next = progress.current;
  return (
    <div className="sticky top-0 z-10 -mx-6 border-b border-line bg-surface px-6 pb-3 pt-1 sm:-mx-8 sm:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="text-sm font-semibold tabular-nums text-primary">{text.percent(progress.percent)}</span>
      </div>

      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={text.percent(progress.percent)}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${progress.percent}%` }} />
      </div>

      <ol className="mt-3 grid grid-cols-4 gap-1">
        {progress.sections.map((section) => {
          const state = stateOf(section, next);
          const name = text.sections[section.id];
          return (
            <li key={section.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onJump(section.id)}
                aria-label={`${text.jumpTo(name)}, ${text.stateLabel[state]}`}
                aria-current={state === "current" ? "step" : undefined}
                className={`flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs font-semibold transition-colors duration-150 focus-ring sm:justify-start sm:px-2 ${
                  state === "current" ? "bg-primary-soft text-primary" : "text-ink-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <Marker state={state} />
                <span className="hidden truncate sm:inline">{name}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="mt-2 text-[13px] leading-snug text-ink-muted">
        {next ? text.next(text.guidance[next]) : text.ready}
      </p>
    </div>
  );
}

type SectionProps = {
  id: SectionId;
  section: SectionProgress;
  children: ReactNode;
};

/** One titled part of the form: what it is for, whether it is done, then its fields. */
export function FormSection({ id, section, children }: SectionProps) {
  const headingId = `${sectionElementId(id)}-title`;
  const status = section.required === 0 ? text.sectionOptional : section.complete ? text.sectionDone : text.sectionLeft(section.missing.length);

  return (
    <section id={sectionElementId(id)} aria-labelledby={headingId} className="scroll-mt-40 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-bold text-ink">
            {text.sections[id]}
          </h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{text.descriptions[id]}</p>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
            section.complete && section.required > 0 ? "bg-primary-soft text-primary" : section.required === 0 ? "bg-neutral-soft text-ink-muted" : "bg-warning-soft text-ink"
          }`}
        >
          {status}
        </span>
      </div>
      {children}
    </section>
  );
}
