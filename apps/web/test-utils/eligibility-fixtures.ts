import type { Catalogue, CatalogueField, CatalogueOperator, Group, Rule, TargetProvince } from "@/lib/eligibility/types";

// A copy of the launch catalogue, in the shape the backend sends it. Keep in step with
// LaunchCatalogue.cs and OperatorDefinition.Defaults on the backend.

const NUMBER_OPS: CatalogueOperator[] = [
  { key: "equals", label: "equals", arity: "One" },
  { key: "less_than", label: "less than", arity: "One" },
  { key: "at_most", label: "at most", arity: "One" },
  { key: "greater_than", label: "greater than", arity: "One" },
  { key: "at_least", label: "at least", arity: "One" },
  { key: "between", label: "between", arity: "Two" },
];
const CHOICE_OPS: CatalogueOperator[] = [
  { key: "is", label: "is", arity: "One" },
  { key: "is_not", label: "is not", arity: "One" },
  { key: "is_one_of", label: "is one of", arity: "List" },
  { key: "is_none_of", label: "is none of", arity: "List" },
];
const YESNO_OPS: CatalogueOperator[] = [
  { key: "is_yes", label: "is yes", arity: "None" },
  { key: "is_no", label: "is no", arity: "None" },
];
export const DATE_OPS: CatalogueOperator[] = [
  { key: "before", label: "before", arity: "One" },
  { key: "after", label: "after", arity: "One" },
  { key: "date_between", label: "between", arity: "Two" },
];

const field = (f: Partial<CatalogueField> & Pick<CatalogueField, "key" | "label" | "valueType" | "operators">): CatalogueField => ({
  optionsSource: null,
  unit: null,
  decimals: 0,
  minValue: null,
  maxValue: null,
  options: [],
  ...f,
});

export const CATALOGUE: Catalogue = {
  fields: [
    field({ key: "age", label: "Age", valueType: "Number", operators: NUMBER_OPS, unit: "years", minValue: 0, maxValue: 120 }),
    field({
      key: "gender", label: "Gender", valueType: "Choice", operators: CHOICE_OPS, optionsSource: "Fixed",
      options: [{ key: "female", label: "Female" }, { key: "male", label: "Male" }],
    }),
    field({ key: "province", label: "Province", valueType: "Choice", operators: CHOICE_OPS, optionsSource: "CampaignProvinces" }),
    field({
      key: "highest_grade", label: "Highest grade completed", valueType: "Choice", operators: CHOICE_OPS, optionsSource: "Fixed",
      options: [
        { key: "grade_9", label: "Grade 9" },
        { key: "grade_10", label: "Grade 10" },
        { key: "grade_11", label: "Grade 11" },
        { key: "grade_12", label: "Grade 12" },
        { key: "diploma_or_higher", label: "Diploma or higher" },
      ],
    }),
    field({
      key: "grade12_result", label: "Grade 12 exam result", valueType: "Choice", operators: CHOICE_OPS, optionsSource: "Fixed",
      options: ["A", "B", "C", "D", "E", "F"].map((k) => ({ key: k, label: k })),
    }),
    field({ key: "family_income", label: "Family monthly income", valueType: "Number", operators: NUMBER_OPS, unit: "USD", decimals: 2, minValue: 0 }),
    field({
      key: "marital_status", label: "Marital status", valueType: "Choice", operators: CHOICE_OPS, optionsSource: "Fixed",
      options: [
        { key: "single", label: "Single" },
        { key: "married", label: "Married" },
        { key: "divorced", label: "Divorced" },
        { key: "widowed", label: "Widowed" },
      ],
    }),
    field({ key: "attended_info_session", label: "Attended an information session", valueType: "YesNo", operators: YESNO_OPS }),
  ],
};

export const PROVINCES: TargetProvince[] = [
  { id: "2", name: "Battambang" },
  { id: "17", name: "Siem Reap" },
];

let counter = 0;
/** Predictable ids so tests can refer to a rule or group by name. */
export function testId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export function rule(fieldKey: string, operatorKey: string, values: string[] = [], overrides: Partial<Rule> = {}): Rule {
  return {
    id: testId(),
    fieldKey,
    operatorKey,
    values,
    type: "Mandatory",
    message: `${fieldKey} ${operatorKey}`,
    isActive: true,
    ...overrides,
  };
}

export function group(rules: Rule[], overrides: Partial<Group> = {}): Group {
  return { id: testId(), name: "Group 1", logic: "All", rules, ...overrides };
}
