"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";
import { Select, TextInput, Textarea } from "@/components/ui/inputs";
import { academicYearOptions } from "@/lib/campaigns/academic-years";
import { formatSavedTime } from "@/lib/campaigns/dates";
import type { CampaignDetail, CampaignStep, Province } from "@/lib/campaigns/types";
import {
  toInfoInput,
  validateDates,
  validateInfo,
  type InfoErrors,
  type InfoField,
  type InfoFormValues,
  type SaveMode,
} from "@/lib/campaigns/validation";
import { t } from "@/lib/messages";
import { saveCampaignInfoAction } from "../actions";
import ProvinceMultiSelect from "./ProvinceMultiSelect";
import StepTabs from "./StepTabs";
import TimelinePreview from "./TimelinePreview";

type Props = {
  campaign: CampaignDetail;
  provinces: Province[];
  /** Admin or manager, and the campaign is still a draft. */
  canEdit: boolean;
};

const FIELD_ORDER: InfoField[] = [
  "name",
  "academicYear",
  "description",
  "startDate",
  "endDate",
  "expectedCandidates",
  "seatsAvailable",
  "provinceIds",
];

function initialValues(campaign: CampaignDetail): InfoFormValues {
  return {
    name: campaign.name,
    academicYear: campaign.academicYear,
    description: campaign.description ?? "",
    startDate: campaign.startDate ?? "",
    endDate: campaign.endDate ?? "",
    expectedCandidates: campaign.expectedCandidates?.toString() ?? "",
    seatsAvailable: campaign.seatsAvailable?.toString() ?? "",
    provinceIds: campaign.provinceIds,
  };
}

/**
 * Step 1 of campaign setup.
 *
 * "Save draft" stores whatever is filled in and keeps the step In progress.
 * "Save and continue" needs everything valid, marks the step Complete and returns to
 * the setup overview. The same rules run here (for instant feedback, including the
 * end-date message while typing) and on the server (which is the authority; its
 * messages are shown under the field they belong to).
 */
export default function CampaignInfoForm({ campaign, provinces, canEdit }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const [values, setValues] = useState<InfoFormValues>(() => initialValues(campaign));
  // What was last saved, so the form can say plainly when it holds changes that are not saved yet.
  const [baseline, setBaseline] = useState<InfoFormValues>(() => initialValues(campaign));
  const [version, setVersion] = useState(campaign.version);
  const [savedAt, setSavedAt] = useState(campaign.infoSavedAt);
  const [steps, setSteps] = useState<CampaignStep[]>(campaign.steps);

  // Errors appear for a field once it has been left, or for all fields after a save attempt.
  const [touched, setTouched] = useState<ReadonlySet<InfoField>>(new Set());
  const [attempted, setAttempted] = useState<SaveMode | null>(null);
  // Messages from the server; cleared per field as soon as the user edits that field.
  const [serverErrors, setServerErrors] = useState<Partial<Record<InfoField, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const clientErrors = validateInfo(values, attempted ?? "draft");
  const liveDateErrors = validateDates(values.startDate, values.endDate, false);

  const errors: InfoErrors = {};
  for (const field of FIELD_ORDER) {
    const show = attempted !== null || touched.has(field);
    errors[field] = serverErrors[field] ?? (show ? clientErrors[field] : undefined);
  }
  // The design shows the end-date message as soon as the dates disagree, before any save.
  errors.endDate ??= liveDateErrors.endDate;

  function set<K extends InfoField>(field: K, value: InfoFormValues[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setServerErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }

  function touch(field: InfoField) {
    setTouched((s) => (s.has(field) ? s : new Set(s).add(field)));
  }

  function focusFirstInvalid(found: Partial<Record<InfoField, string>>) {
    const first = FIELD_ORDER.find((f) => found[f]);
    if (!first) return;
    // The province picker has no single input; its "+ Add province" button is named addProvince.
    const target = formRef.current?.elements.namedItem(first === "provinceIds" ? "addProvince" : first);
    (target as HTMLElement | null)?.focus();
  }

  function save(mode: SaveMode) {
    if (pending) return;

    const found = validateInfo(values, mode);
    setAttempted(mode);
    setServerErrors({});
    setBanner(null);
    if (Object.keys(found).length > 0) {
      setBanner(t.info.fixErrors);
      focusFirstInvalid(found);
      return;
    }

    startTransition(async () => {
      const result = await saveCampaignInfoAction(campaign.id, mode, toInfoInput(values, version));

      if (result.ok) {
        setBaseline(values);
        setVersion(result.data.version);
        setSavedAt(result.data.infoSavedAt);
        setSteps(result.data.steps);
        if (mode === "complete") router.push(`/admin/campaigns/${campaign.id}`);
        return;
      }

      const fromServer = (result.fieldErrors ?? {}) as Partial<Record<InfoField, string>>;
      setServerErrors(fromServer);
      setBanner(Object.keys(fromServer).length > 0 ? t.info.fixErrors : result.message);
      focusFirstInvalid(fromServer);
    });
  }

  const savedTime = formatSavedTime(savedAt);
  const unsaved = canEdit && JSON.stringify(values) !== JSON.stringify(baseline);

  return (
    <div className="flex flex-col gap-6">
      <StepTabs steps={steps} current="CampaignInfo" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => {
            // Enter in any field runs the primary action, "Save and continue".
            event.preventDefault();
            if (canEdit) save("complete");
          }}
          className="rounded-2xl border border-line bg-surface shadow-card"
        >
          {!canEdit && (
            <p className="rounded-t-2xl bg-warning-soft px-6 py-3 text-sm text-ink">
              {campaign.status === "Draft" ? t.info.readOnly : t.info.notDraft}
            </p>
          )}
          {banner && (
            <p role="alert" className="mx-6 mt-6 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
              {banner}
            </p>
          )}

          {/* A disabled fieldset disables every control inside it, which is what read-only needs.
              It is not disabled while saving: that would drop keyboard focus from the field. */}
          <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0">
            <div className="flex flex-col gap-8 p-6">
              <section aria-labelledby="identity-title" className="flex flex-col gap-5">
                <h2 id="identity-title" className="flex items-center gap-2 text-lg font-bold text-ink before:h-5 before:w-1 before:rounded-full before:bg-brand-blue">
                  {t.info.identity}
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label={t.info.name} error={errors.name}>
                    {(control) => (
                      <TextInput
                        {...control}
                        name="name"
                        value={values.name}
                        onChange={(e) => set("name", e.target.value)}
                        onBlur={() => touch("name")}
                        autoComplete="off"
                      />
                    )}
                  </FormField>
                  <FormField label={t.info.academicYear} error={errors.academicYear}>
                    {(control) => (
                      <Select
                        {...control}
                        name="academicYear"
                        value={values.academicYear}
                        onChange={(e) => set("academicYear", e.target.value)}
                        onBlur={() => touch("academicYear")}
                      >
                        {academicYearOptions(new Date(), values.academicYear).map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                </div>
                <FormField label={t.info.description} error={errors.description}>
                  {(control) => (
                    <Textarea
                      {...control}
                      name="description"
                      rows={3}
                      value={values.description}
                      onChange={(e) => set("description", e.target.value)}
                      onBlur={() => touch("description")}
                    />
                  )}
                </FormField>
              </section>

              <section aria-labelledby="dates-title" className="flex flex-col gap-5 border-t border-line pt-8">
                <h2 id="dates-title" className="flex items-center gap-2 text-lg font-bold text-ink before:h-5 before:w-1 before:rounded-full before:bg-brand-blue">
                  {t.info.dates}
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label={t.info.startDate} hint={t.info.startDateHint} error={errors.startDate}>
                    {(control) => (
                      <TextInput
                        {...control}
                        type="date"
                        name="startDate"
                        value={values.startDate}
                        onChange={(e) => set("startDate", e.target.value)}
                        onBlur={() => touch("startDate")}
                      />
                    )}
                  </FormField>
                  <FormField label={t.info.endDate} error={errors.endDate}>
                    {(control) => (
                      <TextInput
                        {...control}
                        type="date"
                        name="endDate"
                        value={values.endDate}
                        onChange={(e) => set("endDate", e.target.value)}
                        onBlur={() => touch("endDate")}
                      />
                    )}
                  </FormField>
                </div>
              </section>

              <section aria-labelledby="targets-title" className="flex flex-col gap-5 border-t border-line pt-8">
                <h2 id="targets-title" className="flex items-center gap-2 text-lg font-bold text-ink before:h-5 before:w-1 before:rounded-full before:bg-brand-blue">
                  {t.info.targets}
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    label={t.info.expectedCandidates}
                    hint={t.info.expectedCandidatesHint}
                    error={errors.expectedCandidates}
                  >
                    {(control) => (
                      <TextInput
                        {...control}
                        name="expectedCandidates"
                        inputMode="numeric"
                        placeholder={t.info.expectedCandidatesPlaceholder}
                        value={values.expectedCandidates}
                        onChange={(e) => set("expectedCandidates", e.target.value)}
                        onBlur={() => touch("expectedCandidates")}
                        autoComplete="off"
                      />
                    )}
                  </FormField>
                  <FormField label={t.info.seatsAvailable} hint={t.info.seatsAvailableHint} error={errors.seatsAvailable}>
                    {(control) => (
                      <TextInput
                        {...control}
                        name="seatsAvailable"
                        inputMode="numeric"
                        placeholder={t.info.seatsAvailablePlaceholder}
                        value={values.seatsAvailable}
                        onChange={(e) => set("seatsAvailable", e.target.value)}
                        onBlur={() => touch("seatsAvailable")}
                        autoComplete="off"
                      />
                    )}
                  </FormField>
                </div>

                <FormField label={t.info.provinces} hint={t.info.provincesHint} error={errors.provinceIds}>
                  {(control) => (
                    <ProvinceMultiSelect
                      id={control.id}
                      provinces={provinces}
                      value={values.provinceIds}
                      onChange={(ids) => {
                        set("provinceIds", ids);
                        touch("provinceIds");
                      }}
                      invalid={control["aria-invalid"]}
                      describedBy={control["aria-describedby"]}
                      disabled={!canEdit}
                    />
                  )}
                </FormField>
              </section>
            </div>
          </fieldset>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-b-2xl border-t border-line bg-surface/95 px-6 py-4 backdrop-blur">
            <p role="status" aria-live="polite" className="text-sm text-ink-muted" suppressHydrationWarning>
              {unsaved ? (
                <span className="inline-flex items-center gap-2 font-medium text-ink">
                  <span aria-hidden="true" className="size-2 rounded-full bg-brand-orange" />
                  {t.info.unsaved}
                </span>
              ) : (
                savedTime && t.info.draftSaved(savedTime)
              )}
            </p>

            {canEdit ? (
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => save("draft")} disabled={pending}>
                  {pending ? t.info.savingDraft : t.info.saveDraft}
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? t.info.savingContinue : t.info.saveContinue}
                </Button>
              </div>
            ) : (
              <Link href={`/admin/campaigns/${campaign.id}`} className="text-sm font-semibold text-primary hover:underline focus-ring">
                {t.info.back}
              </Link>
            )}
          </div>
        </form>

        <div className="flex flex-col gap-4">
          <TimelinePreview startDate={values.startDate} endDate={values.endDate} />
          <aside className="rounded-2xl bg-warning-soft p-5">
            <h2 className="text-[15px] font-bold text-ink">{t.tip.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t.tip.body}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
