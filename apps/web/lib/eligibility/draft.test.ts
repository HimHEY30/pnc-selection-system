import { beforeEach, describe, expect, it } from "vitest";
import { CATALOGUE, examCatalogue, group, MATH, PROVINCES, rule, SUBJECTS } from "@/test-utils/eligibility-fixtures";
import {
  allRules,
  createDraftReducer,
  initialState,
  isDirty,
  snapshot,
  toRequest,
  type DraftAction,
  type DraftState,
} from "./draft";
import type { RuleSetData } from "./types";

let ids = 0;
const newId = () => `new-${++ids}`;
const env = { catalogue: CATALOGUE, provinces: PROVINCES, campaignStartDate: "2026-11-02", newId };
const reduce = createDraftReducer(env);

const data = (groups: RuleSetData["groups"] = [], overrides: Partial<RuleSetData> = {}): RuleSetData => ({
  campaignId: "c1",
  campaignName: "Selection 2027",
  campaignStatus: "Draft",
  campaignStartDate: "2026-11-02",
  isLocked: false,
  stepStatus: "NotStarted",
  ageReferenceDate: null,
  groups,
  targetProvinces: PROVINCES,
  version: 0,
  updatedAt: null,
  updatedByName: null,
  ...overrides,
});

const start = (groups: RuleSetData["groups"] = [], overrides: Partial<RuleSetData> = {}) =>
  initialState(data(groups, overrides), env);

const run = (state: DraftState, ...actions: DraftAction[]) => actions.reduce(reduce, state);

const ruleOf = (state: DraftState, id: string) => allRules(state).find((r) => r.id === id)!;

beforeEach(() => {
  ids = 0;
});

describe("initialState", () => {
  it("starts clean, and empty for a campaign with no rules", () => {
    const state = start();

    expect(state.groups).toEqual([]);
    expect(state.ageReferenceDate).toBe("");
    expect(isDirty(state)).toBe(false);
  });

  it("keeps a message the user wrote, and follows one that is still the pre-filled sentence", () => {
    const written = rule("age", "between", ["17", "23"], { message: "Applicants must be 17 to 23." });
    const prefilled = rule("age", "at_least", ["17"], { message: "Age must be at least 17." });

    const state = start([group([written, prefilled])]);

    expect(ruleOf(state, written.id).customMessage).toBe(true);
    expect(ruleOf(state, prefilled.id).customMessage).toBe(false);
  });
});

describe("groups", () => {
  it("adds a group named Group 1, Group 2, ... using the lowest free number", () => {
    const state = run(start(), { type: "addGroup" }, { type: "addGroup" });

    expect(state.groups.map((g) => g.name)).toEqual(["Group 1", "Group 2"]);
    expect(state.groups.every((g) => g.logic === "All" && g.rules.length === 0)).toBe(true);

    const gap = run(state, { type: "deleteGroup", groupId: state.groups[0].id }, { type: "addGroup" });
    expect(gap.groups.map((g) => g.name)).toEqual(["Group 2", "Group 1"]);
  });

  it("renames a group and switches it between ALL and ANY", () => {
    const g = group([]);
    const state = run(start([g]), { type: "renameGroup", groupId: g.id, name: "Basics" }, { type: "setLogic", groupId: g.id, logic: "Any" });

    expect(state.groups[0]).toMatchObject({ name: "Basics", logic: "Any" });
  });

  it("deletes a group with its rules", () => {
    const g = group([rule("age", "at_least", ["17"])]);
    const keep = group([rule("gender", "is", ["female"])]);

    const state = run(start([g, keep]), { type: "deleteGroup", groupId: g.id });

    expect(state.groups.map((x) => x.id)).toEqual([keep.id]);
  });

  it("moves a group up and down, and stops at the ends", () => {
    const a = group([]);
    const b = group([]);
    const c = group([]);
    const state = start([a, b, c]);

    expect(run(state, { type: "moveGroup", groupId: c.id, direction: -1 }).groups.map((g) => g.id)).toEqual([a.id, c.id, b.id]);
    expect(run(state, { type: "moveGroup", groupId: a.id, direction: 1 }).groups.map((g) => g.id)).toEqual([b.id, a.id, c.id]);
    expect(run(state, { type: "moveGroup", groupId: a.id, direction: -1 })).toBe(state);
    expect(run(state, { type: "moveGroup", groupId: c.id, direction: 1 })).toBe(state);
  });

  it("reorders groups to a given order (drag and drop)", () => {
    const [a, b, c] = [group([]), group([]), group([])];

    const state = run(start([a, b, c]), { type: "reorderGroups", orderedIds: [c.id, a.id, b.id] });

    expect(state.groups.map((g) => g.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe("adding a rule", () => {
  it("adds a mandatory, active rule on the first field, with the pre-filled message", () => {
    const g = group([]);

    const state = run(start([g]), { type: "addRule", groupId: g.id });

    const added = state.groups[0].rules[0];
    expect(added).toMatchObject({ fieldKey: "age", operatorKey: "equals", values: [], type: "Mandatory", isActive: true, customMessage: false });
    expect(added.message).toBe("Age must be equal to ….");
  });

  it("suggests the campaign start date as the age reference date the first time", () => {
    const g = group([]);

    const state = run(start([g]), { type: "addRule", groupId: g.id });

    expect(state.ageReferenceDate).toBe("2026-11-02");
  });

  it("does not overwrite a reference date that is already chosen", () => {
    const g = group([]);

    const state = run(start([g], { ageReferenceDate: "2027-01-01" }), { type: "addRule", groupId: g.id });

    expect(state.ageReferenceDate).toBe("2027-01-01");
  });
});

describe("adding the first rule", () => {
  it("creates a group with a rule in it, in one step", () => {
    const state = run(start(), { type: "addFirstRule" });

    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toMatchObject({ name: "Group 1", logic: "All" });
    expect(state.groups[0].rules).toHaveLength(1);
    expect(state.groups[0].rules[0]).toMatchObject({ fieldKey: "age", type: "Mandatory", isActive: true });
    expect(isDirty(state)).toBe(true);
  });

  it("suggests the age reference date, like any first age rule", () => {
    expect(run(start(), { type: "addFirstRule" }).ageReferenceDate).toBe("2026-11-02");
  });

  it("adds beside existing groups without touching them", () => {
    const existing = group([rule("gender", "is", ["female"])], { name: "Group 1" });

    const state = run(start([existing]), { type: "addFirstRule" });

    expect(state.groups.map((g) => g.name)).toEqual(["Group 1", "Group 2"]);
    expect(state.groups[0].rules).toHaveLength(1);
  });
});

describe("editing a rule", () => {
  const age = () => rule("age", "between", ["17", "23"], { message: "Age must be between 17 and 23." });

  it("resets the operator and values when the field changes", () => {
    const r = age();
    const state = run(start([group([r])]), { type: "updateRule", ruleId: r.id, patch: { fieldKey: "gender" } });

    expect(ruleOf(state, r.id)).toMatchObject({ fieldKey: "gender", operatorKey: "is", values: [] });
  });

  it("keeps the pre-filled message in step with the rule, until the user writes their own", () => {
    const r = age();
    let state = run(start([group([r])]), { type: "updateRule", ruleId: r.id, patch: { values: ["18", "25"] } });
    expect(ruleOf(state, r.id).message).toBe("Age must be between 18 and 25.");

    state = run(state, { type: "updateRule", ruleId: r.id, patch: { message: "Be 18 to 25." } });
    expect(ruleOf(state, r.id).customMessage).toBe(true);

    state = run(state, { type: "updateRule", ruleId: r.id, patch: { values: ["19", "25"] } });
    expect(ruleOf(state, r.id).message).toBe("Be 18 to 25.");
  });

  it("treats a message typed back to the pre-filled sentence as pre-filled again", () => {
    const r = rule("age", "at_least", ["17"], { message: "Custom." });
    let state = start([group([r])]);
    expect(ruleOf(state, r.id).customMessage).toBe(true);

    state = run(state, { type: "updateRule", ruleId: r.id, patch: { message: "Age must be at least 17." } });
    expect(ruleOf(state, r.id).customMessage).toBe(false);
  });

  it("adapts the values to the new operator", () => {
    const r = age();
    const toOne = run(start([group([r])]), { type: "updateRule", ruleId: r.id, patch: { operatorKey: "at_least" } });
    expect(ruleOf(toOne, r.id).values).toEqual(["17"]);

    const toTwo = run(toOne, { type: "updateRule", ruleId: r.id, patch: { operatorKey: "between" } });
    expect(ruleOf(toTwo, r.id).values).toEqual(["17", ""]);

    const g = rule("attended_info_session", "is_yes", []);
    const yes = run(start([group([g])]), { type: "updateRule", ruleId: g.id, patch: { operatorKey: "is_no" } });
    expect(ruleOf(yes, g.id).values).toEqual([]);

    const grade = rule("highest_grade", "is", ["grade_12"]);
    const list = run(start([group([grade])]), { type: "updateRule", ruleId: grade.id, patch: { operatorKey: "is_one_of" } });
    expect(ruleOf(list, grade.id).values).toEqual(["grade_12"]);
  });

  it("changes the type and switches a rule off and on", () => {
    const r = age();
    let state = run(start([group([r])]), { type: "updateRule", ruleId: r.id, patch: { type: "Optional", isActive: false } });
    expect(ruleOf(state, r.id)).toMatchObject({ type: "Optional", isActive: false });

    state = run(state, { type: "updateRule", ruleId: r.id, patch: { isActive: true } });
    expect(ruleOf(state, r.id).isActive).toBe(true);
  });

  it("suggests the reference date when a rule is switched to the age field", () => {
    const r = rule("gender", "is", ["female"]);

    const state = run(start([group([r])]), { type: "updateRule", ruleId: r.id, patch: { fieldKey: "age" } });

    expect(state.ageReferenceDate).toBe("2026-11-02");
  });

  it("only changes the rule that was edited", () => {
    const a = age();
    const b = rule("gender", "is", ["female"]);

    const state = run(start([group([a, b])]), { type: "updateRule", ruleId: a.id, patch: { isActive: false } });

    expect(ruleOf(state, b.id).isActive).toBe(true);
  });
});

describe("deleting, moving and reordering rules", () => {
  const rules = () => [rule("age", "at_least", ["17"]), rule("gender", "is", ["female"]), rule("province", "is", ["2"])];

  it("deletes a rule", () => {
    const [a, b, c] = rules();
    const g = group([a, b, c]);

    const state = run(start([g]), { type: "deleteRule", ruleId: b.id });

    expect(state.groups[0].rules.map((r) => r.id)).toEqual([a.id, c.id]);
  });

  it("moves a rule up and down with the keyboard actions, and stops at the ends", () => {
    const [a, b, c] = rules();
    const state = start([group([a, b, c])]);

    expect(run(state, { type: "moveRule", ruleId: c.id, direction: -1 }).groups[0].rules.map((r) => r.id)).toEqual([a.id, c.id, b.id]);
    expect(run(state, { type: "moveRule", ruleId: a.id, direction: 1 }).groups[0].rules.map((r) => r.id)).toEqual([b.id, a.id, c.id]);
    expect(run(state, { type: "moveRule", ruleId: a.id, direction: -1 })).toBe(state);
    expect(run(state, { type: "moveRule", ruleId: c.id, direction: 1 })).toBe(state);
  });

  it("reorders the rules of a group to a given order (drag and drop)", () => {
    const [a, b, c] = rules();
    const g = group([a, b, c]);

    const state = run(start([g]), { type: "reorderRules", groupId: g.id, orderedIds: [c.id, a.id, b.id] });

    expect(state.groups[0].rules.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
  });

  it("keeps rules that a reorder does not mention, at the end", () => {
    const [a, b, c] = rules();
    const g = group([a, b, c]);

    const state = run(start([g]), { type: "reorderRules", groupId: g.id, orderedIds: [b.id] });

    expect(state.groups[0].rules.map((r) => r.id)).toEqual([b.id, a.id, c.id]);
  });

  it("moves a rule to another group, at the end", () => {
    const [a, b, c] = rules();
    const source = group([a, b]);
    const target = group([c]);

    const state = run(start([source, target]), { type: "moveRuleToGroup", ruleId: a.id, groupId: target.id });

    expect(state.groups[0].rules.map((r) => r.id)).toEqual([b.id]);
    expect(state.groups[1].rules.map((r) => r.id)).toEqual([c.id, a.id]);
  });

  it("does nothing when asked to move a rule that does not exist", () => {
    const state = start([group(rules())]);

    expect(run(state, { type: "moveRuleToGroup", ruleId: "nope", groupId: state.groups[0].id })).toBe(state);
  });
});

describe("the age reference date", () => {
  it("can be set and cleared", () => {
    const state = run(start(), { type: "setReferenceDate", date: "2027-01-01" });
    expect(state.ageReferenceDate).toBe("2027-01-01");
    expect(run(state, { type: "setReferenceDate", date: "" }).ageReferenceDate).toBe("");
  });
});

describe("inserting the suggested rules", () => {
  const suggested = {
    ageReferenceDate: "2026-11-02",
    groups: [group([rule("age", "between", ["17", "23"], { message: "Applicants must be 17 to 23." })], { name: "Basic requirements" })],
  };

  it("adds the group and fills in the reference date", () => {
    const state = run(start(), { type: "insertSuggested", suggested });

    expect(state.groups.map((g) => g.name)).toEqual(["Basic requirements"]);
    expect(state.ageReferenceDate).toBe("2026-11-02");
    expect(isDirty(state)).toBe(true);
  });

  it("adds to existing groups instead of replacing them, and keeps a chosen date", () => {
    const existing = group([rule("gender", "is", ["female"])], { name: "Mine" });

    const state = run(start([existing], { ageReferenceDate: "2027-05-05" }), { type: "insertSuggested", suggested });

    expect(state.groups.map((g) => g.name)).toEqual(["Mine", "Basic requirements"]);
    expect(state.ageReferenceDate).toBe("2027-05-05");
  });

  it("keeps the suggested messages as the user's own", () => {
    const state = run(start(), { type: "insertSuggested", suggested });

    expect(state.groups[0].rules[0].customMessage).toBe(true);
    expect(state.groups[0].rules[0].message).toBe("Applicants must be 17 to 23.");
  });
});

describe("unsaved changes", () => {
  it("are noticed, and gone again when the change is undone", () => {
    const r = rule("age", "at_least", ["17"]);
    const state = start([group([r])]);

    const changed = run(state, { type: "updateRule", ruleId: r.id, patch: { values: ["18"] } });
    expect(isDirty(changed)).toBe(true);

    const undone = run(changed, { type: "updateRule", ruleId: r.id, patch: { values: ["17"] } });
    expect(isDirty(undone)).toBe(false);
  });

  it("include a changed order, a toggle, a new group and a changed date", () => {
    const [a, b] = [rule("age", "at_least", ["17"]), rule("gender", "is", ["female"])];
    const state = start([group([a, b])]);

    expect(isDirty(run(state, { type: "moveRule", ruleId: b.id, direction: -1 }))).toBe(true);
    expect(isDirty(run(state, { type: "updateRule", ruleId: a.id, patch: { isActive: false } }))).toBe(true);
    expect(isDirty(run(state, { type: "addGroup" }))).toBe(true);
    expect(isDirty(run(state, { type: "setReferenceDate", date: "2027-01-01" }))).toBe(true);
  });

  it("are cleared by a save, which also adopts the server's version and values", () => {
    const r = rule("age", "at_least", ["17"]);
    const state = run(start([group([r])]), { type: "updateRule", ruleId: r.id, patch: { values: ["18"] } });
    const g = state.groups[0];

    const saved = run(state, {
      type: "saved",
      data: data([{ ...g, rules: [{ ...r, values: ["18"] }] }], { version: 42, ageReferenceDate: "2026-11-02" }),
    });

    expect(isDirty(saved)).toBe(false);
    expect(saved.version).toBe(42);
    expect(saved.ageReferenceDate).toBe("2026-11-02");
  });

  it("a save keeps which messages the user wrote", () => {
    const r = rule("age", "at_least", ["17"], { message: "Age must be at least 17." });
    let state = start([group([r])]);
    state = run(state, { type: "updateRule", ruleId: r.id, patch: { message: "Be 17 or older." } });

    const saved = run(state, { type: "saved", data: data([{ ...state.groups[0], rules: [{ ...r, message: "Be 17 or older." }] }]) });

    expect(ruleOf(saved, r.id).customMessage).toBe(true);
  });
});

describe("toRequest", () => {
  it("sends the groups and rules, the date and the version, without client-only fields", () => {
    const r = rule("age", "between", ["17", "23"]);
    const g = group([r]);
    const state = run(start([g], { version: 7 }), { type: "setReferenceDate", date: "2026-11-02" });

    const request = toRequest(state);

    expect(request.version).toBe(7);
    expect(request.ageReferenceDate).toBe("2026-11-02");
    expect(request.groups[0].rules[0]).toEqual(r);
    expect(Object.keys(request.groups[0].rules[0])).not.toContain("customMessage");
  });

  it("sends null for an empty reference date", () => {
    expect(toRequest(start()).ageReferenceDate).toBeNull();
  });
});

describe("snapshot", () => {
  it("is the same for the same content and different for different content", () => {
    const r = rule("age", "at_least", ["17"]);
    const a = start([group([r], { id: "g" })]);
    const b = start([group([r], { id: "g" })]);

    expect(snapshot(a)).toBe(snapshot(b));
    expect(snapshot(run(a, { type: "setReferenceDate", date: "2027-01-01" }))).not.toBe(snapshot(a));
  });
});

describe("exam subjects", () => {
  const examEnv = { ...env, catalogue: examCatalogue() };
  const examReduce = createDraftReducer(examEnv);
  const examStart = (groups: RuleSetData["groups"] = []) => initialState(data(groups), examEnv);
  const renamed = examCatalogue(SUBJECTS.map((s) => (s.key === MATH ? { ...s, name: "Mathematics" } : s)));

  it("fills in a pre-filled reason for a rule on a subject, and follows it as the rule is edited", () => {
    const state = examStart([group([rule(MATH, "at_least", ["50"], { message: "Math score must be at least 50 points." })])]);
    const id = allRules(state)[0].id;

    const edited = examReduce(state, { type: "updateRule", ruleId: id, patch: { values: ["60"] } });

    expect(ruleOf(edited, id).customMessage).toBe(false);
    expect(ruleOf(edited, id).message).toBe("Math score must be at least 60 points.");
  });

  it("moves a rule to the next field's own operators when it is switched to a subject", () => {
    const state = examStart([group([rule("gender", "is", ["female"])])]);
    const id = allRules(state)[0].id;

    const next = examReduce(state, { type: "updateRule", ruleId: id, patch: { fieldKey: MATH } });

    expect(ruleOf(next, id)).toMatchObject({ fieldKey: MATH, operatorKey: "equals", values: [] });
  });

  it("rewrites a message that was filled in for the user when a subject is renamed", () => {
    const state = examStart([group([rule(MATH, "at_least", ["50"], { message: "Math score must be at least 50 points." })])]);
    const id = allRules(state)[0].id;

    const next = examReduce(state, { type: "refreshMessages", catalogue: renamed });

    expect(ruleOf(next, id).message).toBe("Mathematics score must be at least 50 points.");
    expect(ruleOf(next, id).customMessage).toBe(false);
    expect(isDirty(next)).toBe(true);
  });

  it("leaves a message the user wrote alone when a subject is renamed", () => {
    const state = examStart([group([rule(MATH, "at_least", ["50"], { message: "Maths pass mark is 50." })])]);
    const id = allRules(state)[0].id;

    const next = examReduce(state, { type: "refreshMessages", catalogue: renamed });

    expect(ruleOf(next, id).message).toBe("Maths pass mark is 50.");
    expect(isDirty(next)).toBe(false);
  });

  it("changes nothing when no rule uses the renamed subject", () => {
    const state = examStart([group([rule("age", "at_least", ["17"], { message: "Age must be at least 17." })])]);

    const next = examReduce(state, { type: "refreshMessages", catalogue: renamed });

    expect(snapshot(next)).toBe(snapshot(state));
    expect(isDirty(next)).toBe(false);
  });

  it("keeps the rule on the subject's key through a rename and through saving", () => {
    const state = examStart([group([rule(MATH, "at_least", ["50"])])]);

    const next = examReduce(state, { type: "refreshMessages", catalogue: renamed });

    expect(toRequest(next).groups[0].rules[0].fieldKey).toBe(MATH);
  });
});
