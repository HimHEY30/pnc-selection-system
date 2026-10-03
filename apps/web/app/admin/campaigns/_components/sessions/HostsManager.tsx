"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/inputs";
import type { DirectoryHostType, Host } from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import { setHostActiveAction } from "../../sessions-actions";
import HostDialog, { type HostDialogTarget } from "./HostDialog";

type Props = {
  /** Every host in the directory, switched-off ones included; this component decides what to show. */
  hosts: Host[];
  /** The signed-in person may add, change and switch off hosts (admin or manager). */
  canManage: boolean;
};

const text = t.sessions.hosts;

/**
 * The alumni and partner directory: who can run an information session besides the officers. Managers add, edit
 * and switch hosts off or on; everyone else reads. A host is switched off, never deleted, so the sessions it ran
 * keep it. Like the sessions list, it holds no copy of the data: actions refresh the page.
 */
export default function HostsManager({ hosts, canManage }: Props) {
  const [type, setType] = useState<"" | DirectoryHostType>("");
  const [showOff, setShowOff] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "create"; type: DirectoryHostType } | { kind: "edit"; id: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dialogTarget: HostDialogTarget | null = (() => {
    if (!dialog) return null;
    if (dialog.kind === "create") return dialog;
    const host = hosts.find((h) => h.id === dialog.id);
    return host ? { kind: "edit", host } : null;
  })();

  const switchedOff = hosts.filter((h) => !h.isActive).length;
  const shown = hosts.filter((h) => (!type || h.type === type) && (showOff || h.isActive));

  function toggle(host: Host) {
    if (pending) return;
    setMessage(null);
    setWorkingId(host.id);
    startTransition(async () => {
      const result = await setHostActiveAction(host.id, !host.isActive);
      setWorkingId(null);
      if (!result.ok) setMessage(result.message || text.failed);
    });
  }

  const addButtons = canManage && (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" onClick={() => setDialog({ kind: "create", type: "Alumni" })}>
        {text.addAlumnus}
      </Button>
      <Button variant="primary" onClick={() => setDialog({ kind: "create", type: "Partner" })}>
        {text.addPartner}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {!canManage && <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">{text.readOnly}</p>}

      {message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      {hosts.length === 0 ? (
        <EmptyState compact title={text.empty} description={text.emptyDescription} action={addButtons || undefined} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                {text.type}
                <Select value={type} onChange={(e) => setType(e.target.value as "" | DirectoryHostType)} className="min-w-40 py-2 text-sm">
                  <option value="">{t.sessions.filters.all}</option>
                  <option value="Alumni">{t.sessions.labels.hostType.Alumni}</option>
                  <option value="Partner">{t.sessions.labels.hostType.Partner}</option>
                </Select>
              </label>
              {switchedOff > 0 && (
                <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
                  <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} className="h-4 w-4 accent-primary" />
                  {text.showOff} ({switchedOff})
                </label>
              )}
            </div>
            {addButtons}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-6 py-10 text-center text-sm text-ink-muted">{text.noMatch}</p>
          ) : (
            <ul aria-label={text.listLabel} className="flex flex-col gap-3">
              {shown.map((host) => (
                <li key={host.id} aria-labelledby={`host-${host.id}`} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id={`host-${host.id}`} className={`text-[17px] font-bold ${host.isActive ? "text-ink" : "text-ink-muted"}`}>
                        {host.name}
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {t.sessions.labels.hostType[host.type]}
                        {host.partnerKind ? ` · ${t.sessions.labels.partnerKind[host.partnerKind]}` : ""}
                        {host.contactPerson ? ` · ${host.contactPerson}` : ""}
                      </p>
                      {(host.phone || host.email) && (
                        <p className="mt-1 text-sm text-ink">
                          {host.phone}
                          {host.phone && host.email && " · "}
                          {host.email}
                        </p>
                      )}
                    </div>
                    {!host.isActive && (
                      <span className="rounded-full bg-neutral-soft px-2.5 py-1 text-xs font-semibold text-ink-muted">{text.off}</span>
                    )}
                  </div>

                  {canManage && (
                    <div role="group" aria-label={text.actionsFor(host.name)} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                      <Button onClick={() => setDialog({ kind: "edit", id: host.id })}>{text.edit}</Button>
                      <Button onClick={() => toggle(host)} disabled={pending && workingId === host.id}>
                        {host.isActive ? text.switchOff : text.switchOn}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[13px] text-ink-muted">{text.offHint}</p>
        </>
      )}

      <HostDialog target={dialogTarget} onClose={() => setDialog(null)} onSaved={() => {}} />
    </div>
  );
}
