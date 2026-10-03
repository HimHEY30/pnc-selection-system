/** A pulsing placeholder block. Size it with className, e.g. "h-6 w-48". */
export default function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-neutral-soft ${className ?? ""}`} />;
}
