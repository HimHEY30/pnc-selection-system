import { useEffect } from "react";

/** True when any field differs from where the form started. Both objects are flat records of strings. */
export function hasChanged<T extends Record<string, unknown>>(current: T, initial: T): boolean {
  return (Object.keys(current) as (keyof T)[]).some((key) => current[key] !== initial[key]);
}

/**
 * Tells the dialog around a form whether anything was typed, so it can ask before Escape or the
 * close button throw it away (see FormDialog's `dirty`). The form lives inside the dialog and the
 * dialog owns the flag, so the form reports it upward. It reports "not changed" again when the
 * form goes away, so the next one starts clean.
 */
export function useReportDirty(dirty: boolean, onDirty: (dirty: boolean) => void) {
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
}
