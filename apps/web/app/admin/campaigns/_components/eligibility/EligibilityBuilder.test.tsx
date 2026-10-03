/* eslint-disable @next/next/no-html-link-for-pages -- the leave guard is tested with plain anchors on purpose */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSetup, Group, RuleSetData } from "@/lib/eligibility/types";
import { CATALOGUE, group, PROVINCES, rule } from "@/test-utils/eligibility-fixtures";
import { makeSteps } from "@/test-utils/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const saveAction = vi.fn();
const testAction = vi.fn();
const suggestedAction = vi.fn();
const addSubject = vi.fn();
const renameSubject = vi.fn();
const removeSubject = vi.fn();
vi.mock("../../eligibility-actions", () => ({
  addSubjectAction: (...args: unknown[]) => addSubject(...args),
  renameSubjectAction: (...args: unknown[]) => renameSubject(...args),
  removeSubjectAction: (...args: unknown[]) => removeSubject(...args),
  saveEligibilityAction: (...args: unknown[]) => saveAction(...args),
  testEligibilityAction: (...args: unknown[]) => testAction(...args),
  loadSuggestedRulesAction: (...args: unknown[]) => suggestedAction(...args),
}));

import EligibilityBuilder from "./EligibilityBuilder";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const data = (groups: Group[] = [], overrides: Partial<RuleSetData> = {}): RuleSetData => ({
  campaignId: ID,
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

/** A campaign with no exam subjects: the shared fields only, as before subjects existed. */
const NO_SUBJECTS: ExamSetup = { subjects: [], maxSubjects: 12, catalogue: CATALOGUE };

function setup(initial: RuleSetData = data(), canEdit = true, examSetup: ExamSetup = NO_SUBJECTS) {
  const user = userEvent.setup();
  const view = render(
    <>
      <a href="/admin/campaigns/other">Elsewhere</a>
      <EligibilityBuilder campaignId={ID} initial={initial} examSetup={examSetup} steps={makeSteps()} canEdit={canEdit} />
    </>,
  );
  return { user, ...view };
}

const saved = (overrides: Partial<RuleSetData> = {}) => (initial: RuleSetData) => ({
  ok: true as const,
  data: { ...initial, version: 5, updatedAt: "2026-10-03T02:12:00Z", stepStatus: "InProgress" as const, ...overrides },
});

beforeEach(() => {
  push.mockReset();
  saveAction.mockReset();
  testAction.mockReset();
  suggestedAction.mockReset();
  addSubject.mockReset();
  renameSubject.mockReset();
  removeSubject.mockReset();
});

const rowOf = (name: string | RegExp) => screen.getByRole("group", { name });

// (dnd-kit adds its own role="status" region for screen-reader announcements, so find ours by its text.)
const savedNote = () => screen.getByText(/^Draft saved at/);

// ---------- Empty ----------

describe("EligibilityBuilder: an empty page", () => {
  it("explains what eligibility rules are, and offers the first rule and the suggested ones", () => {
    setup();

    expect(screen.getByRole("heading", { name: "No eligibility rules yet" })).toBeInTheDocument();
    expect(screen.getByText(/Eligibility rules say who is allowed to apply/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add first rule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use suggested rules" })).toBeInTheDocument();
  });

  it("shows the step strip with Step 2 current", () => {
    setup();

    expect(screen.getByText(/^Step 2 · /)).toBeInTheDocument();
  });

  it("'Add first rule' makes a group with one rule, and the summary and the age date follow", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Add first rule" }));

    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Group 1");
    expect(screen.getAllByRole("combobox", { name: "Field" })).toHaveLength(1);
    expect(screen.getByText("A candidate is eligible if: age is ….")).toBeInTheDocument();
    expect(screen.getByLabelText("Ages are calculated on")).toHaveValue("2026-11-02");
  });

  it("'Use suggested rules' adds the starter rules as unsaved work", async () => {
    suggestedAction.mockResolvedValue({
      ok: true,
      data: {
        ageReferenceDate: "2026-11-02",
        groups: [group([rule("age", "between", ["17", "23"], { message: "Applicants must be 17 to 23." })], { name: "Basic requirements" })],
      },
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Use suggested rules" }));

    expect(await screen.findByRole("textbox", { name: "Group name" })).toHaveValue("Basic requirements");
    expect(screen.getByText(/age is between 17 and 23/)).toBeInTheDocument();
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("says so when the suggested rules cannot be loaded", async () => {
    suggestedAction.mockResolvedValue({ ok: false, message: "We could not reach the server. Check your connection and try again." });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Use suggested rules" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server");
    expect(screen.getByRole("heading", { name: "No eligibility rules yet" })).toBeInTheDocument();
  });
});

// ---------- Editing ----------

describe("EligibilityBuilder: editing the rules", () => {
  const start = () => {
    const age = rule("age", "between", ["17", "23"], { message: "Age must be between 17 and 23." });
    const grade = rule("highest_grade", "is", ["grade_12"], { message: "Highest grade completed must be Grade 12." });
    return { age, grade, initial: data([group([age, grade], { name: "Basics" })], { ageReferenceDate: "2026-11-02" }) };
  };

  it("shows the saved rules, their summary, and the age reference date", () => {
    const { initial } = start();
    setup(initial);

    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Basics");
    expect(screen.getAllByRole("combobox", { name: "Field" }).map((s) => (s as HTMLSelectElement).value)).toEqual(["age", "highest_grade"]);
    expect(screen.getByText("A candidate is eligible if: age is between 17 and 23, AND highest grade completed is Grade 12.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ages are calculated on")).toHaveValue("2026-11-02");
  });

  it("updates the summary as a value is typed", async () => {
    const { initial } = start();
    const { user } = setup(initial);

    await user.clear(screen.getByRole("textbox", { name: "To" }));
    await user.type(screen.getByRole("textbox", { name: "To" }), "25");

    expect(screen.getByText(/age is between 17 and 25/)).toBeInTheDocument();
  });

  it("changes the value input when the comparison changes", async () => {
    const { initial } = start();
    const { user } = setup(initial);
    expect(screen.getByRole("textbox", { name: "From" })).toBeInTheDocument();

    await user.selectOptions(within(rowOf(/^age is between/)).getByRole("combobox", { name: "Comparison" }), "at_least");

    expect(screen.queryByRole("textbox", { name: "From" })).not.toBeInTheDocument();
    expect(within(rowOf(/^age is at least/)).getByRole("textbox", { name: "Value" })).toHaveValue("17");
  });

  it("resets the comparison and value when the field changes", async () => {
    const { initial } = start();
    const { user } = setup(initial);

    await user.selectOptions(within(rowOf(/^age is between/)).getByRole("combobox", { name: "Field" }), "gender");

    const row = rowOf(/^gender/);
    expect(within(row).getByRole("combobox", { name: "Comparison" })).toHaveValue("is");
    expect(within(row).getByRole("combobox", { name: "Value" })).toHaveValue("");
  });

  it("hides the age reference date once no age rule is left", async () => {
    const { initial } = start();
    const { user } = setup(initial);

    await user.selectOptions(within(rowOf(/^age is between/)).getByRole("combobox", { name: "Field" }), "gender");

    expect(screen.queryByLabelText("Ages are calculated on")).not.toBeInTheDocument();
  });

  it("switches a rule off, and it leaves the summary", async () => {
    const { initial } = start();
    const { user } = setup(initial);

    await user.click(screen.getByRole("switch", { name: /Rule active: age is between 17 and 23/ }));

    expect(screen.getByText("A candidate is eligible if: highest grade completed is Grade 12.")).toBeInTheDocument();
  });

  it("reorders with the Move buttons", async () => {
    const { initial } = start();
    const { user } = setup(initial);

    await user.click(screen.getAllByRole("button", { name: "Move rule down" })[0]);

    expect(screen.getAllByRole("combobox", { name: "Field" }).map((s) => (s as HTMLSelectElement).value)).toEqual(["highest_grade", "age"]);
    expect(screen.getByText(/highest grade completed is Grade 12, AND age is between 17 and 23/)).toBeInTheDocument();
  });

  it("adds a rule to a group, and a second group", async () => {
    const { initial } = start();
    const { user } = setup(initial);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getAllByRole("combobox", { name: "Field" })).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getAllByRole("textbox", { name: "Group name" }).map((i) => (i as HTMLInputElement).value)).toEqual(["Basics", "Group 1"]);
  });

  it("writes an ANY group in the summary as a bracketed OR", async () => {
    const province = group([rule("province", "is", ["2"]), rule("province", "is", ["17"])], { name: "Where from", logic: "Any" });
    setup(data([group([rule("age", "at_least", ["17"])], { name: "Basics" }), province], { ageReferenceDate: "2026-11-02" }));

    expect(screen.getByText("A candidate is eligible if: age is at least 17, AND (province is Battambang OR province is Siem Reap).")).toBeInTheDocument();
  });

  it("moves a rule to another group from its details", async () => {
    const a = rule("age", "at_least", ["17"]);
    const { user } = setup(data([group([a], { name: "Basics" }), group([], { name: "Where from" })], { ageReferenceDate: "2026-11-02" }));

    await user.click(screen.getByRole("button", { name: "Details" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Group" }), screen.getByRole("option", { name: "Where from" }));

    const lists = screen.getAllByRole("list").filter((l) => l.getAttribute("aria-label")?.startsWith("Rules in"));
    expect(lists.map((l) => l.getAttribute("aria-label"))).toEqual(["Rules in Where from"]);
  });
});

// ---------- Inline errors ----------

describe("EligibilityBuilder: inline errors", () => {
  it("does not shout about a half-filled rule before the user has been in it", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Add first rule" }));

    expect(screen.queryByText("Enter a value.")).not.toBeInTheDocument();
  });

  it("shows the problem under the rule once the user leaves it", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add first rule" }));

    await user.click(screen.getByRole("textbox", { name: "Value" }));
    await user.tab();

    expect(await screen.findByText("Enter a value.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Value" })).toHaveAttribute("aria-invalid", "true");
  });

  it("explains an end that is before the start, as soon as both are typed", async () => {
    const { user } = setup(data([group([rule("age", "between", ["23", "17"])])], { ageReferenceDate: "2026-11-02" }));

    await user.click(screen.getByRole("textbox", { name: "From" }));
    await user.tab();

    expect(await screen.findByText("The first value must be lower than the second.")).toBeInTheDocument();
  });

  it("names the same rule twice in a group", async () => {
    const { user } = setup(data([group([rule("gender", "is", ["female"]), rule("gender", "is", ["female"])])]));

    await user.click(screen.getAllByRole("combobox", { name: "Value" })[1]);
    await user.tab();

    expect(await screen.findByText("The same rule already exists in this group.")).toBeInTheDocument();
  });

  it("flags an empty group name at once", async () => {
    const { user } = setup(data([group([rule("gender", "is", ["female"])], { name: "Basics" })]));

    await user.clear(screen.getByRole("textbox", { name: "Group name" }));

    expect(screen.getByText("Give the group a name.")).toBeInTheDocument();
  });
});

// ---------- Saving ----------

describe("EligibilityBuilder: Save draft", () => {
  const initial = () => data([group([rule("gender", "is", ["female"])], { name: "Basics" })], { version: 3 });

  it("sends the rules, the date and the version, and shows when it was saved", async () => {
    saveAction.mockImplementation(async () => saved()(initial()));
    const { user } = setup(initial());

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
    const [campaignId, mode, request] = saveAction.mock.calls[0];
    expect(campaignId).toBe(ID);
    expect(mode).toBe("draft");
    expect(request.version).toBe(3);
    expect(request.groups[0].name).toBe("Basics");
    expect(request.groups[0].rules[0]).toMatchObject({ fieldKey: "gender", operatorKey: "is", values: ["female"] });
    expect(Object.keys(request.groups[0].rules[0])).not.toContain("customMessage");
    await waitFor(() => expect(savedNote()).toHaveTextContent("Draft saved at 9:12 AM"));
    expect(push).not.toHaveBeenCalled();
  });

  it("uses the new version for the next save", async () => {
    saveAction.mockImplementation(async () => saved()(initial()));
    const { user } = setup(initial());

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
    // The button reads "Saving…" until the first save has finished.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(2));
    expect(saveAction.mock.calls[1][2].version).toBe(5);
  });

  it("does not call the server when something is wrong, and says which rule to fix", async () => {
    const { user } = setup(data([group([rule("age", "at_least", ["abc"])])], { ageReferenceDate: "2026-11-02" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Some rules need your attention");
    expect(screen.getByText("Enter a number.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Value" })).toHaveFocus();
  });

  it("disables both buttons while it saves", async () => {
    let finish: (value: unknown) => void = () => {};
    saveAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = setup(initial());

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const saving = await screen.findAllByRole("button", { name: "Saving…" });
    expect(saving).toHaveLength(2);
    for (const b of saving) expect(b).toBeDisabled();

    finish(saved()(initial()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
  });
});

describe("EligibilityBuilder: Save and continue", () => {
  it("saves as complete and goes back to the setup overview", async () => {
    const initial = data([group([rule("gender", "is", ["female"])])]);
    saveAction.mockImplementation(async () => saved({ stepStatus: "Complete" })(initial));
    const { user } = setup(initial);

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 3" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledWith(ID, "complete", expect.anything()));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/campaigns/${ID}`));
  });

  it("needs an active mandatory rule, and says so", async () => {
    const { user } = setup(data([group([rule("gender", "is", ["female"], { type: "Optional" })])]));

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 3" }));

    expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain("Add at least one active mandatory rule.");
    expect(push).not.toHaveBeenCalled();
  });

  it("needs the age reference date when an age rule is active", async () => {
    const { user } = setup(data([group([rule("age", "at_least", ["17"])])]));

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 3" }));

    expect(saveAction).not.toHaveBeenCalled();
    const date = screen.getByLabelText("Ages are calculated on");
    expect(date).toHaveAccessibleDescription("Choose the date ages are calculated on.");
    expect(date).toHaveFocus();
  });

  it("asks for target provinces only when completing", async () => {
    const initial = data([group([rule("province", "is", ["21"])])]);
    saveAction.mockImplementation(async () => saved()(initial));
    const { user } = setup(initial);

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 3" }));
    expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getByText("Choose only target provinces of this campaign. Change them in Step 1.")).toBeInTheDocument();
  });
});

describe("EligibilityBuilder: what the server says", () => {
  const initial = () => data([group([rule("gender", "is", ["female"])])]);

  it("puts the server's messages under the inputs they belong to, and moves focus there", async () => {
    const ruleId = initial().groups[0].rules[0].id;
    saveAction.mockResolvedValue({
      ok: false,
      message: "Some rules need your attention.",
      fieldErrors: { [`rules.${ruleId}`]: "These rules can never all be true together: Gender is Female; Gender is Male." },
    });
    const { user } = setup(data([group([rule("gender", "is", ["female"], { id: ruleId })])]));

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/These rules can never all be true together/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Some rules need your attention");
    expect(screen.getByRole("combobox", { name: "Field" })).toHaveAttribute("aria-invalid", "true");
  });

  it("drops the server's messages as soon as the rules are edited", async () => {
    const ruleId = "11111111-1111-4111-8111-111111111111";
    saveAction.mockResolvedValue({ ok: false, message: "x", fieldErrors: { [`rules.${ruleId}`]: "Server says no." } });
    const { user } = setup(data([group([rule("gender", "is", ["female"], { id: ruleId })])]));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Server says no.");

    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male");

    expect(screen.queryByText("Server says no.")).not.toBeInTheDocument();
  });

  it("shows a conflict as a message above the page, and keeps the user's work", async () => {
    saveAction.mockResolvedValue({ ok: false, message: "Someone else changed these rules. Reload the page and try again." });
    const { user } = setup(initial());

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else changed these rules");
    expect(screen.getByRole("combobox", { name: "Value" })).toHaveValue("female");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a set-level problem from the server, such as no mandatory rule", async () => {
    saveAction.mockResolvedValue({ ok: false, message: "x", fieldErrors: { groups: "Something went wrong with this form. Reload the page and try again." } });
    const { user } = setup(initial());

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Something went wrong with this form. Reload the page and try again.")).toBeInTheDocument();
  });
});

// ---------- Confirmations ----------

describe("EligibilityBuilder: confirming before deleting", () => {
  const two = () => {
    const a = rule("age", "at_least", ["17"]);
    const b = rule("gender", "is", ["female"]);
    return { a, b, initial: data([group([a, b], { name: "Basics" })], { ageReferenceDate: "2026-11-02" }) };
  };

  it("asks first, and keeps the rule if the user changes their mind", async () => {
    const { initial } = two();
    const { user } = setup(initial);

    await user.click(screen.getAllByRole("button", { name: "Delete rule" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Delete this rule?" });
    expect(dialog).toHaveAccessibleDescription(/age is at least 17/);
    await user.click(within(dialog).getByRole("button", { name: "Keep rule" }));

    expect(screen.getAllByRole("combobox", { name: "Field" })).toHaveLength(2);
  });

  it("deletes the rule only after the user confirms", async () => {
    const { initial } = two();
    const { user } = setup(initial);

    await user.click(screen.getAllByRole("button", { name: "Delete rule" })[0]);
    await user.click(within(screen.getByRole("dialog", { name: "Delete this rule?" })).getByRole("button", { name: "Delete rule" }));

    expect(screen.getAllByRole("combobox", { name: "Field" })).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Field" })).toHaveValue("gender");
  });

  it("asks before deleting a group, saying how many rules go with it", async () => {
    const { initial } = two();
    const { user } = setup(initial);

    await user.click(screen.getByRole("button", { name: "Delete group" }));
    const dialog = screen.getByRole("dialog", { name: 'Delete "Basics"?' });
    expect(dialog).toHaveAccessibleDescription(/also removes its 2 rules/);
    await user.click(within(dialog).getByRole("button", { name: "Delete group" }));

    expect(screen.getByRole("heading", { name: "No eligibility rules yet" })).toBeInTheDocument();
  });

  it("keeps the group if the user changes their mind", async () => {
    const { initial } = two();
    const { user } = setup(initial);

    await user.click(screen.getByRole("button", { name: "Delete group" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep group" }));

    expect(screen.getByRole("textbox", { name: "Group name" })).toBeInTheDocument();
  });
});

// ---------- Leaving with unsaved changes ----------

describe("EligibilityBuilder: leaving with unsaved changes", () => {
  const clickLink = () =>
    act(() => {
      screen.getByText("Elsewhere").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

  const initial = () => data([group([rule("gender", "is", ["female"])])], { version: 1 });

  it("lets the user walk away freely when nothing has changed", () => {
    setup(initial());

    clickLink();

    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
  });

  it("asks first once something has changed, and stays if told to", async () => {
    const { user } = setup(initial());
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male");

    clickLink();

    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Value" })).toHaveValue("male");
  });

  it("leaves when the user confirms", async () => {
    const { user } = setup(initial());
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male");

    clickLink();
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole("button", { name: "Leave page" }));

    expect(push).toHaveBeenCalledWith("/admin/campaigns/other");
  });

  it("stops asking once the changes are undone", async () => {
    const { user } = setup(initial());
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male");
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "female");

    clickLink();

    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
  });

  it("stops asking once the changes are saved", async () => {
    saveAction.mockImplementation(async (_id: string, _mode: string, request: { groups: Group[] }) => ({
      ok: true,
      data: { ...data(request.groups), version: 2, updatedAt: "2026-10-03T02:12:00Z", stepStatus: "InProgress" },
    }));
    const { user } = setup(initial());
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saveAction).toHaveBeenCalled());
    await waitFor(() => expect(savedNote()).toBeInTheDocument());

    clickLink();

    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
  });

  it("asks the browser to confirm closing the tab only while there are unsaved changes", async () => {
    const { user } = setup(initial());
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

// ---------- Read only ----------

describe("EligibilityBuilder: read only", () => {
  const initial = () => data([group([rule("age", "at_least", ["17"])], { name: "Basics" })], { ageReferenceDate: "2026-11-02", updatedAt: "2026-10-03T02:12:00Z" });

  it("shows the rules, disabled, with no way to change them", () => {
    setup(initial(), false);

    expect(screen.getByRole("textbox", { name: "Group name" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Field" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Value" })).toBeDisabled();
    expect(screen.getByLabelText("Ages are calculated on")).toBeDisabled();
    for (const name of ["Add rule", "Add group", "Delete group", "Delete rule", "Save draft", "Save and continue to Step 3"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("explains why, and offers a way back", () => {
    setup(initial(), false);

    expect(screen.getByText(/only a selection manager or a system admin can change them/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to setup overview" })).toHaveAttribute("href", `/admin/campaigns/${ID}`);
  });

  it("says a locked campaign can no longer be changed", () => {
    setup({ ...initial(), isLocked: true, campaignStatus: "Active" }, false);

    expect(screen.getByText("This campaign is no longer a draft, so its rules can no longer be changed.")).toBeInTheDocument();
  });

  it("shows an empty read-only page without any buttons", () => {
    setup(data(), false);

    expect(screen.getByText("No rules have been set for this campaign yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add first rule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use suggested rules" })).not.toBeInTheDocument();
  });

  it("still shows the summary and lets the viewer run a test", async () => {
    testAction.mockResolvedValue({ ok: true, data: { eligible: true, warnings: 0, failedMandatory: 0, groups: [], rules: [] } });
    const { user } = setup(initial(), false);

    expect(screen.getByText(/age is at least 17/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Date of birth"), "2006-06-01");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(testAction).toHaveBeenCalled());
  });

  it("does not warn about leaving: there is nothing to lose", () => {
    setup(initial(), false);

    act(() => {
      screen.getByText("Elsewhere").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ---------- The test panel inside the page ----------

describe("EligibilityBuilder: the test panel", () => {
  it("tests the rules on screen, unsaved, and shows the result", async () => {
    const r = rule("gender", "is", ["female"], { message: "Women only." });
    testAction.mockResolvedValue({
      ok: true,
      data: {
        eligible: false, warnings: 0, failedMandatory: 1,
        groups: [],
        rules: [],
      },
    });
    const { user } = setup(data([group([r], { name: "Basics" })], { version: 4 }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "male"); // an unsaved edit

    await user.selectOptions(screen.getByLabelText("Gender"), "male");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(testAction).toHaveBeenCalledTimes(1));
    const [campaignId, request, candidate] = testAction.mock.calls[0];
    expect(campaignId).toBe(ID);
    expect(request.groups[0].rules[0].values).toEqual(["male"]); // the edit that is not saved
    expect(request.version).toBe(4);
    expect(candidate).toEqual({ gender: "male" });
    expect(await screen.findByRole("region", { name: "Test result" })).toBeInTheDocument();
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("refuses to test rules that are not valid, and marks what to fix", async () => {
    const { user } = setup(data([group([rule("age", "at_least", ["abc"])])], { ageReferenceDate: "2026-11-02" }));

    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(testAction).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a number.")).toBeInTheDocument();
  });
});
