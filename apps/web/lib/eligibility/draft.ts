import { defaultMessage, type PhraseContext } from "./phrases";
import type {
  Catalogue,
  CatalogueField,
  CatalogueOperator,
  Group,
  GroupLogic,
  Rule,
  RuleSetData,
  RuleType,
  SaveRequest,
  SuggestedData,
  TargetProvince,
} from "./types";

// The page's working copy of the rules. Everything the user does (add, edit, delete, reorder,
// switch on or off) changes this copy only; nothing is stored until "Save draft" or "Save and
// continue". It is a plain reducer, so each behaviour can be tested without a browser.

/** A rule on screen. `customMessage` is true once the failure message is no longer the pre-filled one. */
export type DraftRule = Rule & { customMessage: boolean };
export type DraftGroup = Omit<Group, "rules"> & { rules: DraftRule[] };

export type DraftState = {
  /** The day ages are calculated on, or "" when not chosen yet. */
  ageReferenceDate: string;
  groups: DraftGroup[];
  /** The version last read from or saved to the server. */
  version: number;
  /** The content as last saved, to tell whether anything changed. */
  savedSnapshot: string;
};

export type RulePatch = Partial<Pick<Rule, "fieldKey" | "operatorKey" | "values" | "type" | "message" | "isActive">>;

export type DraftAction =
  | { type: "addGroup" }
  /** For an empty page: a new group with its first rule in one step. */
  | { type: "addFirstRule" }
  | { type: "renameGroup"; groupId: string; name: string }
  | { type: "setLogic"; groupId: string; logic: GroupLogic }
  | { type: "deleteGroup"; groupId: string }
  | { type: "moveGroup"; groupId: string; direction: -1 | 1 }
  | { type: "reorderGroups"; orderedIds: string[] }
  | { type: "addRule"; groupId: string }
  | { type: "updateRule"; ruleId: string; patch: RulePatch }
  | { type: "deleteRule"; ruleId: string }
  | { type: "moveRule"; ruleId: string; direction: -1 | 1 }
  | { type: "moveRuleToGroup"; ruleId: string; groupId: string }
  | { type: "reorderRules"; groupId: string; orderedIds: string[] }
  | { type: "setReferenceDate"; date: string }
  | { type: "insertSuggested"; suggested: SuggestedData }
  | { type: "saved"; data: RuleSetData };

export type DraftEnvironment = {
  catalogue: Catalogue;
  provinces: TargetProvince[];
  /** Used to pre-fill the age reference date the first time an age rule is added. */
  campaignStartDate: string | null;
  /** Makes ids for new groups and rules. Injected so tests can predict them. */
  newId: () => string;
};

// ---------- Building and reading the state ----------

export function initialState(data: RuleSetData, env: Pick<DraftEnvironment, "catalogue" | "provinces">): DraftState {
  const ctx = { catalogue: env.catalogue, provinces: data.targetProvinces.length ? data.targetProvinces : env.provinces };
  const state: DraftState = {
    ageReferenceDate: data.ageReferenceDate ?? "",
    groups: data.groups.map((g) => toDraftGroup(g, ctx)),
    version: data.version,
    savedSnapshot: "",
  };
  return { ...state, savedSnapshot: snapshot(state) };
}

function toDraftGroup(group: Group, ctx: PhraseContext): DraftGroup {
  return { ...group, rules: group.rules.map((r) => ({ ...r, customMessage: r.message !== defaultMessage(r, ctx) })) };
}

/** What would be stored, as text. Two states with the same snapshot have the same content. */
export function snapshot(state: Pick<DraftState, "ageReferenceDate" | "groups">): string {
  return JSON.stringify({
    ageReferenceDate: state.ageReferenceDate,
    groups: state.groups.map((g) => ({
      id: g.id,
      name: g.name,
      logic: g.logic,
      rules: g.rules.map((r) => ({
        id: r.id,
        fieldKey: r.fieldKey,
        operatorKey: r.operatorKey,
        values: r.values,
        type: r.type,
        message: r.message,
        isActive: r.isActive,
      })),
    })),
  });
}

export function isDirty(state: DraftState): boolean {
  return snapshot(state) !== state.savedSnapshot;
}

/** The body to send to the server. */
export function toRequest(state: DraftState): SaveRequest {
  return {
    ageReferenceDate: state.ageReferenceDate || null,
    groups: state.groups.map(({ rules, ...group }) => ({
      ...group,
      rules: rules.map(toRule),
    })),
    version: state.version,
  };
}

/** A rule as the server stores it: the client-only flag left out. */
function toRule(rule: DraftRule): Rule {
  return {
    id: rule.id,
    fieldKey: rule.fieldKey,
    operatorKey: rule.operatorKey,
    values: rule.values,
    type: rule.type,
    message: rule.message,
    isActive: rule.isActive,
  };
}

export const allRules = (state: Pick<DraftState, "groups">): DraftRule[] => state.groups.flatMap((g) => g.rules);

// ---------- The reducer ----------

export function createDraftReducer(env: DraftEnvironment) {
  const fieldOf = (key: string): CatalogueField | undefined => env.catalogue.fields.find((f) => f.key === key);
  const phrase = (provinces: TargetProvince[]): PhraseContext => ({ catalogue: env.catalogue, provinces });

  return function reduce(state: DraftState, action: DraftAction): DraftState {
    const ctx = phrase(env.provinces);

    const mapRules = (fn: (rule: DraftRule) => DraftRule): DraftGroup[] =>
      state.groups.map((g) => ({ ...g, rules: g.rules.map(fn) }));

    switch (action.type) {
      case "addGroup":
        return {
          ...state,
          groups: [...state.groups, { id: env.newId(), name: nextGroupName(state.groups), logic: "All", rules: [] }],
        };

      case "addFirstRule": {
        const rule = newRule(env, ctx);
        const created: DraftGroup = { id: env.newId(), name: nextGroupName(state.groups), logic: "All", rules: [rule] };
        return { ...ensureReferenceDate(state, fieldOf(rule.fieldKey), env.campaignStartDate), groups: [...state.groups, created] };
      }

      case "renameGroup":
        return { ...state, groups: state.groups.map((g) => (g.id === action.groupId ? { ...g, name: action.name } : g)) };

      case "setLogic":
        return { ...state, groups: state.groups.map((g) => (g.id === action.groupId ? { ...g, logic: action.logic } : g)) };

      case "deleteGroup":
        return { ...state, groups: state.groups.filter((g) => g.id !== action.groupId) };

      case "moveGroup": {
        const groups = moveBy(state.groups, (g) => g.id === action.groupId, action.direction);
        return groups === state.groups ? state : { ...state, groups };
      }

      case "reorderGroups":
        return { ...state, groups: reorderByIds(state.groups, action.orderedIds) };

      case "addRule": {
        const rule = newRule(env, ctx);
        const withDate = ensureReferenceDate(state, fieldOf(rule.fieldKey), env.campaignStartDate);
        return {
          ...withDate,
          groups: state.groups.map((g) => (g.id === action.groupId ? { ...g, rules: [...g.rules, rule] } : g)),
        };
      }

      case "updateRule": {
        let next: DraftState = { ...state, groups: mapRules((r) => (r.id === action.ruleId ? applyPatch(r, action.patch, fieldOf, ctx) : r)) };
        if (action.patch.fieldKey) next = ensureReferenceDate(next, fieldOf(action.patch.fieldKey), env.campaignStartDate);
        return next;
      }

      case "deleteRule":
        return { ...state, groups: state.groups.map((g) => ({ ...g, rules: g.rules.filter((r) => r.id !== action.ruleId) })) };

      case "moveRule": {
        const owner = state.groups.find((g) => g.rules.some((r) => r.id === action.ruleId));
        if (!owner) return state;
        const rules = moveBy(owner.rules, (r) => r.id === action.ruleId, action.direction);
        if (rules === owner.rules) return state; // already at the end
        return { ...state, groups: state.groups.map((g) => (g === owner ? { ...g, rules } : g)) };
      }

      case "moveRuleToGroup": {
        const moving = allRules(state).find((r) => r.id === action.ruleId);
        if (!moving) return state;
        return {
          ...state,
          groups: state.groups.map((g) => {
            const without = g.rules.filter((r) => r.id !== action.ruleId);
            return g.id === action.groupId ? { ...g, rules: [...without, moving] } : { ...g, rules: without };
          }),
        };
      }

      case "reorderRules":
        return {
          ...state,
          groups: state.groups.map((g) => (g.id === action.groupId ? { ...g, rules: reorderByIds(g.rules, action.orderedIds) } : g)),
        };

      case "setReferenceDate":
        return { ...state, ageReferenceDate: action.date };

      case "insertSuggested": {
        const added = action.suggested.groups.map((g) => toDraftGroup(g, ctx));
        return {
          ...state,
          ageReferenceDate: state.ageReferenceDate || action.suggested.ageReferenceDate || "",
          groups: [...state.groups, ...added],
        };
      }

      case "saved": {
        // Adopt what the server stored (it may have tidied values) but keep which messages the
        // user wrote themselves, so editing a rule later still follows the same rule.
        const custom = new Map(allRules(state).map((r) => [r.id, r.customMessage]));
        const savedCtx = phrase(action.data.targetProvinces.length ? action.data.targetProvinces : env.provinces);
        const groups = action.data.groups.map((g) => ({
          ...g,
          rules: g.rules.map((r) => ({ ...r, customMessage: custom.get(r.id) ?? r.message !== defaultMessage(r, savedCtx) })),
        }));
        const next: DraftState = {
          ageReferenceDate: action.data.ageReferenceDate ?? "",
          groups,
          version: action.data.version,
          savedSnapshot: "",
        };
        return { ...next, savedSnapshot: snapshot(next) };
      }
    }
  };
}

// ---------- Helpers ----------

/** "Group 1", "Group 2", ... the lowest number not already used. */
function nextGroupName(groups: DraftGroup[]): string {
  const used = new Set(groups.map((g) => g.name));
  for (let n = 1; ; n++) {
    if (!used.has(`Group ${n}`)) return `Group ${n}`;
  }
}

function newRule(env: DraftEnvironment, ctx: PhraseContext): DraftRule {
  const field = env.catalogue.fields[0];
  const base: Rule = {
    id: env.newId(),
    fieldKey: field.key,
    operatorKey: field.operators[0].key,
    values: [],
    type: "Mandatory",
    message: "",
    isActive: true,
  };
  return { ...base, message: defaultMessage(base, ctx), customMessage: false };
}

/** A field worked out from the date of birth (age) needs a reference date; the first time one is used, suggest the campaign's start date. */
function ensureReferenceDate(state: DraftState, field: CatalogueField | undefined, campaignStartDate: string | null): DraftState {
  return field?.derivation === "AgeFromBirthDate" && !state.ageReferenceDate && campaignStartDate
    ? { ...state, ageReferenceDate: campaignStartDate }
    : state;
}

function applyPatch(
  rule: DraftRule,
  patch: RulePatch,
  fieldOf: (key: string) => CatalogueField | undefined,
  ctx: PhraseContext,
): DraftRule {
  let next: DraftRule = { ...rule };

  if (patch.type !== undefined) next.type = patch.type as RuleType;
  if (patch.isActive !== undefined) next.isActive = patch.isActive;

  if (patch.fieldKey !== undefined && patch.fieldKey !== rule.fieldKey) {
    // A different field has different operators and values, so start that part afresh.
    const field = fieldOf(patch.fieldKey);
    next = { ...next, fieldKey: patch.fieldKey, operatorKey: field?.operators[0]?.key ?? "", values: [] };
  }

  if (patch.operatorKey !== undefined && patch.operatorKey !== next.operatorKey) {
    const operator = fieldOf(next.fieldKey)?.operators.find((o) => o.key === patch.operatorKey);
    next = { ...next, operatorKey: patch.operatorKey, values: adaptValues(next.values, operator) };
  }

  if (patch.values !== undefined) next.values = patch.values;

  if (patch.message !== undefined) {
    next.message = patch.message;
    next.customMessage = patch.message !== defaultMessage(next, ctx);
  } else if (!next.customMessage) {
    // Still the pre-filled sentence, so keep it in step with the rule.
    next.message = defaultMessage(next, ctx);
  }

  return next;
}

/** Keeps what still makes sense when the operator changes: "between" needs two, "is" one, "is yes" none. */
function adaptValues(values: string[], operator: CatalogueOperator | undefined): string[] {
  switch (operator?.arity) {
    case "None":
      return [];
    case "One":
      return values.slice(0, 1);
    case "Two":
      return [values[0] ?? "", values[1] ?? ""];
    default:
      return values;
  }
}

function moveBy<T>(items: T[], isTarget: (item: T) => boolean, direction: -1 | 1): T[] {
  const from = items.findIndex(isTarget);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const copy = [...items];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}

/** Puts items in the order of `orderedIds`; anything not listed keeps its place at the end. */
function reorderByIds<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const listed = orderedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const rest = items.filter((i) => !orderedIds.includes(i.id));
  return [...listed, ...rest];
}
