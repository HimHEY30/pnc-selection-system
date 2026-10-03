import { formatDate } from "@/lib/campaigns/dates";
import { t } from "@/lib/messages";
import type { Catalogue, CatalogueField, Group, Rule, TargetProvince } from "./types";

// Turns rules into plain language: the live summary sentence, and the failure message that is
// pre-filled for a new rule. Pure functions, with all wording in lib/messages.

export type PhraseContext = { catalogue: Catalogue; provinces: TargetProvince[] };

export function findField(ctx: PhraseContext, key: string): CatalogueField | undefined {
  return ctx.catalogue.fields.find((f) => f.key === key);
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** One value the way a person reads it: an option's label, a province name, a date, a number with its unit. */
export function displayValue(field: CatalogueField, raw: string, ctx: PhraseContext): string {
  if (raw.trim() === "") return t.eligibility.summary.missingValue;

  switch (field.valueType) {
    case "Choice":
      return field.optionsSource === "CampaignProvinces"
        ? (ctx.provinces.find((p) => p.id === raw)?.name ?? raw)
        : (field.options.find((o) => o.key === raw)?.label ?? raw);
    case "Date":
      return formatDate(raw);
    case "Number":
      return field.unit && field.unit !== "years" ? `${raw} ${field.unit}` : raw;
    default:
      return raw;
  }
}

/** The values to put in a sentence. Missing ones show as "…" so the summary works while typing. */
function valuesFor(rule: Rule, field: CatalogueField, ctx: PhraseContext): string[] {
  const arity = field.operators.find((o) => o.key === rule.operatorKey)?.arity;
  const wanted = arity === "Two" ? 2 : arity === "One" ? 1 : 0;
  const shown = rule.values.map((v) => displayValue(field, v, ctx));
  while (shown.length < wanted) shown.push(t.eligibility.summary.missingValue);
  return shown;
}

/** "age is between 17 and 23", or "…" for a rule that has no field yet. */
export function describeRule(rule: Rule, ctx: PhraseContext): string {
  const field = findField(ctx, rule.fieldKey);
  const phrase = t.eligibility.phrase[rule.operatorKey];
  if (!field || !phrase) return t.eligibility.summary.missingValue;
  return phrase(lowerFirst(field.label), valuesFor(rule, field, ctx));
}

/** The reason pre-filled for a rule: "Age must be between 17 and 23." */
export function defaultMessage(rule: Rule, ctx: PhraseContext): string {
  const field = findField(ctx, rule.fieldKey);
  const template = t.eligibility.defaultMessage[rule.operatorKey];
  if (!field || !template) return t.eligibility.fallbackMessage;
  return template(field.label, valuesFor(rule, field, ctx));
}

export type Summary = {
  /** "A candidate is eligible if: ..." or null when there is no active mandatory rule. */
  eligibleSentence: string | null;
  /** The optional rules, or null when there are none. */
  optionalSentence: string | null;
  /** True when there is no rule at all. */
  isEmpty: boolean;
};

/**
 * The whole rule set as a sentence. Only active mandatory rules decide eligibility, so only they
 * are in the main sentence: an ALL group's rules join with AND, an ANY group becomes one
 * bracketed OR part, and the parts join with AND (groups always combine with ALL). Optional
 * rules get their own line, because they never block anyone.
 */
export function summarize(groups: Group[], ctx: PhraseContext): Summary {
  const parts: string[] = [];
  const optional: string[] = [];
  let ruleCount = 0;

  for (const group of groups) {
    const mandatory: string[] = [];
    for (const rule of group.rules) {
      ruleCount++;
      if (!rule.isActive) continue;
      (rule.type === "Mandatory" ? mandatory : optional).push(describeRule(rule, ctx));
    }

    if (mandatory.length === 0) continue;
    if (group.logic === "All" || mandatory.length === 1) {
      parts.push(...mandatory);
    } else {
      parts.push(`(${mandatory.join(t.eligibility.summary.or)})`);
    }
  }

  const sentence = t.eligibility.summary;
  return {
    isEmpty: ruleCount === 0,
    eligibleSentence: parts.length > 0 ? `${sentence.intro} ${parts.join(sentence.and)}.` : null,
    optionalSentence:
      optional.length > 0 ? `${sentence.optionalIntro} ${optional.join(sentence.optionalSeparator)}.` : null,
  };
}
