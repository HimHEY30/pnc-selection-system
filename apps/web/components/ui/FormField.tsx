import { useId, type ReactNode } from "react";
import { t } from "@/lib/messages";

/** Props to spread on the control so it is linked to its label, hint and error. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type Props = {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  /** Shown under the control in red. It replaces the hint while it is set. */
  error?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * Label, control, hint and inline error as one unit. The label is tied to the control
 * with htmlFor/id, and the hint or error is announced with it via aria-describedby.
 */
export default function FormField({ label, optional, hint, error, className, children }: Props) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || hint);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-ink-muted"> {t.common.optional}</span>}
      </label>

      {children({
        id,
        "aria-describedby": hasMessage ? messageId : undefined,
        "aria-invalid": error ? true : undefined,
      })}

      {/* Always rendered so assistive tech is told when an error appears or goes away. */}
      <div aria-live="polite">
        {hasMessage && (
          <p id={messageId} className={`mt-1.5 text-[13px] leading-snug ${error ? "text-danger-text" : "text-ink-muted"}`}>
            {error ?? hint}
          </p>
        )}
      </div>
    </div>
  );
}
