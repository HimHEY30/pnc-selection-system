"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Select, TextInput } from "@/components/ui/inputs";
import Switch from "@/components/ui/Switch";
import type { DraftGroup, DraftRule, RulePatch } from "@/lib/eligibility/draft";
import { describeRule, type PhraseContext } from "@/lib/eligibility/phrases";
import type { RuleType } from "@/lib/eligibility/types";
import { ruleKey, type RulePart } from "@/lib/eligibility/validation";
import { t } from "@/lib/messages";
import { FieldSelect, OperatorSelect, TypeSelect, ValueInput } from "./RuleInputs";

type Props = {
  rule: DraftRule;
  index: number;
  count: number;
  ctx: PhraseContext;
  /** All groups, so the rule can be moved to another one. */
  groups: DraftGroup[];
  groupId: string;
  /** The message to show under an input, or undefined. The page decides when errors may show. */
  errorFor: (key: string) => string | undefined;
  canEdit: boolean;
  onChange: (patch: RulePatch) => void;
  onMove: (direction: -1 | 1) => void;
  onMoveToGroup: (groupId: string) => void;
  onDelete: () => void;
  /** Called when the user leaves one of this rule's inputs, so its errors may start to show. */
  onTouch: () => void;
};

const ArrowIcon = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
  </svg>
);

const iconButton =
  "flex size-8 items-center justify-center rounded-lg text-ink-muted transition hover:bg-canvas hover:text-ink focus-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * One rule: Field + Comparison + Value, its type, an active switch, a handle to reorder it,
 * and buttons to move, edit details and delete. The handle is a real button that dnd-kit also
 * makes keyboard-draggable (Space to lift, arrows to move, Space to drop); Move up and Move
 * down do the same job with plain clicks.
 */
export default function RuleRow({
  rule,
  index,
  count,
  ctx,
  groups,
  groupId,
  errorFor,
  canEdit,
  onChange,
  onMove,
  onMoveToGroup,
  onDelete,
  onTouch,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
    disabled: !canEdit,
  });

  const field = ctx.catalogue.fields.find((f) => f.key === rule.fieldKey);
  const operator = field?.operators.find((o) => o.key === rule.operatorKey);
  const summary = describeRule(rule, ctx);

  const error = (part?: RulePart) => errorFor(ruleKey(rule.id, part));
  const errors = (["field", "operator", "values", "type", "message", undefined] as const)
    .map((part) => error(part))
    .filter((e): e is string => Boolean(e));
  const errorsId = `${rule.id}-errors`;
  const describedBy = errors.length > 0 ? errorsId : undefined;

  // A problem with the message lives in the details, so open them rather than hide it.
  const showDetails = detailsOpen || Boolean(error("message"));
  const detailsId = `${rule.id}-details`;
  const otherGroups = groups.filter((g) => g.id !== groupId);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-surface ${errors.length > 0 ? "border-danger" : "border-line"} ${isDragging ? "z-10 shadow-lg" : ""} ${
        rule.isActive ? "" : "bg-canvas"
      }`}
    >
      <div role="group" aria-label={summary} className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
        {canEdit && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={t.eligibility.ui.rule.handleLabel(summary)}
            title={t.eligibility.ui.rule.handle}
            className={`${iconButton} mt-0.5 cursor-grab touch-none active:cursor-grabbing`}
            {...attributes}
            {...listeners}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
          </button>
        )}

        <div className={`grid min-w-0 flex-1 basis-[28rem] grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.4fr)] ${rule.isActive ? "" : "opacity-60"}`}>
          <FieldSelect
            catalogue={ctx.catalogue}
            value={rule.fieldKey}
            onChange={(fieldKey) => onChange({ fieldKey })}
            disabled={!canEdit}
            // A problem with the rule as a whole (a duplicate, a contradiction) marks the first input,
            // so there is somewhere for focus to land and for the message to be linked to.
            invalid={Boolean(error("field") || error())}
            describedBy={describedBy}
            onBlur={onTouch}
          />
          <OperatorSelect
            field={field}
            value={rule.operatorKey}
            onChange={(operatorKey) => onChange({ operatorKey })}
            disabled={!canEdit}
            invalid={Boolean(error("operator"))}
            describedBy={describedBy}
            onBlur={onTouch}
          />
          <ValueInput
            field={field}
            operator={operator}
            values={rule.values}
            provinces={ctx.provinces}
            onChange={(values) => onChange({ values })}
            disabled={!canEdit}
            invalid={Boolean(error("values"))}
            describedBy={describedBy}
            onBlur={onTouch}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="w-32">
            <TypeSelect value={rule.type} onChange={(type: RuleType) => onChange({ type })} disabled={!canEdit} onBlur={onTouch} />
          </div>
          <Switch
            checked={rule.isActive}
            onChange={(isActive) => onChange({ isActive })}
            label={t.eligibility.ui.rule.activeLabel(summary)}
            disabled={!canEdit}
          />
          <button
            type="button"
            aria-expanded={showDetails}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((o) => !o)}
            className="rounded-lg px-2 py-1.5 text-sm font-semibold text-primary transition hover:bg-canvas focus-ring"
          >
            {t.eligibility.ui.rule.edit}
          </button>
          {canEdit && (
            <>
              <button type="button" aria-label={t.eligibility.ui.rule.moveUp} title={t.eligibility.ui.rule.moveUp} disabled={index === 0} onClick={() => onMove(-1)} className={iconButton}>
                <ArrowIcon up />
              </button>
              <button type="button" aria-label={t.eligibility.ui.rule.moveDown} title={t.eligibility.ui.rule.moveDown} disabled={index === count - 1} onClick={() => onMove(1)} className={iconButton}>
                <ArrowIcon up={false} />
              </button>
              <button type="button" aria-label={t.eligibility.ui.rule.delete} title={t.eligibility.ui.rule.delete} onClick={onDelete} className={`${iconButton} hover:text-danger-text`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Always rendered so assistive technology hears problems as they appear. */}
      <div id={errorsId} aria-live="polite" className="px-3">
        {errors.map((message) => (
          <p key={message} className="pb-2 text-[13px] leading-snug text-danger-text">
            {message}
          </p>
        ))}
      </div>

      {!rule.isActive && <p className="px-3 pb-2 text-xs text-ink-muted">{t.eligibility.ui.rule.inactiveHint}</p>}
      {rule.isActive && rule.type === "Optional" && <p className="px-3 pb-2 text-xs text-ink-muted">{t.eligibility.ui.rule.optionalHint}</p>}

      {showDetails && (
        <div id={detailsId} role="group" aria-label={t.eligibility.ui.rule.details} className="grid gap-3 border-t border-line px-3 py-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">{t.eligibility.ui.rule.message}</span>
            <TextInput
              value={rule.message}
              disabled={!canEdit}
              onChange={(e) => onChange({ message: e.target.value })}
              onBlur={onTouch}
              aria-invalid={error("message") ? true : undefined}
              aria-describedby={describedBy}
              autoComplete="off"
            />
          </label>
          {canEdit && otherGroups.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">{t.eligibility.ui.rule.moveToGroup}</span>
              <Select value={groupId} onChange={(e) => onMoveToGroup(e.target.value)}>
                <option value={groupId}>{groups.find((g) => g.id === groupId)?.name}</option>
                {otherGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      )}
    </li>
  );
}
