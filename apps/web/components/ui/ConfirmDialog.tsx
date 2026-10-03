"use client";

import { useEffect, useId, useRef } from "react";
import Button from "./Button";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Styles the confirm button red, for actions that cannot be undone. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * "Are you sure?" as a native <dialog> opened with showModal(), so the browser gives it a
 * focus trap, makes the page behind inert, closes it on Escape and returns focus to what
 * opened it. Focus starts on Cancel, so a stray Enter never confirms a delete.
 */
export default function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // The `open` prop is the source of truth; the DOM dialog follows it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Escape, and anything else that closes the dialog itself, counts as "cancel".
      onClose={onCancel}
      onClick={(event) => {
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
    >
      <div className="px-6 pb-2 pt-6">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>
      <div className="flex justify-end gap-3 px-6 pb-6 pt-4">
        <Button ref={cancelRef} onClick={() => dialogRef.current?.close()}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
