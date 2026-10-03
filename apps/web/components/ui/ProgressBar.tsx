type Props = {
  total: number;
  complete: number;
  inProgress: number;
  /** Text for assistive tech, e.g. "0 of 5 steps complete, 1 in progress". */
  label: string;
};

/** One segment per step: complete first (dark blue), then in progress (orange), then empty. */
export default function ProgressBar({ total, complete, inProgress, label }: Props) {
  const segments = Array.from({ length: total }, (_, i) =>
    i < complete ? "bg-primary" : i < complete + inProgress ? "bg-brand-orange" : "bg-line",
  );

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={complete}
      aria-valuetext={label}
      className="flex gap-1"
    >
      {segments.map((tone, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${tone}`} />
      ))}
    </div>
  );
}
