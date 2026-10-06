"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField from "@/components/ui/FormField";
import { Select, TextInput, Textarea } from "@/components/ui/inputs";
import { academicYearOptions, defaultAcademicYear } from "@/lib/campaigns/academic-years";
import { partsInOrder, validateCopy } from "@/lib/campaigns/copy";
import { COPY_PART_KEYS, type CampaignSummary, type CopyPartKey, type CopyPreview, type CreatedCampaign } from "@/lib/campaigns/types";
import { validateCreate, type CreateField } from "@/lib/campaigns/validation";
import { t } from "@/lib/messages";
import { createCampaignAction, loadCopyPreviewAction } from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The campaigns a new one can copy from. Empty means the copy option is shown but cannot be chosen. */
  copySources?: CampaignSummary[];
};

type Errors = Partial<Record<CreateField | "startMode" | "copyFrom.sourceCampaignId" | "copyFrom.parts", string>>;

/** What is known about the chosen source campaign's copyable parts. */
type PreviewState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: CopyPreview }
  | { state: "error"; message: string };

const text = t.create;

// Selected and unselected look of a "how to start" card.
const SELECTED = "border border-primary bg-primary-soft ring-1 ring-primary";
const UNSELECTED = "border border-line transition-colors duration-150 hover:border-primary/50";

/**
 * "Create campaign" as a native <dialog> opened with showModal(). The browser then
 * provides what a modal needs: focus moves into the dialog and stays there (a focus
 * trap), the page behind becomes inert, Escape closes it, and focus returns to the
 * button that opened it.
 *
 * It holds the form state, so the provider mounts a fresh copy (new `key`) each time
 * it is opened, which resets the fields without any reset code.
 *
 * Starting from a copy: pick the campaign, see what it has (with counts), and tick what to carry over, one by
 * one. Once the campaign exists, the dialog says how each part went before the manager opens it.
 */
export default function CreateCampaignDialog({ open, onClose, copySources = [] }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const partsRef = useRef<HTMLFieldSetElement>(null);

  const [name, setName] = useState("");
  const [initialYear] = useState(() => defaultAcademicYear());
  const [academicYear, setAcademicYear] = useState(initialYear);
  const [description, setDescription] = useState("");
  const [startMode, setStartMode] = useState<"scratch" | "copy">("scratch");
  const [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ state: "idle" });
  const [ticked, setTicked] = useState<ReadonlySet<CopyPartKey>>(new Set());
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCampaign | null>(null);
  const [pending, startTransition] = useTransition();
  // The source asked for last, so an answer that arrives late for an earlier choice is ignored.
  const latestSource = useRef("");

  const canCopy = copySources.length > 0;

  // Something typed or chosen that closing would lose. Once the campaign exists there is nothing left to lose.
  const dirty = !created && (name.trim() !== "" || description.trim() !== "" || academicYear !== initialYear || sourceId !== "");
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // Every way of closing by hand (Escape, the X, the backdrop) comes through here; Cancel is an explicit "throw it away".
  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else dialogRef.current?.close();
  };

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

  function chooseSource(id: string) {
    latestSource.current = id;
    setSourceId(id);
    setTicked(new Set());
    setErrors((e) => ({ ...e, "copyFrom.sourceCampaignId": undefined, "copyFrom.parts": undefined }));
    if (!id) {
      setPreview({ state: "idle" });
      return;
    }

    setPreview({ state: "loading" });
    void loadCopyPreviewAction(id).then((result) => {
      if (latestSource.current !== id) return;
      setPreview(result.ok ? { state: "ready", data: result.data } : { state: "error", message: result.message });
    });
  }

  function toggle(key: CopyPartKey, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    setErrors((e) => ({ ...e, "copyFrom.parts": undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const found: Errors = validateCreate({ name, academicYear, description });
    if (startMode === "copy") {
      const copyErrors = validateCopy(sourceId, ticked);
      if (copyErrors.source) found["copyFrom.sourceCampaignId"] = copyErrors.source;
      if (copyErrors.parts) found["copyFrom.parts"] = copyErrors.parts;
    }
    setErrors(found);
    setFormError(null);

    const firstInvalid = (["name", "academicYear", "description"] as const).find((f) => found[f]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }
    if (found["copyFrom.sourceCampaignId"]) {
      focusField("copyFrom.sourceCampaignId");
      return;
    }
    if (found["copyFrom.parts"]) {
      partsRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const result = await createCampaignAction({
        name,
        academicYear,
        description,
        startMode,
        ...(startMode === "copy" && { copyFrom: { sourceCampaignId: sourceId, parts: partsInOrder(ticked) } }),
      });
      if (result.ok) {
        // A copy says how each part went before the manager moves on; a new campaign goes straight to its setup.
        if (startMode === "copy" && result.data.copyResults) {
          setCreated(result.data);
          return;
        }
        onClose();
        router.push(`/admin/campaigns/${result.data.id}`);
        return;
      }

      setErrors((result.fieldErrors ?? {}) as Errors);
      setFormError(result.fieldErrors ? null : result.message);
      const first = Object.keys(result.fieldErrors ?? {})[0];
      if (first === "copyFrom.parts") partsRef.current?.focus();
      else if (first) focusField(first);
    });
  }

  function openCreated() {
    if (!created) return;
    onClose();
    router.push(`/admin/campaigns/${created.id}`);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-campaign-title"
      // React passes a dialog's close and cancel events up to the dialog around it, though the browser does not:
      // without the target check, answering the discard question would close this dialog a second time.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Esc must not discard a save that is in flight, and asks before it discards typing.
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        if (pending) event.preventDefault();
        else if (dirty) {
          event.preventDefault();
          setConfirmingDiscard(true);
        }
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current && !pending) requestClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[580px] rounded-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
    >
      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto px-8 pb-6 pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="create-campaign-title" className="text-xl font-bold">
                {created ? text.created.title : text.title}
              </h2>
              <p className="mt-1 text-[15px] text-ink-muted">{created ? text.created.intro : text.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t.common.close}
              className="-mr-2 -mt-1 rounded-lg p-2 text-ink-muted transition hover:bg-canvas focus-ring"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {created ? (
            <CopyResults created={created} />
          ) : (
            <>
              {formError && (
                <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
                  {formError}
                </p>
              )}

              <div className="mt-6 flex flex-col gap-5">
                <FormField label={text.name} hint={text.nameHint} error={errors.name}>
                  {(control) => (
                    <TextInput
                      {...control}
                      name="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={text.namePlaceholder}
                      maxLength={150}
                      autoComplete="off"
                    />
                  )}
                </FormField>

                <FormField label={text.academicYear} error={errors.academicYear}>
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

                <FormField label={text.description} optional error={errors.description}>
                  {(control) => (
                    <Textarea {...control} name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
                  )}
                </FormField>

                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">{text.howToStart}</legend>
                  <div className="flex flex-col gap-2">
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                        startMode === "scratch" ? SELECTED : UNSELECTED
                      }`}
                    >
                      <input
                        type="radio"
                        name="startMode"
                        value="scratch"
                        checked={startMode === "scratch"}
                        onChange={() => setStartMode("scratch")}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>
                        <span className="block text-[15px] font-semibold">{text.scratch}</span>
                        <span className="block text-sm text-ink-muted">{text.scratchHint}</span>
                      </span>
                    </label>

                    <label
                      className={`flex items-start gap-3 rounded-xl px-4 py-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                        canCopy ? `cursor-pointer ${startMode === "copy" ? SELECTED : UNSELECTED}` : `cursor-not-allowed ${UNSELECTED}`
                      }`}
                    >
                      <input
                        type="radio"
                        name="startMode"
                        value="copy"
                        checked={startMode === "copy"}
                        onChange={() => setStartMode("copy")}
                        disabled={!canCopy}
                        aria-describedby="copy-hint"
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>
                        <span className={`block text-[15px] font-semibold ${canCopy ? "" : "text-ink-muted"}`}>{text.copy}</span>
                        <span id="copy-hint" className="block text-sm text-ink-muted">
                          {canCopy ? text.copyHint : text.copyUnavailable}
                        </span>
                      </span>
                    </label>
                  </div>
                  {errors.startMode && <p className="mt-1.5 text-[13px] text-danger-text">{errors.startMode}</p>}
                </fieldset>

                {startMode === "copy" && (
                  <div className="motion-rise flex flex-col gap-5 rounded-xl border border-line bg-canvas px-4 py-4">
                    <FormField label={text.copyFrom} error={errors["copyFrom.sourceCampaignId"]}>
                      {(control) => (
                        <Select
                          {...control}
                          name="copyFrom.sourceCampaignId"
                          value={sourceId}
                          onChange={(e) => chooseSource(e.target.value)}
                        >
                          <option value="">{text.copyFromChoose}</option>
                          {copySources.map((c) => (
                            <option key={c.id} value={c.id}>
                              {text.copySourceOption(c.name, c.academicYear, t.status[c.status])}
                            </option>
                          ))}
                        </Select>
                      )}
                    </FormField>

                    {preview.state === "loading" && (
                      <p role="status" className="text-sm text-ink-muted">
                        {text.copyChecking}
                      </p>
                    )}
                    {preview.state === "error" && (
                      <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
                        {preview.message}
                      </p>
                    )}
                    {preview.state === "ready" && (
                      <fieldset ref={partsRef} tabIndex={-1} aria-describedby="copy-parts-hint" className="focus:outline-none">
                        <legend className="mb-1 text-sm font-semibold">{text.copyPartsLegend}</legend>
                        <p id="copy-parts-hint" className="mb-2 text-[13px] text-ink-muted">
                          {text.copyPartsHint}
                        </p>
                        <div className="flex flex-col gap-2">
                          {COPY_PART_KEYS.flatMap((key) => {
                            const part = preview.data.parts.find((p) => p.key === key);
                            if (!part) return [];
                            return (
                              <label
                                key={key}
                                className={`flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                                  part.available ? "cursor-pointer" : "cursor-not-allowed"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  name={`copyPart-${key}`}
                                  checked={ticked.has(key)}
                                  disabled={!part.available}
                                  onChange={(e) => toggle(key, e.target.checked)}
                                  className="mt-1 size-4 accent-primary"
                                />
                                <span>
                                  <span className={`block text-[15px] font-semibold ${part.available ? "" : "text-ink-muted"}`}>
                                    {text.copyPartLabels[key]}
                                    {part.available && <span className="font-normal text-ink-muted"> · {text.copyCount[key](part.count)}</span>}
                                  </span>
                                  {part.note && <span className="block text-sm text-ink-muted">{part.note}</span>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {errors["copyFrom.parts"] && (
                          <p role="alert" className="mt-1.5 text-[13px] text-danger-text">
                            {errors["copyFrom.parts"]}
                          </p>
                        )}
                      </fieldset>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-line px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
          {created ? (
            <Button type="button" variant="primary" onClick={openCreated} autoFocus>
              {text.created.open}
            </Button>
          ) : (
            <>
              <Button onClick={() => dialogRef.current?.close()} disabled={pending}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? text.submitting : text.submit}
              </Button>
            </>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={open && confirmingDiscard}
        title={t.common.discard.title}
        description={t.common.discard.body}
        confirmLabel={t.common.discard.confirm}
        cancelLabel={t.common.discard.keep}
        destructive
        onConfirm={() => {
          setConfirmingDiscard(false);
          dialogRef.current?.close();
        }}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </dialog>
  );
}

/** How each copied part went. A part that did not copy, or copied with something to check, says why. */
function CopyResults({ created }: { created: CreatedCampaign }) {
  return (
    <ul aria-label={text.created.listLabel} className="mt-6 flex flex-col gap-2">
      {(created.copyResults ?? []).map((result) => (
        <li
          key={result.part}
          className={`rounded-xl border px-4 py-3 ${
            result.outcome === "Copied" ? "border-line" : result.outcome === "Partly" ? "border-brand-orange bg-warning-soft" : "border-danger bg-danger-soft"
          }`}
        >
          <p className="text-[15px] font-semibold">
            {text.copyPartLabels[result.part]}
            {result.outcome !== "Failed" && <span className="font-normal text-ink-muted"> · {text.copyCount[result.part](result.count)}</span>}
          </p>
          <p className={`text-sm ${result.outcome === "Copied" ? "text-ink-muted" : "text-ink"}`}>
            {result.outcome === "Failed" ? "✕ " : result.outcome === "Partly" ? "! " : "✓ "}
            {text.created.outcome[result.outcome]}
          </p>
          {result.issues.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
