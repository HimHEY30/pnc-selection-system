import { describe, expect, it } from "vitest";
import { CATALOGUE, ENGLISH, examCatalogue, group, LOGIC, MATH, PROVINCES, rule, SUBJECTS } from "@/test-utils/eligibility-fixtures";
import { defaultMessage, describeRule, displayValue, findField, summarize } from "./phrases";

const ctx = { catalogue: CATALOGUE, provinces: PROVINCES };

describe("displayValue", () => {
  it("shows an option by its label", () => {
    expect(displayValue(findField(ctx, "highest_grade")!, "grade_12", ctx)).toBe("Grade 12");
  });

  it("shows a province by its name, and an unknown one by its id", () => {
    const province = findField(ctx, "province")!;
    expect(displayValue(province, "17", ctx)).toBe("Siem Reap");
    expect(displayValue(province, "99", ctx)).toBe("99");
  });

  it("adds the unit to money but not to ages", () => {
    expect(displayValue(findField(ctx, "family_income")!, "300", ctx)).toBe("300 USD");
    expect(displayValue(findField(ctx, "age")!, "17", ctx)).toBe("17");
  });

  it("writes dates the way the rest of the app does", () => {
    const date = { ...findField(ctx, "age")!, valueType: "Date" as const, unit: null };
    expect(displayValue(date, "2026-11-02", ctx)).toBe("2 Nov 2026");
  });

  it("shows a missing value as an ellipsis", () => {
    expect(displayValue(findField(ctx, "age")!, "  ", ctx)).toBe("…");
  });
});

describe("describeRule", () => {
  it.each([
    [rule("age", "between", ["17", "23"]), "age is between 17 and 23"],
    [rule("age", "equals", ["20"]), "age is 20"],
    [rule("age", "less_than", ["20"]), "age is less than 20"],
    [rule("age", "at_most", ["20"]), "age is at most 20"],
    [rule("age", "greater_than", ["20"]), "age is greater than 20"],
    [rule("age", "at_least", ["20"]), "age is at least 20"],
    [rule("gender", "is", ["female"]), "gender is Female"],
    [rule("gender", "is_not", ["male"]), "gender is not Male"],
    [rule("highest_grade", "is_one_of", ["grade_12", "diploma_or_higher"]), "highest grade completed is one of Grade 12, Diploma or higher"],
    [rule("highest_grade", "is_none_of", ["grade_9"]), "highest grade completed is none of Grade 9"],
    [rule("attended_info_session", "is_yes"), "attended an information session is yes"],
    [rule("attended_info_session", "is_no"), "attended an information session is no"],
    [rule("province", "is_one_of", ["2", "17"]), "province is one of Battambang, Siem Reap"],
    [rule("family_income", "at_most", ["300"]), "family monthly income is at most 300 USD"],
  ])("reads %# as a sentence", (r, expected) => {
    expect(describeRule(r, ctx)).toBe(expected);
  });

  it("shows ellipses for values that are not filled in yet", () => {
    expect(describeRule(rule("age", "between", ["17"]), ctx)).toBe("age is between 17 and …");
    expect(describeRule(rule("age", "at_least", []), ctx)).toBe("age is at least …");
  });

  it("shows an ellipsis for a rule with no field yet", () => {
    expect(describeRule(rule("", "", []), ctx)).toBe("…");
  });
});

describe("defaultMessage", () => {
  it.each([
    [rule("age", "between", ["17", "23"]), "Age must be between 17 and 23."],
    [rule("age", "at_least", ["17"]), "Age must be at least 17."],
    [rule("gender", "is", ["female"]), "Gender must be Female."],
    [rule("highest_grade", "is_one_of", ["grade_12", "diploma_or_higher"]), "Highest grade completed must be one of: Grade 12, Diploma or higher."],
    [rule("marital_status", "is_not", ["married"]), "Marital status must not be Married."],
    [rule("attended_info_session", "is_yes"), "Attended an information session must be yes."],
    [rule("family_income", "at_most", ["300"]), "Family monthly income must be at most 300 USD."],
  ])("pre-fills %# with a plain reason", (r, expected) => {
    expect(defaultMessage(r, ctx)).toBe(expected);
  });

  it("falls back to a general sentence when the rule is not filled in", () => {
    expect(defaultMessage(rule("", "", []), ctx)).toBe("The candidate does not meet this rule.");
  });
});

describe("lists of choices read in a natural order", () => {
  it("puts grades in the order of the grade list, whatever order they were stored in", () => {
    const r = rule("highest_grade", "is_one_of", ["diploma_or_higher", "grade_12"]); // stored sorted by key

    expect(describeRule(r, ctx)).toBe("highest grade completed is one of Grade 12, Diploma or higher");
    expect(defaultMessage(r, ctx)).toBe("Highest grade completed must be one of: Grade 12, Diploma or higher.");
  });

  it("puts provinces in the campaign's A to Z order", () => {
    const r = rule("province", "is_one_of", ["17", "2"]); // "17" sorts before "2" as text

    expect(describeRule(r, ctx)).toBe("province is one of Battambang, Siem Reap");
  });

  it("puts values it does not know last, rather than dropping them", () => {
    const r = rule("province", "is_one_of", ["99", "17"]);

    expect(describeRule(r, ctx)).toBe("province is one of Siem Reap, 99");
  });

  it("does not change the stored values", () => {
    const r = rule("highest_grade", "is_none_of", ["grade_9", "grade_10"]);

    describeRule(r, ctx);

    expect(r.values).toEqual(["grade_9", "grade_10"]);
  });
});

describe("summarize", () => {
  it("says nothing is set when there are no rules", () => {
    expect(summarize([], ctx)).toEqual({ isEmpty: true, eligibleSentence: null, optionalSentence: null });
    expect(summarize([group([])], ctx).isEmpty).toBe(true);
  });

  it("writes the example from the brief", () => {
    const groups = [
      group([
        rule("age", "between", ["17", "23"]),
        rule("highest_grade", "is", ["grade_12"]),
        rule("province", "is_one_of", ["2", "17"]),
      ]),
    ];

    expect(summarize(groups, ctx).eligibleSentence).toBe(
      "A candidate is eligible if: age is between 17 and 23, AND highest grade completed is Grade 12, AND province is one of Battambang, Siem Reap.",
    );
  });

  it("brackets an ANY group as one OR part", () => {
    const groups = [
      group([rule("age", "at_least", ["17"])]),
      group([rule("province", "is", ["2"]), rule("province", "is", ["17"])], { logic: "Any" }),
    ];

    expect(summarize(groups, ctx).eligibleSentence).toBe(
      "A candidate is eligible if: age is at least 17, AND (province is Battambang OR province is Siem Reap).",
    );
  });

  it("does not bracket an ANY group that has a single rule", () => {
    const groups = [group([rule("age", "at_least", ["17"])], { logic: "Any" })];

    expect(summarize(groups, ctx).eligibleSentence).toBe("A candidate is eligible if: age is at least 17.");
  });

  it("leaves out inactive rules and puts optional rules on their own line", () => {
    const groups = [
      group([
        rule("age", "at_least", ["17"]),
        rule("gender", "is", ["female"], { isActive: false }),
        rule("attended_info_session", "is_yes", [], { type: "Optional" }),
        rule("marital_status", "is", ["single"], { type: "Optional" }),
      ]),
    ];

    const summary = summarize(groups, ctx);

    expect(summary.eligibleSentence).toBe("A candidate is eligible if: age is at least 17.");
    expect(summary.optionalSentence).toBe(
      "Optional rules (a candidate who fails these is only given a warning): attended an information session is yes; marital status is Single.",
    );
  });

  it("has no eligibility sentence when only optional or inactive rules exist", () => {
    const groups = [group([rule("gender", "is", ["female"], { type: "Optional" }), rule("age", "at_least", ["17"], { isActive: false })])];

    const summary = summarize(groups, ctx);

    expect(summary.isEmpty).toBe(false);
    expect(summary.eligibleSentence).toBeNull();
    expect(summary.optionalSentence).not.toBeNull();
  });

  it("works while a rule is half filled in", () => {
    const groups = [group([rule("age", "between", ["17"])])];

    expect(summarize(groups, ctx).eligibleSentence).toBe("A candidate is eligible if: age is between 17 and ….");
  });
});

describe("exam subjects", () => {
  const examCtx = { catalogue: examCatalogue(), provinces: PROVINCES };

  it.each([
    [rule(MATH, "at_least", ["50"]), "math score is at least 50 points"],
    [rule(LOGIC, "between", ["40", "90"]), "logic score is between 40 points and 90 points"],
    [rule(ENGLISH, "less_than", ["30.5"]), "english score is less than 30.5 points"],
    [rule("exam_total", "at_least", ["200"]), "total exam score is at least 200 points"],
    [rule("exam_average", "greater_than", ["65"]), "average exam score is greater than 65 points"],
  ])("reads %# as a sentence", (r, expected) => {
    expect(describeRule(r, examCtx)).toBe(expected);
  });

  it.each([
    [rule(MATH, "at_least", ["50"]), "Math score must be at least 50 points."],
    [rule("exam_average", "at_least", ["60"]), "Average exam score must be at least 60 points."],
  ])("pre-fills %# with a plain reason", (r, expected) => {
    expect(defaultMessage(r, examCtx)).toBe(expected);
  });

  it("writes subject rules into the summary with the other rules", () => {
    const groups = [group([rule("age", "at_least", ["17"]), rule(MATH, "at_least", ["50"]), rule("exam_average", "at_least", ["60"], { type: "Optional" })])];

    const summary = summarize(groups, examCtx);

    expect(summary.eligibleSentence).toBe("A candidate is eligible if: age is at least 17, AND math score is at least 50 points.");
    expect(summary.optionalSentence).toContain("average exam score is at least 60 points");
  });

  it("follows a renamed subject, because the catalogue label changes and the rule keeps its key", () => {
    const renamed = examCatalogue(SUBJECTS.map((s) => (s.key === MATH ? { ...s, name: "Mathematics" } : s)));

    expect(describeRule(rule(MATH, "at_least", ["50"]), { catalogue: renamed, provinces: PROVINCES })).toBe("mathematics score is at least 50 points");
  });
});
