"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import Button from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/inputs";
import type { DraftAction, DraftGroup, DraftRule } from "@/lib/eligibility/draft";
import type { PhraseContext } from "@/lib/eligibility/phrases";
import type { GroupLogic } from "@/lib/eligibility/types";
import { groupKey } from "@/lib/eligibility/validation";
import { t } from "@/lib/messages";
import RuleRow from "./RuleRow";

type Props = {
  group: DraftGroup;
  index: number;
  count: number;
  allGroups: DraftGroup[];
  ctx: PhraseContext;
  errorFor: (key: string) => string | undefined;
  canEdit: boolean;
  dispatch: (action: DraftAction) => void;
  /** Ask before deleting; the page shows the confirmation. */
  onRequestDeleteRule: (rule: DraftRule) => void;
  onRequestDeleteGroup: (group: DraftGroup) => void;
  onTouchRule: (ruleId: string) => void;
};

/**
 * A group of rules with its own ALL / ANY switch. Its rules can be dragged to reorder (inside
 * this group only: each group has its own drag area). Moving a rule to another group is done in
 * the rule's details.
 */
export default function RuleGroupCard({
  group,
  index,
  count,
  allGroups,
  ctx,
  errorFor,
  canEdit,
  dispatch,
  onRequestDeleteRule,
  onRequestDeleteGroup,
  onTouchRule,
}: Props) {
  // Pointer drags need a small move first, so a plain click on the handle is not a drag.
  // The keyboard sensor lets the handle be lifted with Space and moved with the arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = group.rules.map((r) => r.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    dispatch({ type: "reorderRules", groupId: group.id, orderedIds: ids });
  }

  const nameError = errorFor(groupKey(group.id, "name"));
  const nameErrorId = `${group.id}-name-error`;

  return (
    <section aria-label={t.eligibility.ui.group.itemLabel(group.name)} className="rounded-2xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <TextInput
            aria-label={t.eligibility.ui.group.name}
            value={group.name}
            disabled={!canEdit}
            onChange={(e) => dispatch({ type: "renameGroup", groupId: group.id, name: e.target.value })}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            className="font-semibold"
            autoComplete="off"
          />
          <div id={nameErrorId} aria-live="polite">
            {nameError && <p className="mt-1 text-[13px] text-danger-text">{nameError}</p>}
          </div>
        </div>

        <div className="w-60 max-w-full">
          <Select
            aria-label={t.eligibility.ui.group.logic}
            value={group.logic}
            disabled={!canEdit}
            onChange={(e) => dispatch({ type: "setLogic", groupId: group.id, logic: e.target.value as GroupLogic })}
          >
            <option value="All">{t.eligibility.ui.group.all}</option>
            <option value="Any">{t.eligibility.ui.group.any}</option>
          </Select>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1">
            <Button size="md" aria-label={t.eligibility.ui.group.moveUp} title={t.eligibility.ui.group.moveUp} disabled={index === 0} onClick={() => dispatch({ type: "moveGroup", groupId: group.id, direction: -1 })}>
              ↑
            </Button>
            <Button size="md" aria-label={t.eligibility.ui.group.moveDown} title={t.eligibility.ui.group.moveDown} disabled={index === count - 1} onClick={() => dispatch({ type: "moveGroup", groupId: group.id, direction: 1 })}>
              ↓
            </Button>
            <Button onClick={() => onRequestDeleteGroup(group)}>{t.eligibility.ui.group.delete}</Button>
          </div>
        )}
      </div>

      {group.rules.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
          {t.eligibility.ui.group.empty}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={group.rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label={t.eligibility.ui.group.rulesLabel(group.name)} className="mt-4 flex flex-col gap-2">
              {group.rules.map((rule, ruleIndex) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  index={ruleIndex}
                  count={group.rules.length}
                  ctx={ctx}
                  groups={allGroups}
                  groupId={group.id}
                  errorFor={errorFor}
                  canEdit={canEdit}
                  onChange={(patch) => dispatch({ type: "updateRule", ruleId: rule.id, patch })}
                  onMove={(direction) => dispatch({ type: "moveRule", ruleId: rule.id, direction })}
                  onMoveToGroup={(groupId) => dispatch({ type: "moveRuleToGroup", ruleId: rule.id, groupId })}
                  onDelete={() => onRequestDeleteRule(rule)}
                  onTouch={() => onTouchRule(rule.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canEdit && (
        <div className="mt-4">
          <Button onClick={() => dispatch({ type: "addRule", groupId: group.id })}>
            <span aria-hidden="true">+</span> {t.eligibility.ui.group.addRule}
          </Button>
        </div>
      )}
    </section>
  );
}
