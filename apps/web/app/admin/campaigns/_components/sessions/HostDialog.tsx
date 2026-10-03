"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import FormField from "@/components/ui/FormField";
import { Select, TextInput } from "@/components/ui/inputs";
import { hasChanged, useReportDirty } from "@/lib/hooks/useReportDirty";
import { emptyHostForm, toHostRequest, validateHostForm, type HostField, type HostForm } from "@/lib/sessions/form";
import { PARTNER_KINDS, type DirectoryHostType, type Host } from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import { createHostAction, updateHostAction } from "../../sessions-actions";

export type HostDialogTarget = { kind: "create"; type: DirectoryHostType } | { kind: "edit"; host: Host };

type Props = {
  /** What the dialog is for, or null while it is closed. */
  target: HostDialogTarget | null;
  onClose: () => void;
  /** The host was saved: the new or changed record, as the server sent it. */
  onSaved: (host: Host) => void;
};

const text = t.sessions.host;

/** Add an alumnus or a partner to the directory, or change one. */
export default function HostDialog({ target, onClose, onSaved }: Props) {
  const title =
    target?.kind === "edit"
      ? text.editTitle
      : text.createTitle(target ? t.sessions.labels.hostType[target.type] : "");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  return (
    <FormDialog open={target !== null} title={title} description={text.intro} busy={busy} dirty={dirty} onClose={onClose}>
      {target && <HostFormBody target={target} onBusy={setBusy} onDirty={setDirty} onClose={onClose} onSaved={onSaved} />}
    </FormDialog>
  );
}

function HostFormBody({
  target,
  onBusy,
  onDirty,
  onClose,
  onSaved,
}: {
  target: HostDialogTarget;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  onSaved: (host: Host) => void;
}) {
  const type: DirectoryHostType = target.kind === "edit" ? target.host.type : target.type;
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState<HostForm>(() =>
    target.kind === "edit"
      ? {
          name: target.host.name,
          partnerKind: target.host.partnerKind ?? "",
          contactPerson: target.host.contactPerson ?? "",
          phone: target.host.phone ?? "",
          email: target.host.email ?? "",
        }
      : emptyHostForm,
  );
  const [form, setForm] = useState<HostForm>(initial);
  useReportDirty(hasChanged(form, initial), onDirty);
  const [errors, setErrors] = useState<Partial<Record<HostField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: HostField, value: string) => setForm((f) => ({ ...f, [field]: value }));

  function focusField(field: string) {
    (formRef.current?.elements.namedItem(field) as HTMLElement | null)?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    const found = validateHostForm(type, form);
    setErrors(found);
    const first = (["name", "partnerKind", "contactPerson", "phone", "email"] as const).find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }

    const request = toHostRequest(type, form);
    onBusy(true);
    startTransition(async () => {
      const result = target.kind === "edit" ? await updateHostAction(target.host.id, request) : await createHostAction(request);
      onBusy(false);
      if (result.ok) {
        onSaved(result.data);
        onClose();
        return;
      }

      const fieldErrors = (result.fieldErrors ?? {}) as Partial<Record<HostField, string>>;
      setErrors(fieldErrors);
      setMessage(Object.keys(fieldErrors).length > 0 ? null : result.message || t.sessions.failed);
      const firstError = Object.keys(fieldErrors)[0];
      if (firstError) focusField(firstError);
    });
  }

  const partner = type === "Partner";

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      <FormField label={partner ? text.namePartner : text.nameAlumnus} error={errors.name}>
        {(control) => (
          <TextInput {...control} name="name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoComplete="off" />
        )}
      </FormField>

      {partner && (
        <>
          <FormField label={text.partnerKind} error={errors.partnerKind}>
            {(control) => (
              <Select {...control} name="partnerKind" value={form.partnerKind} onChange={(e) => set("partnerKind", e.target.value)}>
                <option value="">{text.choose}</option>
                {PARTNER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t.sessions.labels.partnerKind[kind]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField label={text.contactPerson} optional error={errors.contactPerson}>
            {(control) => (
              <TextInput
                {...control}
                name="contactPerson"
                value={form.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            )}
          </FormField>
        </>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={text.phone} hint={text.contactHint} error={errors.phone}>
          {(control) => (
            <TextInput {...control} name="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} autoComplete="off" />
          )}
        </FormField>
        <FormField label={text.email} error={errors.email}>
          {(control) => (
            <TextInput {...control} name="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={120} autoComplete="off" />
          )}
        </FormField>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <Button onClick={onClose} disabled={pending}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? text.saving : text.save}
        </Button>
      </div>
    </form>
  );
}
