"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import FormField from "@/components/ui/FormField";
import { Select, TextInput } from "@/components/ui/inputs";
import {
  CANDIDATE_FIELD_ORDER,
  NAME_MAX,
  NGO_NAME_MAX,
  OTHER_SCHOOL,
  SCHOOL_NAME_MAX,
  emptyCandidateForm,
  formFromCandidate,
  isDirty,
  placeServerErrors,
  toCandidateRequest,
  validateCandidateForm,
  type CandidateErrors,
  type CandidateField,
  type CandidateForm,
} from "@/lib/candidates/form";
import { GENDERS, type Candidate, type SchoolChoice, type SessionChoice } from "@/lib/candidates/types";
import { useReportDirty } from "@/lib/hooks/useReportDirty";
import { t } from "@/lib/messages";
import { cambodiaToday, formatDate } from "@/lib/sessions/format";
import { createCandidateAction, updateCandidateAction } from "../../candidates-actions";
import AddressPicker from "./AddressPicker";

export type CandidateDialogTarget = { kind: "create" } | { kind: "edit"; candidate: Candidate };

type Props = {
  /** What the dialog is for, or null while it is closed. */
  target: CandidateDialogTarget | null;
  campaignId: string;
  /** The campaign's sessions that can be chosen. */
  sessions: SessionChoice[];
  /** The active high schools in the partner directory. */
  schools: SchoolChoice[];
  onClose: () => void;
};

const text = t.candidates.form;

export default function CandidateFormDialog({ target, campaignId, sessions, schools, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  return (
    <FormDialog
      open={target !== null}
      title={target?.kind === "edit" ? text.editTitle : text.createTitle}
      description={text.intro}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      size="lg"
    >
      {target && (
        <CandidateFormBody
          target={target}
          campaignId={campaignId}
          sessions={sessions}
          schools={schools}
          onBusy={setBusy}
          onDirty={setDirty}
          onClose={onClose}
        />
      )}
    </FormDialog>
  );
}

type Option = { id: string; label: string };

function CandidateFormBody({
  target,
  campaignId,
  sessions,
  schools,
  onBusy,
  onDirty,
  onClose,
}: Omit<Props, "target" | "onClose"> & {
  target: CandidateDialogTarget;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const editing = target.kind === "edit" ? target.candidate : null;
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState<CandidateForm>(() => (editing ? formFromCandidate(editing) : emptyCandidateForm()));
  const [form, setForm] = useState<CandidateForm>(initial);
  useReportDirty(isDirty(form, initial), onDirty);
  const [errors, setErrors] = useState<CandidateErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CandidateForm>(field: K, value: CandidateForm[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    // A message goes away when the person starts fixing what it was about.
    setErrors((e) => (field in e ? { ...e, [field]: undefined } : e));
  };

  /** Active schools by name. The school the candidate already has stays choosable even if it was switched off. */
  const schoolOptions = useMemo<Option[]>(() => {
    const options = schools.map((s) => ({ id: s.id, label: s.name }));
    if (editing?.schoolHostId && !options.some((o) => o.id === editing.schoolHostId)) {
      options.push({ id: editing.schoolHostId, label: editing.schoolName + text.schoolSwitchedOff });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [schools, editing]);

  /** The campaign's sessions, soonest first as the server sends them. The one the candidate has stays even if it was called off. */
  const sessionOptions = useMemo<Option[]>(() => {
    const options = sessions.map((s) => ({ id: s.id, label: s.date ? `${s.title} · ${formatDate(s.date)}` : s.title }));
    if (editing?.session && !options.some((o) => o.id === editing.session!.id)) {
      options.push({ id: editing.session.id, label: editing.session.title + text.sessionCancelled });
    }
    return options;
  }, [sessions, editing]);

  function focusField(field: string) {
    (formRef.current?.elements.namedItem(field) as HTMLElement | null)?.focus();
  }

  const firstProblem = (found: CandidateErrors): CandidateField | undefined => CANDIDATE_FIELD_ORDER.find((f) => found[f]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    const found = validateCandidateForm(form);
    setErrors(found);
    const first = firstProblem(found);
    if (first) {
      focusField(first);
      return;
    }

    const request = toCandidateRequest(form, editing?.version ?? null);
    onBusy(true);
    startTransition(async () => {
      const result = editing
        ? await updateCandidateAction(campaignId, editing.id, request)
        : await createCandidateAction(campaignId, request);
      onBusy(false);
      if (result.ok) {
        onClose();
        return;
      }

      const placed = placeServerErrors(form, result.fieldErrors);
      setErrors(placed);
      setMessage(Object.keys(placed).length > 0 ? null : result.message || t.candidates.failed);
      const firstError = firstProblem(placed);
      if (firstError) focusField(firstError);
    });
  }

  const otherSchool = form.school === OTHER_SCHOOL;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted">{text.sectionPerson}</h3>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={text.nameKm} error={errors.nameKm}>
          {(control) => (
            <TextInput
              {...control}
              name="nameKm"
              lang="km"
              value={form.nameKm}
              onChange={(e) => set("nameKm", e.target.value)}
              maxLength={NAME_MAX}
              autoComplete="off"
            />
          )}
        </FormField>
        <FormField label={text.nameEn} error={errors.nameEn}>
          {(control) => (
            <TextInput {...control} name="nameEn" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} maxLength={NAME_MAX} autoComplete="off" />
          )}
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label={text.gender} error={errors.gender}>
          {(control) => (
            <Select {...control} name="gender" value={form.gender} onChange={(e) => set("gender", e.target.value as CandidateForm["gender"])}>
              <option value="">{text.choose}</option>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {text.genders[gender]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={text.dateOfBirth} error={errors.dateOfBirth}>
          {(control) => (
            <TextInput {...control} name="dateOfBirth" type="date" max={cambodiaToday()} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          )}
        </FormField>
        <FormField label={text.phone} hint={text.phoneHint} error={errors.phone}>
          {(control) => (
            <TextInput {...control} name="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} autoComplete="off" />
          )}
        </FormField>
      </div>

      <div className="border-t border-line pt-5">
        <AddressPicker
          value={form.address}
          errors={errors}
          onChange={(address) => {
            setForm((f) => ({ ...f, address }));
            setErrors((e) => ({ ...e, province: undefined, district: undefined, commune: undefined, village: undefined }));
          }}
        />
      </div>

      <h3 className="border-t border-line pt-5 text-sm font-bold uppercase tracking-wider text-ink-muted">{text.sectionSchool}</h3>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={text.school} error={errors.school}>
          {(control) => (
            <Select {...control} name="school" value={form.school} onChange={(e) => set("school", e.target.value)}>
              <option value="">{text.choose}</option>
              {schoolOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              <option value={OTHER_SCHOOL}>{text.schoolOther}</option>
            </Select>
          )}
        </FormField>

        {otherSchool && (
          <FormField label={text.schoolName} hint={text.schoolNameHint} error={errors.schoolName}>
            {(control) => (
              <TextInput
                {...control}
                name="schoolName"
                value={form.schoolName}
                onChange={(e) => set("schoolName", e.target.value)}
                maxLength={SCHOOL_NAME_MAX}
                autoComplete="off"
              />
            )}
          </FormField>
        )}
      </div>

      <FormField label={text.session} optional hint={text.sessionHint} error={errors.sessionId}>
        {(control) => (
          <Select {...control} name="sessionId" value={form.sessionId} onChange={(e) => set("sessionId", e.target.value)}>
            <option value="">{text.sessionNone}</option>
            {sessionOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <h3 className="border-t border-line pt-5 text-sm font-bold uppercase tracking-wider text-ink-muted">{text.sectionSupport}</h3>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{text.ngo}</legend>
          <div className="flex gap-6">
            {(["yes", "no"] as const).map((answer) => (
              <label key={answer} className="flex cursor-pointer items-center gap-2 text-[15px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
                <input
                  type="radio"
                  name="ngo"
                  value={answer}
                  checked={form.ngo === answer}
                  onChange={() => {
                    // Saying "No" forgets the name, so it can never be sent by mistake.
                    setForm((f) => ({ ...f, ngo: answer, ngoName: answer === "no" ? "" : f.ngoName }));
                    setErrors((e) => ({ ...e, ngoName: undefined }));
                  }}
                  className="size-4 accent-primary"
                />
                {answer === "yes" ? text.ngoYes : text.ngoNo}
              </label>
            ))}
          </div>
        </fieldset>

        {form.ngo === "yes" && (
          <FormField label={text.ngoName} error={errors.ngoName}>
            {(control) => (
              <TextInput {...control} name="ngoName" value={form.ngoName} onChange={(e) => set("ngoName", e.target.value)} maxLength={NGO_NAME_MAX} autoComplete="off" />
            )}
          </FormField>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <Button onClick={onClose} disabled={pending}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? text.saving : editing ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}
