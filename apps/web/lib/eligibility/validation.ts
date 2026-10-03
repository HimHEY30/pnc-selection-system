import { isIsoDate } from "@/lib/campaigns/dates";
import { t } from "@/lib/messages";
import type { Catalogue, CatalogueField, CatalogueOperator, Group, Rule, TargetProvince } from "./types";

// Client-side mirror of the backend's rule checks (Eligibility.Application/RuleSetValidator.cs),
// for instant feedback under each input. The server still checks everything and is the only one
// that looks for contradictions. Keep limits and wording in step with it.

export const MESSAGE_MAX = 200;
export const GROUP_NAME_MAX = 60;

/**
 * Where each message belongs, keyed the way the server keys them:
 * "rules.{id}.values", "rules.{id}.message", "rules.{id}" (the rule as a whole),
 * "groups.{id}.name", "ageReferenceDate" and "rules" (the set as a whole).
 */
export type ErrorMap = Record<string, string>;

export type RulePart = "field" | "operator" | "values" | "type" | "message";

export const ruleKey = (ruleId: string, part?: RulePart) => (part ? `rules.${ruleId}.${part}` : `rules.${ruleId}`);
export const groupKey = (groupId: string, part: "name" | "logic" | "rules") => `groups.${groupId}.${part}`;

/** "Save draft" or "Save and continue". Completing asks for more. */
export type SaveMode = "draft" | "complete";

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Decimal places that really matter: 20.50 has one. */
function decimalPlaces(text: string): number {
  return (text.trim().split(".")[1] ?? "").replace(/0+$/, "").length;
}

/** The message under the value input for these values, or null when they are fine. */
export function validateValues(
  field: CatalogueField,
  operator: CatalogueOperator,
  values: string[],
  allowedChoices: string[] | null,
): string | null {
  const v = t.eligibility.validation;

  if (operator.arity === "None") return null;
  const wanted = operator.arity === "Two" ? 2 : 1;
  if (operator.arity === "List" ? values.length === 0 : values.length < wanted) {
    return operator.arity === "Two" ? v.bothValues : operator.arity === "List" ? v.chooseOne : v.valueRequired;
  }
  if (operator.arity !== "List" && values.length !== wanted) return v.valueRequired;
  if (values.some((x) => x.trim() === "")) {
    return operator.arity === "Two" ? v.bothValues : v.valueRequired;
  }

  if (field.valueType === "Number") {
    for (const text of values) {
      if (!NUMBER.test(text.trim())) return v.notNumber;
      if (decimalPlaces(text) > field.decimals) return field.decimals === 0 ? v.wholeNumber : v.decimals(field.decimals);
      const n = Number(text);
      if (field.minValue !== null && n < field.minValue) return v.atLeast(String(field.minValue));
      if (field.maxValue !== null && n > field.maxValue) return v.atMost(String(field.maxValue));
    }
    if (operator.arity === "Two" && Number(values[0]) >= Number(values[1])) return v.firstLower;
  }

  if (field.valueType === "Date") {
    if (values.some((x) => !isIsoDate(x))) return v.notDate;
    if (operator.arity === "Two" && values[0] >= values[1]) return v.firstLower;
  }

  if (field.valueType === "Choice" && allowedChoices && values.some((x) => !allowedChoices.includes(x.trim()))) {
    return field.optionsSource === "CampaignProvinces" ? v.notTarget : v.notInList;
  }

  return null;
}

/** One spelling for equal values, so "17.0" equals "17" and list order does not matter. */
export function canonicalValues(field: CatalogueField, operator: CatalogueOperator, values: string[]): string[] {
  if (field.valueType === "Number") return values.map((x) => String(Number(x)));
  if (field.valueType === "Choice" && operator.arity === "List") return [...new Set(values.map((x) => x.trim()))].sort();
  return values.map((x) => x.trim());
}

export type DraftContent = { ageReferenceDate: string | null; groups: Group[] };

/**
 * Checks the whole rule set the way the server will. Problems come back keyed to where they
 * belong, one message per place. In "complete" mode it also needs an active mandatory rule, the
 * age reference date when an age rule is active, and province rules limited to the campaign's
 * target provinces (a draft may keep other provinces so nothing is lost).
 */
export function validateRuleSet(
  content: DraftContent,
  catalogue: Catalogue,
  targetProvinces: TargetProvince[],
  mode: SaveMode,
): ErrorMap {
  const v = t.eligibility.validation;
  const errors: ErrorMap = {};
  const fieldOf = (key: string) => catalogue.fields.find((f) => f.key === key);
  const targetIds = targetProvinces.map((p) => p.id);

  for (const group of content.groups) {
    const name = group.name.trim();
    if (!name) errors[groupKey(group.id, "name")] = v.groupNameRequired;
    else if (name.length > GROUP_NAME_MAX) errors[groupKey(group.id, "name")] = v.groupNameTooLong(GROUP_NAME_MAX);

    const seen = new Set<string>();
    for (const rule of group.rules) {
      const wellFormed = validateRule(rule, fieldOf, mode === "complete" ? targetIds : null, errors);
      if (wellFormed) {
        const key = `${wellFormed.field}|${wellFormed.operator}|${wellFormed.values.join("\u001f")}`;
        if (seen.has(key)) errors[ruleKey(rule.id)] = v.duplicate;
        seen.add(key);
      }
    }
  }

  if (mode === "complete") {
    const rules = content.groups.flatMap((g) => g.rules).filter((r) => r.isActive);
    if (!rules.some((r) => r.type === "Mandatory")) errors.rules = v.needMandatory;

    const usesAge = rules.some((r) => fieldOf(r.fieldKey)?.derivation === "AgeFromBirthDate");
    if (usesAge && !content.ageReferenceDate) errors.ageReferenceDate = v.needReferenceDate;
  }

  return errors;
}

/** Adds this rule's own problems to `errors`. Returns its canonical form if it is well formed. */
function validateRule(
  rule: Rule,
  fieldOf: (key: string) => CatalogueField | undefined,
  allowedProvinces: string[] | null,
  errors: ErrorMap,
): { field: string; operator: string; values: string[] } | null {
  const v = t.eligibility.validation;
  let ok = true;

  const field = fieldOf(rule.fieldKey);
  if (!field) {
    errors[ruleKey(rule.id, "field")] = v.fieldRequired;
    ok = false;
  }

  const operator = field?.operators.find((o) => o.key === rule.operatorKey);
  if (field && !operator) {
    errors[ruleKey(rule.id, "operator")] = v.operatorRequired;
    ok = false;
  }

  const message = rule.message.trim();
  if (!message) {
    errors[ruleKey(rule.id, "message")] = v.messageRequired;
    ok = false;
  } else if (message.length > MESSAGE_MAX) {
    errors[ruleKey(rule.id, "message")] = v.messageTooLong(MESSAGE_MAX);
    ok = false;
  }

  if (field && operator) {
    const allowed =
      field.valueType !== "Choice"
        ? null
        : field.optionsSource === "CampaignProvinces"
          ? allowedProvinces
          : field.options.map((o) => o.key);
    const problem = validateValues(field, operator, rule.values, allowed);
    if (problem) {
      errors[ruleKey(rule.id, "values")] = problem;
      ok = false;
    }
  } else {
    ok = false;
  }

  return ok && field && operator
    ? { field: field.key, operator: operator.key, values: canonicalValues(field, operator, rule.values) }
    : null;
}
