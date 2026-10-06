"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import FormField from "@/components/ui/FormField";
import { TextInput } from "@/components/ui/inputs";
import { formatSavedTime } from "@/lib/campaigns/dates";
import type { CampaignStep } from "@/lib/campaigns/types";
import {
  allRules,
  createDraftReducer,
  initialState,
  isDirty,
  snapshot,
  toRequest,
  type DraftAction,
  type DraftGroup,
  type DraftRule,
} from "@/lib/eligibility/draft";
import { describeRule } from "@/lib/eligibility/phrases";
import type { ExamSetup, RuleSetData } from "@/lib/eligibility/types";
import { validateRuleSet, type ErrorMap, type SaveMode } from "@/lib/eligibility/validation";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import { t } from "@/lib/messages";
import {
  addSubjectAction,
  loadSuggestedRulesAction,
  removeSubjectAction,
  renameSubjectAction,
  saveEligibilityAction,
  testEligibilityAction,
} from "../../eligibility-actions";
import StepTabs from "../StepTabs";
import RuleGroupCard from "./RuleGroupCard";
import SubjectsPanel from "./SubjectsPanel";
import SummaryPanel from "./SummaryPanel";
import TestPanel from "./TestPanel";

type Props = {
  campaignId: string;
  initial: RuleSetData;
  /** The campaign's exam subjects and the fields its rules can check. */
  examSetup: ExamSetup;
  steps: CampaignStep[];
  /** Admin or manager, and the campaign is still a draft. */
  canEdit: boolean;
};

const ui = t.eligibility.ui;
const RULE_KEY = /^rules\.([0-9a-f-]{36})/i;

/** How many of these rules check the field with this key. */
const countUses = (groups: { rules: { fieldKey: string }[] }[], fieldKey: string): number =>
  groups.reduce((n, g) => n + g.rules.filter((r) => r.fieldKey === fieldKey).length, 0);

/**
 * Step 2 of campaign setup: build the eligibility rules.
 *
 * Everything the user does changes a working copy in this component; nothing is stored until
 * "Save draft" or "Save and continue" (and leaving with unsaved work asks first). The same
 * checks run here, for inline messages, and on the server, which also finds contradictions.
 */
export default function EligibilityBuilder({ campaignId, initial, examSetup, steps: initialSteps, canEdit }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();

  // The subjects can change while the page is open (they are saved at once), and so does the catalogue
  // that follows from them: a subject added here is a field the rules can use straight away.
  const [setup, setSetup] = useState(examSetup);
  const catalogue = setup.catalogue;

  const provinces = initial.targetProvinces;
  const ctx = useMemo(() => ({ catalogue, provinces }), [catalogue, provinces]);
  const reduce = useMemo(
    () =>
      createDraftReducer({
        catalogue,
        provinces,
        campaignStartDate: initial.campaignStartDate,
        newId: () => crypto.randomUUID(),
      }),
    [catalogue, provinces, initial.campaignStartDate],
  );
  const [state, rawDispatch] = useReducer(reduce, undefined, () => initialState(initial, { catalogue, provinces }));

  const [steps, setSteps] = useState(initialSteps);
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [serverErrors, setServerErrors] = useState<ErrorMap>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = useState<SaveMode | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<DraftRule | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<DraftGroup | null>(null);

  const dirty = isDirty(state);
  const guard = useUnsavedChangesGuard(dirty);

  // Any edit makes the server's messages out of date (they were about the version it was sent),
  // so they go; the browser's own checks take over.
  const dispatch = useCallback((action: DraftAction) => {
    setServerErrors({});
    rawDispatch(action);
  }, []);

  // ---------- Errors ----------

  const localErrors = validateRuleSet(state, catalogue, provinces, attempted ?? "draft");

  /**
   * The message to show for an input. A rule's own messages wait until the user has been in that
   * rule or has tried to save; everything else (group names, the set as a whole) shows at once.
   */
  const errorFor = (key: string): string | undefined => {
    if (serverErrors[key]) return serverErrors[key];
    const local = localErrors[key];
    if (!local) return undefined;
    const ruleId = RULE_KEY.exec(key)?.[1];
    return ruleId && attempted === null && !touched.has(ruleId) ? undefined : local;
  };

  const touchRule = useCallback((ruleId: string) => setTouched((s) => (s.has(ruleId) ? s : new Set(s).add(ruleId))), []);

  // After the page has re-rendered with the messages, move focus to the first input that has one.
  useEffect(() => {
    if (focusTick > 0) containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  // ---------- Saving ----------

  function save(mode: SaveMode) {
    if (pending || !canEdit) return;

    setAttempted(mode);
    setServerErrors({});
    setBanner(null);

    if (Object.keys(validateRuleSet(state, catalogue, provinces, mode)).length > 0) {
      setBanner(ui.banners.fixErrors);
      setFocusTick((n) => n + 1);
      return;
    }

    startTransition(async () => {
      const result = await saveEligibilityAction(campaignId, mode, toRequest(state));

      if (result.ok) {
        rawDispatch({ type: "saved", data: result.data });
        // Which subjects the saved rules use has changed, and that decides which can be removed.
        setSetup((s) => ({ ...s, subjects: s.subjects.map((sub) => ({ ...sub, ruleCount: countUses(result.data.groups, sub.key) })) }));
        setSavedAt(result.data.updatedAt);
        setSteps((all) => all.map((s) => (s.step === "EligibilityRules" ? { ...s, status: result.data.stepStatus } : s)));
        if (mode === "complete") router.push(`/admin/campaigns/${campaignId}`);
        return;
      }

      const fromServer = result.fieldErrors ?? {};
      setServerErrors(fromServer);
      setBanner(Object.keys(fromServer).length > 0 ? ui.banners.fixErrors : result.message);
      setFocusTick((n) => n + 1);
    });
  }

  // For the test panel: check the rules on screen, show any problems, and only then let it run.
  const prepareTest = () => {
    if (Object.keys(validateRuleSet(state, catalogue, provinces, "draft")).length > 0) {
      setAttempted((a) => a ?? "draft");
      setFocusTick((n) => n + 1);
      return null;
    }
    return toRequest(state);
  };

  async function useSuggested() {
    setLoadingSuggested(true);
    setBanner(null);
    const result = await loadSuggestedRulesAction(campaignId);
    setLoadingSuggested(false);
    if (result.ok) dispatch({ type: "insertSuggested", suggested: result.data });
    else setBanner(result.message || ui.builder.suggestedFailed);
  }

  // ---------- Exam subjects ----------

  // A subject cannot be removed while a rule uses it. The server only knows the saved rules, but the
  // rules on screen count too: removing a subject a rule on screen uses would leave that rule with no field.
  const subjectUse = useMemo(
    () => Object.fromEntries(setup.subjects.map((s) => [s.key, Math.max(s.ruleCount, countUses(state.groups, s.key))])),
    [setup.subjects, state.groups],
  );

  // The server saved a change and sent back the list and catalogue. A rename changes the wording of
  // the failure messages that were filled in for the user, so those are rewritten too.
  const subjectsChanged = useCallback((next: ExamSetup) => {
    setSetup(next);
    rawDispatch({ type: "refreshMessages", catalogue: next.catalogue });
  }, []);

  // ---------- Pieces of the page ----------

  const usesAge = allRules(state).some((r) => catalogue.fields.find((f) => f.key === r.fieldKey)?.derivation === "AgeFromBirthDate");
  const savedTime = savedAt ? formatSavedTime(savedAt) : "";
  const setLevelErrors = [errorFor("groups"), errorFor("rules")].filter((e): e is string => Boolean(e));
  const lockedNote = initial.isLocked ? ui.banners.locked : ui.banners.readOnly;

  return (
    <div ref={containerRef} className="flex flex-col gap-6">
      <StepTabs steps={steps} current="EligibilityRules" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!canEdit && <p className="rounded-xl bg-warning-soft px-5 py-3 text-sm text-ink">{lockedNote}</p>}

          {banner && (
            <p role="alert" className="rounded-xl bg-danger-soft px-5 py-3 text-sm text-danger-text">
              {banner}
            </p>
          )}
          {setLevelErrors.map((message) => (
            <p key={message} role="alert" className="rounded-xl bg-danger-soft px-5 py-3 text-sm text-danger-text">
              {message}
            </p>
          ))}

          <SubjectsPanel
            subjects={setup.subjects}
            maxSubjects={setup.maxSubjects}
            usage={subjectUse}
            canEdit={canEdit}
            onAdd={(name) => addSubjectAction(campaignId, name)}
            onRename={(key, name) => renameSubjectAction(campaignId, key, name)}
            onRemove={(key) => removeSubjectAction(campaignId, key)}
            onChanged={subjectsChanged}
          />

          {state.groups.length === 0 ? (
            <EmptyState
              compact
              title={ui.empty.title}
              description={canEdit ? ui.empty.body : ui.empty.readOnly}
              hint={canEdit ? ui.empty.suggestedHint : undefined}
              action={
                canEdit ? (
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" onClick={() => dispatch({ type: "addFirstRule" })}>
                      <span aria-hidden="true">+</span> {ui.empty.addFirst}
                    </Button>
                    <Button size="lg" onClick={useSuggested} disabled={loadingSuggested}>
                      {ui.empty.useSuggested}
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : (
            <>
              {usesAge && (
                <div className="rounded-2xl border border-line bg-surface p-5">
                  <FormField label={ui.reference.label} hint={ui.reference.hint} error={errorFor("ageReferenceDate")} className="max-w-sm">
                    {(control) => (
                      <TextInput
                        {...control}
                        type="date"
                        name="ageReferenceDate"
                        value={state.ageReferenceDate}
                        disabled={!canEdit}
                        onChange={(e) => dispatch({ type: "setReferenceDate", date: e.target.value })}
                      />
                    )}
                  </FormField>
                </div>
              )}

              {state.groups.map((group, index) => (
                <RuleGroupCard
                  key={group.id}
                  group={group}
                  index={index}
                  count={state.groups.length}
                  allGroups={state.groups}
                  ctx={ctx}
                  errorFor={errorFor}
                  canEdit={canEdit}
                  dispatch={dispatch}
                  onRequestDeleteRule={setRuleToDelete}
                  onRequestDeleteGroup={setGroupToDelete}
                  onTouchRule={touchRule}
                />
              ))}

              {canEdit && (
                <div>
                  <Button onClick={() => dispatch({ type: "addGroup" })}>
                    <span aria-hidden="true">+</span> {ui.builder.addGroup}
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface/95 px-6 py-4 shadow-overlay backdrop-blur">
            <p role="status" aria-live="polite" className="text-sm text-ink-muted" suppressHydrationWarning>
              {canEdit && dirty ? (
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
                  {pending ? ui.actions.saving : ui.actions.saveDraft}
                </Button>
                <Button variant="primary" onClick={() => save("complete")} disabled={pending}>
                  {pending ? ui.actions.saving : ui.actions.saveContinue}
                </Button>
              </div>
            ) : (
              <Link href={`/admin/campaigns/${campaignId}`} className="text-sm font-semibold text-primary hover:underline focus-ring">
                {t.info.back}
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SummaryPanel groups={state.groups} ctx={ctx} />
          <TestPanel
            groups={state.groups}
            ctx={ctx}
            rulesKey={snapshot(state)}
            prepare={prepareTest}
            runTest={(request, candidate) => testEligibilityAction(campaignId, request, candidate)}
          />
          <aside className="rounded-2xl bg-warning-soft p-5">
            <h2 className="text-[15px] font-bold text-ink">{ui.tip.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink">{ui.tip.body}</p>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={ruleToDelete !== null}
        destructive
        title={ui.rule.deleteTitle}
        description={ruleToDelete ? ui.rule.deleteBody(describeRule(ruleToDelete, ctx)) : ""}
        confirmLabel={ui.rule.confirmDelete}
        cancelLabel={ui.rule.keep}
        onConfirm={() => {
          if (ruleToDelete) dispatch({ type: "deleteRule", ruleId: ruleToDelete.id });
          setRuleToDelete(null);
        }}
        onCancel={() => setRuleToDelete(null)}
      />

      <ConfirmDialog
        open={groupToDelete !== null}
        destructive
        title={groupToDelete ? ui.group.deleteTitle(groupToDelete.name) : ""}
        description={groupToDelete ? ui.group.deleteBody(groupToDelete.rules.length) : ""}
        confirmLabel={ui.group.confirmDelete}
        cancelLabel={ui.group.keep}
        onConfirm={() => {
          if (groupToDelete) dispatch({ type: "deleteGroup", groupId: groupToDelete.id });
          setGroupToDelete(null);
        }}
        onCancel={() => setGroupToDelete(null)}
      />

      <ConfirmDialog
        open={guard.pendingHref !== null}
        destructive
        title={ui.leave.title}
        description={ui.leave.body}
        confirmLabel={ui.leave.leave}
        cancelLabel={ui.leave.stay}
        onConfirm={() => {
          const href = guard.leave();
          if (href) router.push(href);
        }}
        onCancel={guard.stay}
      />
    </div>
  );
}
