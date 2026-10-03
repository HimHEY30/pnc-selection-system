"use client";

import { useMemo, useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/inputs";
import type { ActionResult } from "@/lib/campaigns/types";
import { allRules, type DraftGroup, type DraftRule } from "@/lib/eligibility/draft";
import { describeRule, type PhraseContext } from "@/lib/eligibility/phrases";
import type { CatalogueField, SampleCandidate, SaveRequest, TestResult } from "@/lib/eligibility/types";
import { t } from "@/lib/messages";
import { optionsFor } from "./RuleInputs";

type Props = {
  groups: DraftGroup[];
  ctx: PhraseContext;
  /** Changes whenever the rules change, so a shown result can be marked as out of date. */
  rulesKey: string;
  /**
   * Checks the rules on screen and returns them as a request, or null when something is wrong
   * (the page marks the problems, so this panel only says to fix them first).
   */
  prepare: () => SaveRequest | null;
  runTest: (request: SaveRequest, candidate: SampleCandidate) => Promise<ActionResult<TestResult>>;
};

type Outcome = {
  result: TestResult;
  rulesKey: string;
  /** The rules as they were when the test ran, so the result still reads right if they are edited. */
  rules: DraftRule[];
  groups: DraftGroup[];
};

const text = t.eligibility.ui.test;

/** The total and the average of the exam scores: fields with no value of their own to enter. */
const isScoreAggregate = (field: CatalogueField): boolean => field.derivation === "ExamTotal" || field.derivation === "ExamAverage";

/**
 * "Test a sample candidate": fill in a person's details, press Run test, and see whether the
 * rules on screen would accept them, with a pass or fail (and the failure message) per rule.
 * The form only asks for the fields the rules use, and the test runs on the rules as shown,
 * saved or not. Nothing is stored.
 */
export default function TestPanel({ groups, ctx, rulesKey, prepare, runTest }: Props) {
  const [candidate, setCandidate] = useState<SampleCandidate>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // One input per field the rules use, in the catalogue's order. The total and the average have no input
  // of their own: they are worked out from the subject scores, so a rule on either one asks for every score.
  const { usedFields, usesAggregate } = useMemo(() => {
    const used = new Set(allRules({ groups }).map((r) => r.fieldKey));
    const aggregate = ctx.catalogue.fields.some((f) => used.has(f.key) && isScoreAggregate(f));
    return {
      usesAggregate: aggregate,
      usedFields: ctx.catalogue.fields.filter(
        (f) => !isScoreAggregate(f) && (used.has(f.key) || (aggregate && f.derivation === "ExamScore")),
      ),
    };
  }, [groups, ctx.catalogue.fields]);

  const set = (attribute: string, value: string) => setCandidate((c) => ({ ...c, [attribute]: value }));

  function run() {
    if (pending) return;
    setMessage(null);

    const request = prepare();
    if (!request) {
      setMessage(t.eligibility.ui.banners.fixErrors);
      return;
    }

    // Only what was filled in is sent, so a blank field really means "not provided".
    const filled = Object.fromEntries(Object.entries(candidate).filter(([, v]) => v.trim() !== ""));
    const ran = { rules: allRules({ groups }), groups, rulesKey };

    startTransition(async () => {
      const response = await runTest(request, filled);
      if (response.ok) {
        setOutcome({ result: response.data, ...ran });
      } else {
        setOutcome(null);
        setMessage(response.message || text.unavailable);
      }
    });
  }

  return (
    <section aria-labelledby="test-title" className="rounded-xl border border-line bg-surface p-6">
      <h2 id="test-title" className="text-[17px] font-bold text-ink">
        {text.title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{text.intro}</p>

      {usedFields.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{text.noRules}</p>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
          className="mt-4 flex flex-col gap-3"
        >
          {usesAggregate && <p className="text-[13px] text-ink-muted">{text.derivedFromScores}</p>}
          {usedFields.map((field) => (
            <CandidateInput
              key={field.key}
              field={field}
              ctx={ctx}
              value={candidate[field.candidateAttribute] ?? ""}
              onChange={(value) => set(field.candidateAttribute, value)}
            />
          ))}

          <Button type="submit" variant="primary" disabled={pending} className="self-start">
            {pending ? text.running : text.run}
          </Button>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {message}
        </p>
      )}

      {outcome && <Result outcome={outcome} ctx={ctx} stale={outcome.rulesKey !== rulesKey} />}
    </section>
  );
}

/** One input of the sample candidate, shaped like the field: a date, a number, a choice or yes/no. */
function CandidateInput({
  field,
  ctx,
  value,
  onChange,
}: {
  field: CatalogueField;
  ctx: PhraseContext;
  value: string;
  onChange: (value: string) => void;
}) {
  // A field worked out from the date of birth is asked for as the date of birth.
  const derived = field.derivation === "AgeFromBirthDate";
  const label = derived ? text.dateOfBirth : field.label;
  const id = `test-${field.candidateAttribute}`;

  let control: React.ReactNode;
  if (derived || field.valueType === "Date") {
    control = <TextInput id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.valueType === "Number") {
    control = (
      <div className="flex items-center gap-2">
        <TextInput id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
        {field.unit && <span className="shrink-0 text-xs text-ink-muted">{field.unit}</span>}
      </div>
    );
  } else if (field.valueType === "YesNo") {
    control = (
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{text.notProvided}</option>
        <option value="true">{text.yes}</option>
        <option value="false">{text.no}</option>
      </Select>
    );
  } else {
    control = (
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{text.notProvided}</option>
        {optionsFor(field, ctx.provinces).map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      {control}
    </div>
  );
}

function Result({ outcome, ctx, stale }: { outcome: Outcome; ctx: PhraseContext; stale: boolean }) {
  const { result, rules, groups } = outcome;
  const ruleOf = new Map(rules.map((r) => [r.id, r]));

  return (
    <div role="region" aria-label={text.resultLabel} className="mt-5 border-t border-line pt-5">
      <p
        role="status"
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
          result.eligible ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger-text"
        }`}
      >
        {result.eligible ? text.eligible : text.notEligible}
        {result.warnings > 0 && <span className="font-medium">· {text.warnings(result.warnings)}</span>}
      </p>

      {stale && <p className="mt-2 text-xs text-ink-muted">{text.stale}</p>}

      {groups.map((group) => {
        const groupResult = result.groups.find((g) => g.groupId === group.id);
        const rows = result.rules.filter((r) => r.groupId === group.id);
        if (rows.length === 0) return null;

        return (
          <div key={group.id} className="mt-4">
            <h3 className="text-sm font-bold text-ink">
              {group.name}
              <span className="ml-2 text-xs font-medium text-ink-muted">
                {!groupResult?.counted ? text.groupIgnored : groupResult.passed ? text.groupPassed : text.groupFailed}
              </span>
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {rows.map((row) => {
                const rule = ruleOf.get(row.ruleId);
                return (
                  <li key={row.ruleId} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ink">{rule ? describeRule(rule, ctx) : row.fieldKey}</span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-ink-muted">{row.type === "Mandatory" ? text.mandatory : text.optional}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-bold ${
                            row.outcome === "Passed"
                              ? "bg-primary-soft text-primary"
                              : row.outcome === "Failed"
                                ? "bg-danger-soft text-danger-text"
                                : "bg-neutral-soft text-ink-muted"
                          }`}
                        >
                          {row.outcome === "Passed" ? text.passed : row.outcome === "Failed" ? text.failed : text.skipped}
                        </span>
                      </span>
                    </div>
                    {row.outcome === "Failed" && (
                      <p className="mt-1 text-[13px] text-danger-text">
                        {row.dataMissing && <strong className="mr-1">{text.missing}.</strong>}
                        {row.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
