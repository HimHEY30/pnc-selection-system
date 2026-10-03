// Shapes of the backend's eligibility API (see Eligibility.Application/Contracts.cs).
// Safe to import from client components - this file has no server-only code.

export type ValueType = "Number" | "Choice" | "YesNo" | "Date";
export type Arity = "None" | "One" | "Two" | "List";
export type OptionsSource = "Fixed" | "CampaignProvinces";
/**
 * How a field's value is got. "AgeFromBirthDate": worked out from the date of birth. "ExamScore": one exam
 * subject's score. "ExamTotal" and "ExamAverage": worked out from every subject's score.
 */
export type Derivation = "None" | "AgeFromBirthDate" | "ExamScore" | "ExamTotal" | "ExamAverage";

export type CatalogueOperator = { key: string; label: string; arity: Arity };
export type CatalogueOption = { key: string; label: string };

/** One field a rule can check, with everything the builder needs to show inputs for it. */
export type CatalogueField = {
  key: string;
  label: string;
  valueType: ValueType;
  optionsSource: OptionsSource | null;
  derivation: Derivation;
  /** The attribute a sample candidate supplies for this field (the date of birth, for age). */
  candidateAttribute: string;
  unit: string | null;
  decimals: number;
  minValue: number | null;
  maxValue: number | null;
  options: CatalogueOption[];
  operators: CatalogueOperator[];
};

export type Catalogue = { fields: CatalogueField[] };

/** One exam subject of a campaign. `key` is the field key rules use; `ruleCount` is how many saved rules use it. */
export type Subject = { key: string; name: string; ruleCount: number };

/** A campaign's exam subjects and the catalogue that results from them (the rule builder uses this one). */
export type ExamSetup = { subjects: Subject[]; maxSubjects: number; catalogue: Catalogue };

export type RuleType = "Mandatory" | "Optional";
export type GroupLogic = "All" | "Any";

/** A rule as the backend stores it. Values are text for every field type. */
export type Rule = {
  id: string;
  fieldKey: string;
  operatorKey: string;
  values: string[];
  type: RuleType;
  message: string;
  isActive: boolean;
};

export type Group = { id: string; name: string; logic: GroupLogic; rules: Rule[] };

export type TargetProvince = { id: string; name: string };

export type StepStatusName = "NotStarted" | "InProgress" | "Complete";

export type RuleSetData = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  /** ISO date, yyyy-mm-dd. */
  campaignStartDate: string | null;
  isLocked: boolean;
  stepStatus: StepStatusName;
  ageReferenceDate: string | null;
  groups: Group[];
  targetProvinces: TargetProvince[];
  /** Concurrency token: send it back when saving so a clash is detected. */
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type SuggestedData = { ageReferenceDate: string | null; groups: Group[] };

/** Body of both saves. */
export type SaveRequest = { ageReferenceDate: string | null; groups: Group[]; version: number | null };

/** A sample candidate: attribute key to text. Blank or missing means "not provided". */
export type SampleCandidate = Record<string, string>;

export type RuleOutcome = "Passed" | "Failed" | "Skipped";

export type TestRuleResult = {
  ruleId: string;
  groupId: string;
  fieldKey: string;
  type: RuleType;
  outcome: RuleOutcome;
  message: string | null;
  dataMissing: boolean;
};

export type TestGroupResult = { groupId: string; logic: GroupLogic; counted: boolean; passed: boolean };

export type TestResult = {
  eligible: boolean;
  warnings: number;
  failedMandatory: number;
  groups: TestGroupResult[];
  rules: TestRuleResult[];
};
