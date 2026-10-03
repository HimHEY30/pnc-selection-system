"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";
import { Select, TextInput, Textarea } from "@/components/ui/inputs";
import { academicYearOptions, defaultAcademicYear } from "@/lib/campaigns/academic-years";
import { validateCreate, type CreateField } from "@/lib/campaigns/validation";
import { t } from "@/lib/messages";
import { createCampaignAction } from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Errors = Partial<Record<CreateField | "startMode", string>>;

/**
 * "Create campaign" as a native <dialog> opened with showModal(). The browser then
 * provides what a modal needs: focus moves into the dialog and stays there (a focus
 * trap), the page behind becomes inert, Escape closes it, and focus returns to the
 * button that opened it.
 *
 * It holds the form state, so the provider mounts a fresh copy (new `key`) each time
 * it is opened, which resets the fields without any reset code.
 */
export default function CreateCampaignDialog({ open, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState(() => defaultAcademicYear());
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The `open` prop is the source of truth; the DOM dialog follows it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function focusField(field: string) {
    (formRef.current?.elements.namedItem(field) as HTMLElement | null)?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const found = validateCreate({ name, academicYear, description });
    setErrors(found);
    setFormError(null);
    const firstInvalid = (["name", "academicYear", "description"] as const).find((f) => found[f]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    startTransition(async () => {
      const result = await createCampaignAction({ name, academicYear, description, startMode: "scratch" });
      if (result.ok) {
        onClose();
        router.push(`/admin/campaigns/${result.data.id}`);
        return;
      }

      setErrors((result.fieldErrors ?? {}) as Errors);
      setFormError(result.fieldErrors ? null : result.message);
      const first = Object.keys(result.fieldErrors ?? {})[0];
      if (first) focusField(first);
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-campaign-title"
      onClose={onClose}
      // Esc must not discard a save that is in flight.
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current && !pending) dialogRef.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[580px] rounded-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
    >
      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto px-8 pb-6 pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="create-campaign-title" className="text-xl font-bold">
                {t.create.title}
              </h2>
              <p className="mt-1 text-[15px] text-ink-muted">{t.create.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={t.common.close}
              className="-mr-2 -mt-1 rounded-lg p-2 text-ink-muted transition hover:bg-canvas focus-ring"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {formError && (
            <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-5">
            <FormField label={t.create.name} hint={t.create.nameHint} error={errors.name}>
              {(control) => (
                <TextInput
                  {...control}
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.create.namePlaceholder}
                  maxLength={150}
                  autoComplete="off"
                />
              )}
            </FormField>

            <FormField label={t.create.academicYear} error={errors.academicYear}>
              {(control) => (
                <Select {...control} name="academicYear" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                  {academicYearOptions(new Date(), academicYear).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField label={t.create.description} optional error={errors.description}>
              {(control) => (
                <Textarea {...control} name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              )}
            </FormField>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">{t.create.howToStart}</legend>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-primary bg-primary-soft px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
                  <input type="radio" name="startMode" value="scratch" defaultChecked className="mt-1 size-4 accent-primary" />
                  <span>
                    <span className="block text-[15px] font-semibold">{t.create.scratch}</span>
                    <span className="block text-sm text-ink-muted">{t.create.scratchHint}</span>
                  </span>
                </label>

                {/* No campaign can be Closed yet, so there is nothing to copy from. */}
                <label className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-line px-4 py-3">
                  <input
                    type="radio"
                    name="startMode"
                    value="copy"
                    disabled
                    aria-describedby="copy-hint"
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="block text-[15px] font-semibold text-ink-muted">{t.create.copy}</span>
                    <span id="copy-hint" className="block text-sm text-ink-muted">
                      {t.create.copyHint}
                    </span>
                  </span>
                </label>
              </div>
              {errors.startMode && <p className="mt-1.5 text-[13px] text-danger-text">{errors.startMode}</p>}
            </fieldset>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-8 py-5">
          <Button onClick={() => dialogRef.current?.close()} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t.create.submitting : t.create.submit}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
