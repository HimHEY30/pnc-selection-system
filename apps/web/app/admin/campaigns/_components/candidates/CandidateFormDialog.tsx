"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import FormField from "@/components/ui/FormField";
import { Select, TextInput } from "@/components/ui/inputs";
import { buildAssistantContext } from "@/lib/ai/assistant";
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
import { formProgress, type SectionId } from "@/lib/candidates/progress";
import { GENDERS, type Candidate, type SchoolChoice, type SessionChoice } from "@/lib/candidates/types";
import { useReportDirty } from "@/lib/hooks/useReportDirty";
import { t } from "@/lib/messages";
import { cambodiaToday, formatDate } from "@/lib/sessions/format";
import { createCandidateAction, updateCandidateAction } from "../../candidates-actions";
import AddressPicker from "./AddressPicker";
import AIAssistant from "./AIAssistant";
import { FormProgressHeader, FormSection, sectionElementId } from "./CandidateFormSections";

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
  /** Called once a candidate was added or changed, just before the dialog closes. */
  onSaved?: (kind: "created" | "updated") => void;
};

const text = t.candidates.form;

export default function CandidateFormDialog({ target, campaignId, sessions, schools, onClose, onSaved }: Props) {
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
          onSaved={onSaved}
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
  onSaved,
}: Omit<Props, "target" | "onClose" | "onSaved"> & {
  target: CandidateDialogTarget;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  onSaved?: (kind: "created" | "updated") => void;
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
        onSaved?.(editing ? "updated" : "created");
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

  /** Brings a section into view from the progress header. Smooth scrolling is skipped for people who asked for less motion. */
  function jumpTo(id: SectionId) {
    const quiet = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(sectionElementId(id))?.scrollIntoView?.({ behavior: quiet ? "auto" : "smooth", block: "start" });
  }

  const progress = formProgress(form);
  const section = (id: SectionId) => progress.sections.find((s) => s.id === id)!;
  const otherSchool = form.school === OTHER_SCHOOL;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <FormProgressHeader title={t.candidates.form.progress.title} progress={progress} onJump={jumpTo} />

      <p className="-mt-2 text-[13px] text-ink-muted">{t.candidates.form.progress.required}</p>

      {message && (
        <p role="alert" className="motion-rise rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      <div className="flex flex-col gap-6">
        <FormSection id="person" section={section("person")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={text.nameKm} error={errors.nameKm}>
              {(control) => (
                <TextInput {...control} name="nameKm" lang="km" value={form.nameKm} onChange={(e) => set("nameKm", e.target.value)} maxLength={NAME_MAX} autoComplete="off" />
              )}
            </FormField>
            <FormField label={text.nameEn} error={errors.nameEn}>
              {(control) => (
                <TextInput {...control} name="nameEn" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} maxLength={NAME_MAX} autoComplete="off" />
              )}
            </FormField>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
        </FormSection>

        <FormSection id="location" section={section("location")}>
          <AddressPicker
            value={form.address}
            errors={errors}
            onChange={(address) => {
              setForm((f) => ({ ...f, address }));
              setErrors((e) => ({ ...e, province: undefined, district: undefined, commune: undefined, village: undefined }));
            }}
          />
        </FormSection>

        <FormSection id="school" section={section("school")}>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <FormField className="motion-rise" label={text.schoolName} hint={text.schoolNameHint} error={errors.schoolName}>
                {(control) => (
                  <TextInput {...control} name="schoolName" value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} maxLength={SCHOOL_NAME_MAX} autoComplete="off" />
                )}
              </FormField>
            )}
          </div>
        </FormSection>

        <FormSection id="support" section={section("support")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={text.session} optional hint={text.sessionHint} error={errors.sessionId} className="sm:col-span-2">
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

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-ink">{text.ngo}</legend>
              <div className="flex flex-wrap gap-2">
                {(["yes", "no"] as const).map((answer) => (
                  <label
                    key={answer}
                    className="flex min-w-24 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink transition-colors duration-150 hover:bg-canvas has-[:checked]:border-brand-blue has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue"
                  >
                    <input
                      type="radio"
                      name="ngo"
                      value={answer}
                      checked={form.ngo === answer}
                      onChange={() => {
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
              <FormField className="motion-rise" label={text.ngoName} error={errors.ngoName}>
                {(control) => (
                  <TextInput {...control} name="ngoName" value={form.ngoName} onChange={(e) => set("ngoName", e.target.value)} maxLength={NGO_NAME_MAX} autoComplete="off" />
                )}
              </FormField>
            )}
          </div>
        </FormSection>
      </div>

      <AIAssistant getContext={() => buildAssistantContext(form, editing ? "edit" : "create")} />

      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-col-reverse gap-3 border-t border-line bg-surface px-6 py-4 sm:-mx-8 sm:-mb-6 sm:flex-row sm:justify-end sm:px-8">
        <Button onClick={onClose} disabled={pending} className="w-full sm:w-auto">
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
          {pending ? text.saving : editing ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}
