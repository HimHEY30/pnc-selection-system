"use client";

import { useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import FormField from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/inputs";
import { CANCEL_REASON_MAX } from "@/lib/sessions/form";
import type { InformationSession } from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import { cancelSessionAction } from "../../sessions-actions";

type Props = {
  /** The session to cancel, or null while the dialog is closed. */
  session: InformationSession | null;
  onClose: () => void;
};

const text = t.sessions.cancel;

/** Cancelling is final and needs a reason, so it asks for one instead of a bare "Are you sure?". */
export default function CancelDialog({ session, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <FormDialog
      open={session !== null}
      title={text.title}
      description={session ? text.description(session.title) : undefined}
      busy={busy}
      onClose={onClose}
    >
      {session && <CancelBody session={session} onBusy={setBusy} onClose={onClose} />}
    </FormDialog>
  );
}

function CancelBody({ session, onBusy, onClose }: { session: InformationSession; onBusy: (busy: boolean) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    const trimmed = reason.trim();
    if (!trimmed) {
      setError(text.reasonRequired);
      return;
    }
    if (trimmed.length > CANCEL_REASON_MAX) {
      setError(text.reasonTooLong(CANCEL_REASON_MAX));
      return;
    }
    setError(undefined);

    onBusy(true);
    startTransition(async () => {
      const result = await cancelSessionAction(session.campaignId, session.id, trimmed);
      onBusy(false);
      if (result.ok) {
        onClose();
      } else if (result.fieldErrors?.reason) {
        setError(result.fieldErrors.reason);
      } else {
        setMessage(result.message || t.sessions.failed);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      <FormField label={text.reason} hint={text.reasonHint} error={error}>
        {(control) => (
          <Textarea {...control} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        )}
      </FormField>

      <div className="flex justify-end gap-3">
        <Button onClick={onClose} disabled={pending}>
          {text.keep}
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? text.working : text.confirm}
        </Button>
      </div>
    </form>
  );
}
