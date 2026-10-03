"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/messages";
import ConfirmDialog from "./ConfirmDialog";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  /** A save is in flight: Escape, the backdrop and the close button must not throw the work away. */
  busy?: boolean;
  /** Something was typed and not saved: Escape, the backdrop and the close button ask before discarding it. */
  dirty?: boolean;
  onClose: () => void;
  /** "lg" for forms with two columns of fields. */
  size?: "md" | "lg";
  children: ReactNode;
};

/**
 * A form in a native <dialog> opened with showModal(), so the browser gives it a focus trap, makes the page
 * behind inert, closes it on Escape and returns focus to what opened it. Its children are only mounted while
 * it is open, so a form inside starts empty every time without any reset code.
 */
export default function FormDialog({ open, title, description, busy, dirty, onClose, size = "md", children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Every way of closing by hand (Escape, the X, the backdrop) comes through here.
  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else dialogRef.current?.close();
  };

  // The `open` prop is the source of truth; the DOM dialog follows it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // React passes a dialog's close and cancel events up to the dialogs around it, though the browser does not.
      // Without the target check, closing a dialog opened from inside this one (add a host while writing a
      // session) would close this one too and throw away what was typed.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        if (busy) event.preventDefault();
        else if (dirty) {
          event.preventDefault();
          setConfirmingDiscard(true);
        }
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) requestClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60 ${
        size === "lg" ? "max-w-[720px]" : "max-w-[540px]"
      }`}
    >
      {open && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto px-6 pb-6 pt-7 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-xl font-bold">
                {title}
              </h2>
              {description && <p className="mt-1 text-[15px] text-ink-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              aria-label={t.common.close}
              className="-mr-2 -mt-1 rounded-lg p-2 text-ink-muted transition hover:bg-canvas focus-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
      <ConfirmDialog
        open={open && confirmingDiscard}
        title={t.common.discard.title}
        description={t.common.discard.body}
        confirmLabel={t.common.discard.confirm}
        cancelLabel={t.common.discard.keep}
        destructive
        onConfirm={() => {
          setConfirmingDiscard(false);
          dialogRef.current?.close();
        }}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </dialog>
  );
}
