"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField from "@/components/ui/FormField";
import { TextInput } from "@/components/ui/inputs";
import type { ActionResult } from "@/lib/campaigns/types";
import type { ExamSetup, Subject } from "@/lib/eligibility/types";
import { t } from "@/lib/messages";

type Props = {
  subjects: Subject[];
  maxSubjects: number;
  /** How many rules on the page use each subject (saved or not), by subject key. A used subject cannot be removed. */
  usage: Record<string, number>;
  canEdit: boolean;
  onAdd: (name: string) => Promise<ActionResult<ExamSetup>>;
  onRename: (key: string, name: string) => Promise<ActionResult<ExamSetup>>;
  onRemove: (key: string) => Promise<ActionResult<ExamSetup>>;
  /** The server accepted a change and sent back the new list and catalogue. */
  onChanged: (setup: ExamSetup) => void;
};

type Focus = { kind: "add" } | { kind: "rename"; key: string };

const text = t.eligibility.ui.subjects;

/**
 * The campaign's exam subjects: add one, rename one, remove one. Unlike the rules, each change is
 * saved at once (the rule builder needs the new subject straight away), so the panel talks to the
 * server itself and hands the answer up. A subject that rules use cannot be removed.
 */
export default function SubjectsPanel({ subjects, maxSubjects, usage, canEdit, onAdd, onRename, onRemove, onChanged }: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string>();
  const [editing, setEditing] = useState<{ key: string; name: string } | null>(null);
  const [editError, setEditError] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<Subject | null>(null);
  const [busy, setBusy] = useState<"add" | "rename" | "remove" | null>(null);
  const focusNext = useRef<Focus | null>(null);

  const full = subjects.length >= maxSubjects;

  // After the list has re-rendered, put focus somewhere sensible: a removed row is gone, a renamed
  // row has swapped its input back for its buttons. Buttons are disabled while a request runs, and
  // a disabled button cannot take focus, so this waits until the request has finished.
  useEffect(() => {
    const focus = focusNext.current;
    if (!focus || pending) return;
    focusNext.current = null;
    const target =
      focus.kind === "add"
        ? containerRef.current?.querySelector<HTMLElement>("[data-subject-input]")
        : containerRef.current?.querySelector<HTMLElement>(`[data-rename="${focus.key}"]`);
    target?.focus();
  }, [subjects, editing, pending]);

  function submitAdd(event: FormEvent) {
    event.preventDefault();
    if (pending || full) return;
    setMessage(null);
    setAddError(undefined);
    setBusy("add");

    startTransition(async () => {
      const result = await onAdd(newName);
      setBusy(null);
      if (result.ok) {
        setNewName("");
        focusNext.current = { kind: "add" };
        onChanged(result.data);
      } else if (result.fieldErrors?.name) {
        setAddError(result.fieldErrors.name);
      } else {
        setMessage(result.message || text.failed);
      }
    });
  }

  function submitRename(event: FormEvent) {
    event.preventDefault();
    if (pending || !editing) return;
    setMessage(null);
    setEditError(undefined);
    const { key, name } = editing;
    setBusy("rename");

    startTransition(async () => {
      const result = await onRename(key, name);
      setBusy(null);
      if (result.ok) {
        focusNext.current = { kind: "rename", key };
        setEditing(null);
        onChanged(result.data);
      } else if (result.fieldErrors?.name) {
        setEditError(result.fieldErrors.name);
      } else {
        setMessage(result.message || text.failed);
      }
    });
  }

  function confirmRemove() {
    const subject = toRemove;
    setToRemove(null);
    if (!subject || pending) return;
    setMessage(null);
    setBusy("remove");

    startTransition(async () => {
      const result = await onRemove(subject.key);
      setBusy(null);
      if (result.ok) {
        focusNext.current = { kind: "add" };
        onChanged(result.data);
      } else {
        setMessage(result.message || text.failed);
      }
    });
  }

  return (
    <section ref={containerRef} aria-labelledby="subjects-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="subjects-title" className="text-[17px] font-bold text-ink">
          {text.title}
        </h2>
        <p className="text-sm text-ink-muted">{text.count(subjects.length, maxSubjects)}</p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{text.intro}</p>
      {!canEdit && <p className="mt-3 rounded-lg bg-warning-soft px-4 py-2.5 text-sm text-ink">{text.readOnly}</p>}

      {subjects.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{text.empty}</p>
      ) : (
        <ul aria-label={text.listLabel} className="mt-4 flex flex-col gap-2">
          {subjects.map((subject) => {
            const used = usage[subject.key] ?? 0;
            const isEditing = editing?.key === subject.key;

            return (
              <li key={subject.key} className="rounded-lg border border-line px-3 py-2">
                {isEditing ? (
                  <form onSubmit={submitRename} noValidate className="flex flex-col gap-2">
                    <FormField label={text.renameField(subject.name)} error={editError}>
                      {(control) => (
                        <TextInput
                          {...control}
                          value={editing.name}
                          maxLength={80}
                          autoComplete="off"
                          autoFocus
                          onChange={(e) => setEditing({ key: subject.key, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditing(null);
                              setEditError(undefined);
                              focusNext.current = { kind: "rename", key: subject.key };
                            }
                          }}
                        />
                      )}
                    </FormField>
                    <div className="flex gap-2">
                      <Button type="submit" variant="primary" disabled={pending}>
                        {busy === "rename" ? text.saving : text.save}
                      </Button>
                      <Button
                        disabled={pending}
                        onClick={() => {
                          setEditing(null);
                          setEditError(undefined);
                          focusNext.current = { kind: "rename", key: subject.key };
                        }}
                      >
                        {text.cancel}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-[15px] font-semibold text-ink">{subject.name}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      {used > 0 && (
                        <span title={text.inUse} className="rounded-full bg-neutral-soft px-2.5 py-1 text-xs font-semibold text-ink-muted">
                          {text.usedBy(used)}
                        </span>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            data-rename={subject.key}
                            aria-label={text.renameLabel(subject.name)}
                            disabled={pending || editing !== null}
                            onClick={() => {
                              setMessage(null);
                              setEditError(undefined);
                              setEditing({ key: subject.key, name: subject.name });
                            }}
                          >
                            {text.rename}
                          </Button>
                          <Button
                            aria-label={text.removeLabel(subject.name)}
                            title={used > 0 ? text.inUse : undefined}
                            disabled={pending || used > 0}
                            onClick={() => setToRemove(subject)}
                          >
                            {text.remove}
                          </Button>
                        </>
                      )}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {subjects.length < 2 && <p className="mt-3 text-[13px] text-ink-muted">{text.totalsHint}</p>}

      {canEdit && (
        <form onSubmit={submitAdd} noValidate className="mt-4 flex flex-wrap items-start gap-3">
          <FormField label={text.nameLabel} error={addError} hint={full ? text.full(maxSubjects) : undefined} className="min-w-[14rem] flex-1">
            {(control) => (
              <TextInput
                {...control}
                data-subject-input=""
                value={newName}
                maxLength={80}
                placeholder={text.namePlaceholder}
                autoComplete="off"
                disabled={full}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setAddError(undefined);
                }}
              />
            )}
          </FormField>
          <Button type="submit" disabled={pending || full} className="mt-[1.7rem]">
            {busy === "add" ? text.adding : text.add}
          </Button>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      {canEdit && subjects.length > 0 && <p className="mt-4 text-[13px] text-ink-muted">{text.renameNote}</p>}

      <ConfirmDialog
        open={toRemove !== null}
        destructive
        title={toRemove ? text.removeTitle(toRemove.name) : ""}
        description={toRemove ? text.removeBody(toRemove.name) : ""}
        confirmLabel={text.confirmRemove}
        cancelLabel={text.keep}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </section>
  );
}
