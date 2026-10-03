import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  /** The call to action, usually a button. */
  action?: ReactNode;
  /** Small text under the action. */
  hint?: string;
  /** A shorter card, for an empty section inside a page rather than a whole empty page. */
  compact?: boolean;
  className?: string;
};

/** Card + plus illustration, drawn with CSS so it needs no image file. */
function Illustration() {
  return (
    <div aria-hidden="true" className="relative mb-8 h-[88px] w-[124px]">
      <div className="absolute inset-x-0 bottom-0 top-2 rounded-lg border-2 border-brand-blue bg-primary-soft">
        <div className="ml-4 mt-4 h-2 w-12 rounded-full bg-brand-blue" />
        <div className="ml-4 mt-2.5 h-1.5 w-[88px] rounded-full bg-primary-line" />
        <div className="ml-4 mt-2 h-1.5 w-[88px] rounded-full bg-primary-line" />
      </div>
      <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange text-ink">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </div>
  );
}

export default function EmptyState({ title, description, action, hint, compact, className }: Props) {
  return (
    <section
      className={`flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-12 text-center ${compact ? "min-h-[340px]" : "min-h-[540px]"} ${className ?? ""}`}
    >
      <Illustration />
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
      {hint && <p className="mt-5 text-xs text-ink-muted">{hint}</p>}
    </section>
  );
}
