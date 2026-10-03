"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import FormField from "@/components/ui/FormField";
import { Select, TextInput, Textarea } from "@/components/ui/inputs";
import {
  SESSION_FIELD_ORDER,
  emptySessionForm,
  formFromSession,
  toSessionRequest,
  validateSessionForm,
  type SessionField,
  type SessionForm,
} from "@/lib/sessions/form";
import {
  HOST_TYPES,
  SESSION_FORMATS,
  type AssignableStaff,
  type DirectoryHostType,
  type Host,
  type InformationSession,
  type ProvinceRef,
} from "@/lib/sessions/types";
import { hasChanged, useReportDirty } from "@/lib/hooks/useReportDirty";
import { isUnscheduled } from "@/lib/sessions/format";
import { t } from "@/lib/messages";
import { createSessionAction, updateSessionAction } from "../../sessions-actions";
import HostDialog, { type HostDialogTarget } from "./HostDialog";

export type SessionDialogTarget = { kind: "create" } | { kind: "edit"; session: InformationSession };

type Props = {
  /** What the dialog is for, or null while it is closed. */
  target: SessionDialogTarget | null;
  campaignId: string;
  targetProvinces: ProvinceRef[];
  /** The active alumni and partners (officers are staff, not directory records). */
  hosts: Host[];
  assignable: AssignableStaff;
  onClose: () => void;
};

const text = t.sessions.form;

export default function SessionFormDialog({ target, campaignId, targetProvinces, hosts, assignable, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const scheduling = target?.kind === "edit" && isUnscheduled(target.session);

  return (
    <FormDialog
      open={target !== null}
      title={scheduling ? text.scheduleTitle : target?.kind === "edit" ? text.editTitle : text.createTitle}
      description={scheduling ? text.scheduleIntro : text.intro}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      size="lg"
    >
      {target && (
        <SessionFormBody
          target={target}
          campaignId={campaignId}
          targetProvinces={targetProvinces}
          hosts={hosts}
          assignable={assignable}
          onBusy={setBusy}
          onDirty={setDirty}
          onClose={onClose}
        />
      )}
    </FormDialog>
  );
}

type Option = { id: string; label: string };

function SessionFormBody({
  target,
  campaignId,
  targetProvinces,
  hosts,
  assignable,
  onBusy,
  onDirty,
  onClose,
}: Omit<Props, "target" | "onClose"> & {
  target: SessionDialogTarget;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const editing = target.kind === "edit" ? target.session : null;
  const scheduling = editing !== null && isUnscheduled(editing);
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState<SessionForm>(() => (editing ? formFromSession(editing, assignable.me.id) : emptySessionForm(assignable.me.id)));
  const [form, setForm] = useState<SessionForm>(initial);
  useReportDirty(hasChanged(form, initial), onDirty);
  const [errors, setErrors] = useState<Partial<Record<SessionField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [hostTarget, setHostTarget] = useState<HostDialogTarget | null>(null);
  // Hosts added from this form show up at once, before the page has re-read the directory.
  const [added, setAdded] = useState<Host[]>([]);
  const [pending, startTransition] = useTransition();

  const set = (field: SessionField, value: string) => setForm((f) => ({ ...f, [field]: value }));

  /** Staff to choose from: the caller first (always there), then the rest, then anyone the session already names. */
  const staffOptions = useMemo<Option[]>(() => {
    const options: Option[] = [{ id: assignable.me.id, label: text.me(assignable.me.name) }];
    for (const member of assignable.staff) {
      if (options.some((o) => o.id === member.id)) continue;
      options.push({ id: member.id, label: `${member.name} (${t.sessions.labels.role[member.role]})` });
    }
    const named = editing ? [editing.assignee, editing.host?.userId ? { id: editing.host.userId, name: editing.host.name } : null] : [];
    for (const person of named) {
      if (person && !options.some((o) => o.id === person.id)) options.push({ id: person.id, label: person.name });
    }
    return options;
  }, [assignable, editing]);

  /** Directory hosts of the chosen type. A host the session already has stays choosable even if it was switched off. */
  const hostOptions = useMemo<Option[]>(() => {
    if (form.hostType !== "Alumni" && form.hostType !== "Partner") return [];
    const all = [...hosts, ...added.filter((a) => !hosts.some((h) => h.id === a.id))];
    const options = all.filter((h) => h.type === form.hostType && h.isActive).map((h) => ({ id: h.id, label: h.name }));
    if (editing?.host?.hostId && editing.host.type === form.hostType && !options.some((o) => o.id === editing.host!.hostId)) {
      options.push({ id: editing.host.hostId, label: editing.host.name + text.hostSwitchedOff });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [hosts, added, form.hostType, editing]);

  function focusField(field: string) {
    (formRef.current?.elements.namedItem(field) as HTMLElement | null)?.focus();
  }

  function firstProblem(found: Partial<Record<string, string>>): string | undefined {
    return SESSION_FIELD_ORDER.find((f) => found[f]) ?? Object.keys(found)[0];
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    const found = validateSessionForm(form);
    setErrors(found);
    const first = firstProblem(found);
    if (first) {
      focusField(first);
      return;
    }

    const request = toSessionRequest(form);
    onBusy(true);
    startTransition(async () => {
      const result = editing
        ? await updateSessionAction(campaignId, editing.id, request)
        : await createSessionAction(campaignId, request);
      onBusy(false);
      if (result.ok) {
        onClose();
        return;
      }

      const fieldErrors = (result.fieldErrors ?? {}) as Partial<Record<SessionField, string>>;
      setErrors(fieldErrors);
      setMessage(Object.keys(fieldErrors).length > 0 ? null : result.message || t.sessions.failed);
      const firstError = firstProblem(fieldErrors);
      if (firstError) focusField(firstError);
    });
  }

  function changeHostType(type: string) {
    // Choosing another kind of host forgets the previous one: an id for one kind is never valid for another.
    setForm((f) => ({
      ...f,
      hostType: type,
      hostId: "",
      hostUserId: type === "Officer" ? f.assigneeId : "",
    }));
    setErrors((e) => ({ ...e, hostType: undefined, hostId: undefined, hostUserId: undefined }));
  }

  const needsVenue = form.format === "InPerson" || form.format === "Hybrid";
  const needsLink = form.format === "Online" || form.format === "Hybrid";
  const directoryType = form.hostType === "Alumni" || form.hostType === "Partner" ? (form.hostType as DirectoryHostType) : null;

  return (
    <>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {message && (
          <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
            {message}
          </p>
        )}
        {!assignable.directoryAvailable && (
          <p role="status" className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">
            {t.sessions.directoryDown}
          </p>
        )}

        <FormField label={text.title} error={errors.title}>
          {(control) => (
            <TextInput
              {...control}
              name="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={text.titlePlaceholder}
              maxLength={150}
              autoComplete="off"
            />
          )}
        </FormField>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label={text.date} error={errors.date}>
            {(control) => <TextInput {...control} name="date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />}
          </FormField>
          <FormField label={text.startTime} error={errors.startTime}>
            {(control) => <TextInput {...control} name="startTime" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />}
          </FormField>
          <FormField label={text.endTime} error={errors.endTime}>
            {(control) => <TextInput {...control} name="endTime" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />}
          </FormField>
        </div>

        <FormField label={text.format} error={errors.format}>
          {(control) => (
            <Select {...control} name="format" value={form.format} onChange={(e) => set("format", e.target.value)}>
              {SESSION_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {t.sessions.labels.format[format]}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {needsVenue && (
          <FormField label={text.venue} error={errors.venue}>
            {(control) => (
              <TextInput
                {...control}
                name="venue"
                value={form.venue}
                onChange={(e) => set("venue", e.target.value)}
                placeholder={text.venuePlaceholder}
                maxLength={200}
                autoComplete="off"
              />
            )}
          </FormField>
        )}

        {needsLink && (
          <FormField label={text.meetingLink} error={errors.meetingLink}>
            {(control) => (
              <TextInput
                {...control}
                name="meetingLink"
                type="url"
                value={form.meetingLink}
                onChange={(e) => set("meetingLink", e.target.value)}
                placeholder={text.meetingLinkPlaceholder}
                maxLength={500}
                autoComplete="off"
              />
            )}
          </FormField>
        )}

        <FormField label={text.province} optional hint={text.provinceHint} error={errors.provinceId}>
          {(control) => (
            <Select {...control} name="provinceId" value={form.provinceId} onChange={(e) => set("provinceId", e.target.value)}>
              <option value="">{text.provinceNone}</option>
              {targetProvinces.map((province) => (
                <option key={province.id} value={province.id}>
                  {province.name}
                </option>
              ))}
              {editing?.province && !targetProvinces.some((p) => p.id === editing.province!.id) && (
                <option value={editing.province.id}>{editing.province.name}</option>
              )}
            </Select>
          )}
        </FormField>

        <FormField label={text.notes} optional hint={text.notesHint} error={errors.notes}>
          {(control) => <Textarea {...control} name="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />}
        </FormField>

        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <FormField label={text.assignee} hint={text.assigneeHint} error={errors.assigneeId}>
            {(control) => (
              <Select {...control} name="assigneeId" value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
                {staffOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField label={text.hostType} error={errors.hostType}>
            {(control) => (
              <Select {...control} name="hostType" value={form.hostType} onChange={(e) => changeHostType(e.target.value)}>
                {HOST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.sessions.labels.hostType[type]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>

        {form.hostType === "Officer" && (
          <div className="flex flex-col gap-2">
            <FormField label={text.hostOfficer} hint={text.hostOfficerHint} error={errors.hostUserId}>
              {(control) => (
                <Select {...control} name="hostUserId" value={form.hostUserId} onChange={(e) => set("hostUserId", e.target.value)}>
                  <option value="">{text.choose}</option>
                  {staffOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button
              onClick={() => set("hostUserId", form.assigneeId)}
              disabled={!form.assigneeId || form.hostUserId === form.assigneeId}
              className="self-start"
            >
              {text.sameAsResponsible}
            </Button>
          </div>
        )}

        {directoryType && (
          <div className="flex flex-col gap-2">
            <FormField label={text.hostPick(t.sessions.labels.hostType[directoryType])} error={errors.hostId}>
              {(control) => (
                <Select {...control} name="hostId" value={form.hostId} onChange={(e) => set("hostId", e.target.value)}>
                  <option value="">{hostOptions.length === 0 ? text.hostNone : text.choose}</option>
                  {hostOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button onClick={() => setHostTarget({ kind: "create", type: directoryType })} className="self-start">
              {text.addHost(t.sessions.labels.hostType[directoryType])}
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-line pt-5">
          <Button onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? text.saving : scheduling ? text.scheduleSubmit : editing ? text.save : text.create}
          </Button>
        </div>
      </form>

      <HostDialog
        target={hostTarget}
        onClose={() => setHostTarget(null)}
        onSaved={(host) => {
          setAdded((list) => [...list, host]);
          setForm((f) => ({ ...f, hostType: host.type, hostId: host.id, hostUserId: "" }));
          setErrors((e) => ({ ...e, hostId: undefined }));
        }}
      />
    </>
  );
}
