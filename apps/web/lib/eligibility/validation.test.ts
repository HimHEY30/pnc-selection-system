import { describe, expect, it } from "vitest";
import { CATALOGUE, group, PROVINCES, rule } from "@/test-utils/eligibility-fixtures";
import { canonicalValues, groupKey, ruleKey, validateRuleSet, validateValues } from "./validation";

const field = (key: string) => CATALOGUE.fields.find((f) => f.key === key)!;
const op = (fieldKey: string, key: string) => field(fieldKey).operators.find((o) => o.key === key)!;

const check = (fieldKey: string, opKey: string, values: string[], allowed: string[] | null = null) =>
  validateValues(field(fieldKey), op(fieldKey, opKey), values, allowed);

describe("validateValues", () => {
  it.each([
    ["age", "at_least", [], "Enter a value."],
    ["age", "between", ["17"], "Enter both values."],
    ["age", "between", ["17", ""], "Enter both values."],
    ["gender", "is_one_of", [], "Choose at least one option."],
    ["gender", "is", [""], "Enter a value."],
    ["age", "at_least", ["abc"], "Enter a number."],
    ["age", "at_least", ["1e3"], "Enter a number."],
    ["age", "at_least", ["17.5"], "Use a whole number."],
    ["family_income", "at_most", ["10.555"], "Use at most 2 decimal places."],
    ["age", "at_least", ["-1"], "Enter 0 or more."],
    ["age", "at_most", ["121"], "Enter 120 or less."],
    ["age", "between", ["23", "17"], "The first value must be lower than the second."],
    ["age", "between", ["20", "20"], "The first value must be lower than the second."],
  ])("explains %s %s %j", (f, o, values, expected) => {
    expect(check(f, o, values)).toBe(expected);
  });

  it.each([
    ["age", "equals", ["17"]],
    ["age", "equals", ["17.0"]],
    ["age", "between", ["17", "23"]],
    ["family_income", "at_most", ["250.75"]],
    ["family_income", "at_most", ["250.50"]],
    ["gender", "is_one_of", ["female", "male"]],
    ["attended_info_session", "is_yes", []],
  ])("accepts %s %s %j", (f, o, values) => {
    expect(check(f, o, values)).toBeNull();
  });

  it("checks choices against the allowed list when there is one", () => {
    const grades = field("highest_grade").options.map((x) => x.key);

    expect(check("highest_grade", "is_one_of", ["grade_12"], grades)).toBeNull();
    expect(check("highest_grade", "is_one_of", ["grade_13"], grades)).toBe("Choose from the list.");
  });

  it("explains a province that is not a target of the campaign", () => {
    expect(check("province", "is", ["21"], ["2", "17"])).toBe(
      "Choose only target provinces of this campaign. Change them in Step 1.",
    );
    expect(check("province", "is", ["21"], null)).toBeNull();
  });

  it("checks dates", () => {
    const date = { ...field("age"), valueType: "Date" as const, unit: null, minValue: null, maxValue: null };
    const before = { key: "before", label: "before", arity: "One" as const };
    const between = { key: "date_between", label: "between", arity: "Two" as const };

    expect(validateValues(date, before, ["2026-11-02"], null)).toBeNull();
    expect(validateValues(date, before, ["2026-02-30"], null)).toBe("Enter a date as year-month-day.");
    expect(validateValues(date, between, ["2026-12-01", "2026-01-01"], null)).toBe("The first value must be lower than the second.");
  });
});

describe("canonicalValues", () => {
  it("gives numbers and lists one spelling", () => {
    expect(canonicalValues(field("age"), op("age", "between"), ["17.0", "23"])).toEqual(["17", "23"]);
    expect(canonicalValues(field("family_income"), op("family_income", "equals"), ["250.50"])).toEqual(["250.5"]);
    expect(canonicalValues(field("highest_grade"), op("highest_grade", "is_one_of"), ["grade_12", "grade_10", "grade_12"])).toEqual([
      "grade_10",
      "grade_12",
    ]);
  });
});

describe("validateRuleSet", () => {
  const validate = (groups: ReturnType<typeof group>[], mode: "draft" | "complete" = "draft", ageReferenceDate: string | null = "2026-11-02") =>
    validateRuleSet({ ageReferenceDate, groups }, CATALOGUE, PROVINCES, mode);

  it("passes a good rule set in both modes", () => {
    const groups = [group([rule("age", "between", ["17", "23"]), rule("province", "is_one_of", ["2", "17"])])];

    expect(validate(groups, "draft")).toEqual({});
    expect(validate(groups, "complete")).toEqual({});
  });

  it("puts each problem under the right input", () => {
    const bad = rule("age", "between", ["23", "17"]);
    const noMessage = rule("gender", "is", ["female"], { message: "  " });
    const long = rule("marital_status", "is", ["single"], { message: "x".repeat(201) });
    const noField = rule("", "", []);

    const errors = validate([group([bad, noMessage, long, noField])]);

    expect(errors[ruleKey(bad.id, "values")]).toBe("The first value must be lower than the second.");
    expect(errors[ruleKey(noMessage.id, "message")]).toBe("Write the reason shown when a candidate fails this rule.");
    expect(errors[ruleKey(long.id, "message")]).toBe("The message must be 200 characters or fewer.");
    expect(errors[ruleKey(noField.id, "field")]).toBe("Choose a field.");
  });

  it("flags a duplicate on the later copy, comparing canonical values", () => {
    const first = rule("age", "between", ["17", "23"]);
    const second = rule("age", "between", ["17.0", "23"]);

    const errors = validate([group([first, second])]);

    expect(errors[ruleKey(first.id)]).toBeUndefined();
    expect(errors[ruleKey(second.id)]).toBe("The same rule already exists in this group.");
  });

  it("does not call the same rule in two groups a duplicate", () => {
    const errors = validate([group([rule("age", "at_least", ["17"])]), group([rule("age", "at_least", ["17"])])]);

    expect(errors).toEqual({});
  });

  it("needs a group name of up to 60 characters", () => {
    const unnamed = group([], { name: " " });
    const long = group([], { name: "x".repeat(61) });

    const errors = validate([unnamed, long]);

    expect(errors[groupKey(unnamed.id, "name")]).toBe("Give the group a name.");
    expect(errors[groupKey(long.id, "name")]).toBe("Group name must be 60 characters or fewer.");
  });

  it("lets a draft keep a province that is not a target, but not a finished step", () => {
    const groups = [group([rule("province", "is", ["21"])])];

    expect(validate(groups, "draft")).toEqual({});
    expect(Object.values(validate(groups, "complete"))).toContain(
      "Choose only target provinces of this campaign. Change them in Step 1.",
    );
  });

  it("needs an active mandatory rule to complete", () => {
    const needs = "Add at least one active mandatory rule.";

    expect(validate([], "complete").rules).toBe(needs);
    expect(validate([group([rule("gender", "is", ["female"], { type: "Optional" })])], "complete").rules).toBe(needs);
    expect(validate([group([rule("gender", "is", ["female"], { isActive: false })])], "complete").rules).toBe(needs);
    expect(validate([group([rule("gender", "is", ["female"])])], "complete").rules).toBeUndefined();
    expect(validate([], "draft").rules).toBeUndefined();
  });

  it("needs the age reference date once an age rule is active", () => {
    const groups = [group([rule("age", "at_least", ["17"])])];

    expect(validate(groups, "complete", null).ageReferenceDate).toBe("Choose the date ages are calculated on.");
    expect(validate(groups, "complete", "2026-11-02").ageReferenceDate).toBeUndefined();
    expect(validate(groups, "draft", null).ageReferenceDate).toBeUndefined();
    expect(validate([group([rule("age", "at_least", ["17"], { isActive: false }), rule("gender", "is", ["female"])])], "complete", null).ageReferenceDate).toBeUndefined();
  });
});
