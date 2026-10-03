/* eslint-disable @next/next/no-html-link-for-pages -- the leave guard is tested with plain anchors on purpose */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group, RuleSetData, Subject } from "@/lib/eligibility/types";
import { examSetup, group, LOGIC, MATH, PROVINCES, rule, SUBJECTS } from "@/test-utils/eligibility-fixtures";
import { makeSteps } from "@/test-utils/fixtures";

// How the builder and the subjects panel work together: the catalogue follows the subjects, a subject
// that rules use cannot be removed, and a rename reaches the summary and the filled-in messages.

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const saveAction = vi.fn();
const addSubject = vi.fn();
const renameSubject = vi.fn();
const removeSubject = vi.fn();
vi.mock("../../eligibility-actions", () => ({
  saveEligibilityAction: (...args: unknown[]) => saveAction(...args),
  testEligibilityAction: vi.fn(),
  loadSuggestedRulesAction: vi.fn(),
  addSubjectAction: (...args: unknown[]) => addSubject(...args),
  renameSubjectAction: (...args: unknown[]) => renameSubject(...args),
  removeSubjectAction: (...args: unknown[]) => removeSubject(...args),
}));

import EligibilityBuilder from "./EligibilityBuilder";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const PHYSICS: Subject = { key: "exam_00000000000000000000000000000004", name: "Physics", ruleCount: 0 };

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
  version: 2,
  updatedAt: null,
  updatedByName: null,
  ...overrides,
});

function setup(initial: RuleSetData, subjects: Subject[] = SUBJECTS, canEdit = true) {
  const user = userEvent.setup();
  render(
    <>
      <a href="/admin/campaigns/other">Elsewhere</a>
      <EligibilityBuilder campaignId={ID} initial={initial} examSetup={examSetup(subjects)} steps={makeSteps()} canEdit={canEdit} />
    </>,
  );
  return { user };
}

beforeEach(() => {
  for (const fn of [push, saveAction, addSubject, renameSubject, removeSubject]) fn.mockReset();
});

const withMath = (message = "Math score must be at least 50 points.") =>
  data([group([rule(MATH, "at_least", ["50"], { message })], { name: "Exam" })]);

/** What the server sends after a subject change: the new list and the catalogue it gives. */
const answer = (subjects: Subject[]) => ({ ok: true as const, data: examSetup(subjects) });

const fieldOptions = () => within(screen.getAllByRole("combobox", { name: "Field" })[0]).getAllByRole("option").map((o) => o.textContent);

const rowOf = (name: string | RegExp) => screen.getByRole("group", { name });

describe("EligibilityBuilder: exam subjects", () => {
  it("lists the subjects, and offers each one, the total and the average as a field to check", () => {
    setup(withMath());

    const panel = screen.getByRole("region", { name: "Exam subjects" });
    expect(within(panel).getByText("3 of 12 subjects")).toBeInTheDocument();
    expect(fieldOptions()).toEqual([
      "Age",
      "Gender",
      "Province",
      "Highest grade completed",
      "Grade 12 exam result",
      "Family monthly income",
      "Marital status",
      "Attended an information session",
      "Math score",
      "Logic score",
      "English score",
      "Total exam score",
      "Average exam score",
    ]);
  });

  it("shows a rule on a subject as a sentence, with the points", () => {
    setup(withMath());

    expect(screen.getByText("A candidate is eligible if: math score is at least 50 points.")).toBeInTheDocument();
  });

  it("offers a new subject as a field the moment it is added", async () => {
    addSubject.mockResolvedValue(answer([...SUBJECTS, PHYSICS]));
    const { user } = setup(withMath());

    await user.type(screen.getByLabelText("Subject name"), "Physics");
    await user.click(screen.getByRole("button", { name: "Add subject" }));

    expect(addSubject).toHaveBeenCalledWith(ID, "Physics");
    await waitFor(() => expect(fieldOptions()).toContain("Physics score"));
    expect(screen.getByText("4 of 12 subjects")).toBeInTheDocument();
  });

  it("does not make the rules unsaved just because a subject was added", async () => {
    addSubject.mockResolvedValue(answer([...SUBJECTS, PHYSICS]));
    const { user } = setup(withMath());

    await user.type(screen.getByLabelText("Subject name"), "Physics");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    await screen.findByText("4 of 12 subjects");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      screen.getByText("Elsewhere").dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(false); // the page let the click through
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can write and save a rule on a subject that was just added", async () => {
    addSubject.mockResolvedValue(answer([...SUBJECTS, PHYSICS]));
    saveAction.mockImplementation(async (_id: string, _mode: string, request: { groups: Group[] }) => ({
      ok: true,
      data: { ...data(request.groups), version: 3, updatedAt: "2026-10-03T02:12:00Z", stepStatus: "InProgress" },
    }));
    const { user } = setup(data([group([rule(MATH, "at_least", ["50"])])]));

    await user.type(screen.getByLabelText("Subject name"), "Physics");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    await screen.findByText("4 of 12 subjects");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Field" })[1], PHYSICS.key);
    await user.selectOptions(within(rowOf(/^physics score/)).getByRole("combobox", { name: "Comparison" }), "at_least");
    await user.type(within(rowOf(/^physics score/)).getByRole("textbox", { name: "Value" }), "40");

    expect(screen.getByText(/physics score is at least 40 points/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saveAction).toHaveBeenCalled());
    const sent = saveAction.mock.calls[0][2].groups[0].rules as { fieldKey: string; values: string[] }[];
    expect(sent.map((r) => r.fieldKey)).toEqual([MATH, PHYSICS.key]);
    expect(sent[1].values).toEqual(["40"]);
  });

  it("cannot remove a subject a rule on the page uses, even before that rule is saved", async () => {
    const { user } = setup(data());
    expect(screen.getByRole("button", { name: "Remove Math" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Add first rule" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Field" }), MATH);

    expect(screen.getByRole("button", { name: "Remove Math" })).toBeDisabled();
    expect(screen.getByText("Used by 1 rule")).toBeInTheDocument();
  });

  it("keeps a saved subject locked until the rule is gone and the change is saved", async () => {
    saveAction.mockImplementation(async (_id: string, _mode: string, request: { groups: Group[] }) => ({
      ok: true,
      data: { ...data(request.groups), version: 3, updatedAt: "2026-10-03T02:12:00Z", stepStatus: "InProgress" },
    }));
    const { user } = setup(withMath(), SUBJECTS.map((s) => (s.key === MATH ? { ...s, ruleCount: 1 } : s)));
    expect(screen.getByRole("button", { name: "Remove Math" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete rule" }));

    // The rule is gone from the page, but the server still has it, so the subject stays locked.
    expect(screen.getByRole("button", { name: "Remove Math" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Math" })).toBeEnabled());
    expect(screen.queryByText(/Used by/)).not.toBeInTheDocument();
  });

  it("takes a removed subject out of the fields, and the total and average go when fewer than two are left", async () => {
    const two = SUBJECTS.slice(0, 2);
    removeSubject.mockResolvedValue(answer(two.slice(0, 1)));
    const { user } = setup(data(), two);
    await user.click(screen.getByRole("button", { name: "Add first rule" }));
    expect(fieldOptions()).toEqual(expect.arrayContaining(["Math score", "Logic score", "Total exam score", "Average exam score"]));

    await user.click(screen.getByRole("button", { name: "Remove Logic" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove subject" }));

    await waitFor(() => expect(fieldOptions()).not.toContain("Logic score"));
    expect(fieldOptions()).toContain("Math score");
    expect(fieldOptions()).not.toContain("Total exam score");
    expect(fieldOptions()).not.toContain("Average exam score");
    expect(removeSubject).toHaveBeenCalledWith(ID, LOGIC);
  });

  it("renames a subject everywhere it shows, and rewrites the messages that were filled in for the user", async () => {
    renameSubject.mockResolvedValue(answer(SUBJECTS.map((s) => (s.key === MATH ? { ...s, name: "Mathematics" } : s))));
    const { user } = setup(withMath());

    await user.click(screen.getByRole("button", { name: "Rename Math" }));
    await user.clear(screen.getByLabelText("New name for Math"));
    await user.type(screen.getByLabelText("New name for Math"), "Mathematics");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(renameSubject).toHaveBeenCalledWith(ID, MATH, "Mathematics");
    expect(await screen.findByText("A candidate is eligible if: mathematics score is at least 50 points.")).toBeInTheDocument();
    expect(fieldOptions()).toContain("Mathematics score");
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("textbox", { name: "Message shown when a candidate fails this rule" })).toHaveValue(
      "Mathematics score must be at least 50 points.",
    );
  });

  it("leaves a failure message the user wrote when a subject is renamed", async () => {
    renameSubject.mockResolvedValue(answer(SUBJECTS.map((s) => (s.key === MATH ? { ...s, name: "Mathematics" } : s))));
    const { user } = setup(withMath("Maths needs 50 to pass."));

    await user.click(screen.getByRole("button", { name: "Rename Math" }));
    await user.clear(screen.getByLabelText("New name for Math"));
    await user.type(screen.getByLabelText("New name for Math"), "Mathematics{Enter}");
    await screen.findByText(/mathematics score is at least 50 points/);
    await user.click(screen.getByRole("button", { name: "Details" }));

    expect(screen.getByRole("textbox", { name: "Message shown when a candidate fails this rule" })).toHaveValue("Maths needs 50 to pass.");
  });

  it("shows a change the server refused as a message, and changes nothing on the page", async () => {
    removeSubject.mockResolvedValue({ ok: false, message: "English is used by 1 saved rule. Remove that rule first." });
    const { user } = setup(data());

    await user.click(screen.getByRole("button", { name: "Remove English" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove subject" }));

    expect(await screen.findByText("English is used by 1 saved rule. Remove that rule first.")).toBeInTheDocument();
    expect(screen.getByText("3 of 12 subjects")).toBeInTheDocument();
  });

  it("shows the subjects but no way to change them to someone who cannot edit", () => {
    setup(withMath(), SUBJECTS, false);

    const panel = screen.getByRole("region", { name: "Exam subjects" });
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText("Subject name")).not.toBeInTheDocument();
  });
});
