"use client";

import { useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import FormField from "@/components/ui/FormField";
import { TextInput } from "@/components/ui/inputs";
import { hasChanged, useReportDirty } from "@/lib/hooks/useReportDirty";
import { formatDate, hasTakenPlace } from "@/lib/sessions/format";
import { parseCount } from "@/lib/sessions/form";
import { COUNT_MAX, type InformationSession } from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import { recordAttendanceAction, setExpectedAction } from "../../sessions-actions";

type Props = {
  /** The session to enter numbers for, or null while the dialog is closed. */
  session: InformationSession | null;
  onClose: () => void;
};

const text = t.sessions.numbers;

/**
 * "Enter numbers" for one session: how many candidates are expected, and (once the session has taken place) how
 * many females and males came. Each part is saved on its own, so one can be done without the other. Entering
 * attendance marks the session as done; saving it again corrects it.
 */
export default function NumbersDialog({ session, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  return (
    <FormDialog
      open={session !== null}
      title={text.title}
      description={session ? text.intro(session.title) : undefined}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      {session && <NumbersBody session={session} onBusy={setBusy} onDirty={setDirty} onClose={onClose} />}
    </FormDialog>
  );
}

const asText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

type NumbersBodyProps = {
  session: InformationSession;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
};

function NumbersBody({ session, onBusy, onDirty, onClose }: NumbersBodyProps) {
  const [expected, setExpected] = useState(asText(session.expectedCandidates));
  const [female, setFemale] = useState(asText(session.attendance?.female));
  const [male, setMale] = useState(asText(session.attendance?.male));
  // What the server holds. Each part is saved on its own and the dialog stays open, so "unsaved" means
  // different from the last save, not different from when the dialog opened.
  const [saved, setSaved] = useState({ expected, female, male });
  useReportDirty(hasChanged({ expected, female, male }, saved), onDirty);
  const [errors, setErrors] = useState<Partial<Record<"expected" | "female" | "male", string>>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const held = hasTakenPlace(session);
  const femaleCount = parseCount(female);
  const maleCount = parseCount(male);
  const total = typeof femaleCount === "number" && typeof maleCount === "number" ? femaleCount + maleCount : null;

  function saveExpected(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setNotice(null);

    const value = parseCount(expected);
    if (value === undefined) {
      setErrors({ expected: text.invalidNumber(COUNT_MAX) });
      return;
    }
    setErrors({});

    onBusy(true);
    startTransition(async () => {
      const result = await setExpectedAction(session.campaignId, session.id, value);
      onBusy(false);
      if (result.ok) {
        setSaved((s) => ({ ...s, expected }));
        setNotice({ kind: "ok", message: text.saved });
      } else if (result.fieldErrors?.expected) {
        setErrors({ expected: result.fieldErrors.expected });
      } else {
        setNotice({ kind: "error", message: result.message || t.sessions.failed });
      }
    });
  }

  function saveActual(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setNotice(null);

    const found: Partial<Record<"female" | "male", string>> = {};
    if (femaleCount === undefined) found.female = text.invalidNumber(COUNT_MAX);
    else if (femaleCount === null) found.female = text.needBoth;
    if (maleCount === undefined) found.male = text.invalidNumber(COUNT_MAX);
    else if (maleCount === null) found.male = text.needBoth;
    setErrors(found);
    if (found.female || found.male) return;

    onBusy(true);
    startTransition(async () => {
      const result = await recordAttendanceAction(session.campaignId, session.id, femaleCount as number, maleCount as number);
      onBusy(false);
      if (result.ok) {
        setSaved((s) => ({ ...s, female, male }));
        setNotice({ kind: "ok", message: text.saved });
      } else if (result.fieldErrors?.female || result.fieldErrors?.male) {
        setErrors({ female: result.fieldErrors.female, male: result.fieldErrors.male });
      } else {
        setNotice({ kind: "error", message: result.message || t.sessions.failed });
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-4 py-3 text-sm ${notice.kind === "error" ? "bg-danger-soft text-danger-text" : "bg-primary-soft text-primary"}`}
        >
          {notice.message}
        </p>
      )}

      <form onSubmit={saveExpected} noValidate aria-labelledby="expected-heading" className="flex flex-col gap-3">
        <h3 id="expected-heading" className="text-[15px] font-bold">
          {text.expectedHeading}
        </h3>
        <FormField label={text.expected} optional hint={text.expectedHint} error={errors.expected}>
          {(control) => (
            <TextInput {...control} name="expected" inputMode="numeric" value={expected} onChange={(e) => setExpected(e.target.value)} autoComplete="off" />
          )}
        </FormField>
        <Button type="submit" variant="secondary" disabled={pending} className="self-start">
          {text.saveExpected}
        </Button>
      </form>

      <form onSubmit={saveActual} noValidate aria-labelledby="actual-heading" className="flex flex-col gap-3 border-t border-line pt-6">
        <h3 id="actual-heading" className="text-[15px] font-bold">
          {text.actualHeading}
        </h3>
        {held ? (
          <p className="text-sm text-ink-muted">{text.actualHint}</p>
        ) : (
          <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">{text.notYet(session.date ? formatDate(session.date) : "")}</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={text.female} error={errors.female}>
            {(control) => (
              <TextInput {...control} name="female" inputMode="numeric" value={female} onChange={(e) => setFemale(e.target.value)} disabled={!held} autoComplete="off" />
            )}
          </FormField>
          <FormField label={text.male} error={errors.male}>
            {(control) => (
              <TextInput {...control} name="male" inputMode="numeric" value={male} onChange={(e) => setMale(e.target.value)} disabled={!held} autoComplete="off" />
            )}
          </FormField>
        </div>

        {held && (
          <p aria-live="polite" className="text-sm font-semibold text-ink">
            {total === null ? "" : text.total(total)}
          </p>
        )}
        {session.attendance && <p className="text-[13px] text-ink-muted">{text.correction(session.attendance.recordedByName)}</p>}

        <Button type="submit" variant="primary" disabled={pending || !held} className="self-start">
          {pending ? text.saving : text.saveActual}
        </Button>
      </form>

      <div className="flex justify-end">
        <Button onClick={onClose} disabled={pending}>
          {text.close}
        </Button>
      </div>
    </div>
  );
}
