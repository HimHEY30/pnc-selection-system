import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DraftGroup, DraftRule } from "@/lib/eligibility/draft";
import type { SaveRequest, TestResult } from "@/lib/eligibility/types";
import { CATALOGUE, group, PROVINCES, rule } from "@/test-utils/eligibility-fixtures";
import SummaryPanel from "./SummaryPanel";
import TestPanel from "./TestPanel";

const ctx = { catalogue: CATALOGUE, provinces: PROVINCES };
const draft = (r: ReturnType<typeof rule>): DraftRule => ({ ...r, customMessage: true });
const draftGroup = (rules: DraftRule[], overrides: Partial<DraftGroup> = {}): DraftGroup => ({ ...group([]), ...overrides, rules });

// ---------- Summary ----------

describe("SummaryPanel", () => {
  it("asks for a rule when there are none", () => {
    render(<SummaryPanel groups={[]} ctx={ctx} />);

    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("Add a rule to see who would be eligible.")).toBeInTheDocument();
  });

  it("writes the rules as a sentence", () => {
    const groups = [
      draftGroup([
        draft(rule("age", "between", ["17", "23"])),
        draft(rule("highest_grade", "is", ["grade_12"])),
        draft(rule("province", "is_one_of", ["2", "17"])),
      ]),
    ];

    render(<SummaryPanel groups={groups} ctx={ctx} />);

    expect(
      screen.getByText(
        "A candidate is eligible if: age is between 17 and 23, AND highest grade completed is Grade 12, AND province is one of Battambang, Siem Reap.",
      ),
    ).toBeInTheDocument();
  });

  it("follows the rules as they change", () => {
    const { rerender } = render(<SummaryPanel groups={[draftGroup([draft(rule("age", "at_least", ["17"]))])]} ctx={ctx} />);
    expect(screen.getByText(/age is at least 17/)).toBeInTheDocument();

    rerender(<SummaryPanel groups={[draftGroup([draft(rule("age", "at_least", ["18"]))])]} ctx={ctx} />);
    expect(screen.getByText(/age is at least 18/)).toBeInTheDocument();
    expect(screen.queryByText(/age is at least 17/)).not.toBeInTheDocument();
  });

  it("shows optional rules on their own line", () => {
    const groups = [draftGroup([draft(rule("age", "at_least", ["17"])), draft(rule("attended_info_session", "is_yes", [], { type: "Optional" }))])];

    render(<SummaryPanel groups={groups} ctx={ctx} />);

    expect(screen.getByText(/Optional rules \(a candidate who fails these is only given a warning\): attended an information session is yes\./)).toBeInTheDocument();
  });

  it("says so when no mandatory rule is active", () => {
    render(<SummaryPanel groups={[draftGroup([draft(rule("age", "at_least", ["17"], { isActive: false }))])]} ctx={ctx} />);

    expect(screen.getByText("There is no active mandatory rule yet, so every candidate would be eligible.")).toBeInTheDocument();
  });
});

// ---------- Test panel ----------

const REQUEST: SaveRequest = { ageReferenceDate: "2026-11-02", groups: [], version: 1 };

function result(overrides: Partial<TestResult> = {}): TestResult {
  return { eligible: true, warnings: 0, failedMandatory: 0, groups: [], rules: [], ...overrides };
}

function Panel(props: Partial<React.ComponentProps<typeof TestPanel>> = {}) {
  const ageRule = draft(rule("age", "between", ["17", "23"], { message: "Applicants must be 17 to 23." }));
  const groups = props.groups ?? [draftGroup([ageRule, draft(rule("gender", "is", ["female"]))])];
  return (
    <TestPanel
      groups={groups}
      ctx={ctx}
      rulesKey="v1"
      prepare={() => REQUEST}
      runTest={async () => ({ ok: true, data: result() })}
      {...props}
    />
  );
}

describe("TestPanel: the form", () => {
  it("asks only for the fields the rules use", () => {
    render(<Panel />);

    expect(screen.getByLabelText("Date of birth")).toBeInTheDocument();
    expect(screen.getByLabelText("Gender")).toBeInTheDocument();
    expect(screen.queryByLabelText("Marital status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Family monthly income")).not.toBeInTheDocument();
  });

  it("asks for age as a date of birth, because that is what the age is worked out from", () => {
    render(<Panel />);

    expect(screen.getByLabelText("Date of birth")).toHaveAttribute("type", "date");
    expect(screen.queryByLabelText("Age")).not.toBeInTheDocument();
  });

  it("shapes each input like its field", () => {
    const groups = [
      draftGroup([
        draft(rule("gender", "is", ["female"])),
        draft(rule("province", "is", ["2"])),
        draft(rule("family_income", "at_most", ["300"])),
        draft(rule("attended_info_session", "is_yes", [])),
      ]),
    ];

    render(<Panel groups={groups} />);

    expect(within(screen.getByLabelText("Gender")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Not provided", "Female", "Male"]);
    expect(within(screen.getByLabelText("Province")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Not provided", "Battambang", "Siem Reap"]);
    expect(screen.getByLabelText("Family monthly income")).toHaveAttribute("inputmode", "decimal");
    expect(within(screen.getByLabelText("Attended an information session")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Not provided", "Yes", "No"]);
  });

  it("says what to do when there are no rules to test", () => {
    render(<Panel groups={[]} />);

    expect(screen.getByText("Add a rule to test it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run test" })).not.toBeInTheDocument();
  });
});

describe("TestPanel: Run test", () => {
  it("sends the rules on screen and only what was filled in, as the candidate", async () => {
    const user = userEvent.setup();
    const runTest = vi.fn().mockResolvedValue({ ok: true, data: result() });
    render(<Panel runTest={runTest} />);

    await user.type(screen.getByLabelText("Date of birth"), "2006-06-01");
    await user.selectOptions(screen.getByLabelText("Gender"), "female");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(runTest).toHaveBeenCalledTimes(1));
    expect(runTest).toHaveBeenCalledWith(REQUEST, { date_of_birth: "2006-06-01", gender: "female" });
  });

  it("leaves a field out when it is left on Not provided, so missing information can be tested", async () => {
    const user = userEvent.setup();
    const runTest = vi.fn().mockResolvedValue({ ok: true, data: result() });
    render(<Panel runTest={runTest} />);

    await user.selectOptions(screen.getByLabelText("Gender"), "female");
    await user.selectOptions(screen.getByLabelText("Gender"), "");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(runTest).toHaveBeenCalled());
    expect(runTest).toHaveBeenCalledWith(REQUEST, {});
  });

  it("runs when Enter is pressed in a field", async () => {
    const user = userEvent.setup();
    const runTest = vi.fn().mockResolvedValue({ ok: true, data: result() });
    render(<Panel runTest={runTest} />);

    await user.type(screen.getByLabelText("Date of birth"), "2006-06-01{Enter}");

    await waitFor(() => expect(runTest).toHaveBeenCalled());
  });

  it("does not run, and says to fix the marked rules, when the rules on screen are not valid", async () => {
    const user = userEvent.setup();
    const runTest = vi.fn();
    render(<Panel prepare={() => null} runTest={runTest} />);

    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(runTest).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Some rules need your attention");
  });

  it("disables the button and says Running while the test is in flight", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => {};
    const runTest = vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<Panel runTest={runTest} />);

    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(await screen.findByRole("button", { name: "Running…" })).toBeDisabled();

    finish({ ok: true, data: result() });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run test" })).toBeEnabled());
  });

  it("shows the server's message when the test cannot run", async () => {
    const user = userEvent.setup();
    render(<Panel runTest={async () => ({ ok: false, message: "We could not reach the server. Check your connection and try again." })} />);

    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server");
    expect(screen.queryByRole("region", { name: "Test result" })).not.toBeInTheDocument();
  });
});

describe("TestPanel: the result", () => {
  const ageRule = draft(rule("age", "between", ["17", "23"], { message: "Applicants must be 17 to 23." }));
  const genderRule = draft(rule("gender", "is", ["female"], { message: "Women only." }));
  const infoRule = draft(rule("attended_info_session", "is_yes", [], { type: "Optional", message: "Please attend a session." }));
  const g = draftGroup([ageRule, genderRule, infoRule], { name: "Basics" });

  const failingResult = (): TestResult => ({
    eligible: false,
    warnings: 1,
    failedMandatory: 1,
    groups: [{ groupId: g.id, logic: "All", counted: true, passed: false }],
    rules: [
      { ruleId: ageRule.id, groupId: g.id, fieldKey: "age", type: "Mandatory", outcome: "Passed", message: null, dataMissing: false },
      { ruleId: genderRule.id, groupId: g.id, fieldKey: "gender", type: "Mandatory", outcome: "Failed", message: "Women only.", dataMissing: false },
      { ruleId: infoRule.id, groupId: g.id, fieldKey: "attended_info_session", type: "Optional", outcome: "Failed", message: "Please attend a session.", dataMissing: true },
    ],
  });

  async function runWith(data: TestResult, groups = [g], rulesKey = "v1") {
    const user = userEvent.setup();
    const view = render(<Panel groups={groups} rulesKey={rulesKey} runTest={async () => ({ ok: true, data })} />);
    await user.click(screen.getByRole("button", { name: "Run test" }));
    await screen.findByRole("region", { name: "Test result" });
    return { user, ...view };
  }

  it("says eligible, with no warnings, when everything passes", async () => {
    await runWith({
      eligible: true, warnings: 0, failedMandatory: 0,
      groups: [{ groupId: g.id, logic: "All", counted: true, passed: true }],
      rules: [{ ruleId: ageRule.id, groupId: g.id, fieldKey: "age", type: "Mandatory", outcome: "Passed", message: null, dataMissing: false }],
    });

    expect(screen.getByRole("status")).toHaveTextContent("Eligible");
    expect(screen.getByRole("status")).not.toHaveTextContent("warning");
  });

  it("says not eligible, counts warnings, and shows each rule's outcome", async () => {
    await runWith(failingResult());

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Not eligible");
    expect(status).toHaveTextContent("1 warning");
    const items = within(screen.getByRole("region", { name: "Test result" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("age is between 17 and 23");
    expect(items[0]).toHaveTextContent("Passed");
    expect(items[1]).toHaveTextContent("gender is Female");
    expect(items[1]).toHaveTextContent("Failed");
  });

  it("shows the failure message of each failed rule, and not for a passed one", async () => {
    await runWith(failingResult());

    expect(screen.getByText("Women only.")).toBeInTheDocument();
    expect(screen.getByText(/Please attend a session\./)).toBeInTheDocument();
    expect(screen.queryByText("Applicants must be 17 to 23.")).not.toBeInTheDocument();
  });

  it("flags a rule that failed because the information was not provided", async () => {
    await runWith(failingResult());

    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveTextContent("Not provided.");
    expect(items[1]).not.toHaveTextContent("Not provided");
  });

  it("tells mandatory from optional rules, and says whether each group passed", async () => {
    await runWith(failingResult());

    expect(screen.getByRole("heading", { name: /Basics/ })).toHaveTextContent("Group fails");
    expect(screen.getAllByRole("listitem")[2]).toHaveTextContent("Optional");
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Mandatory");
  });

  it("shows a switched-off rule as skipped", async () => {
    await runWith({
      eligible: true, warnings: 0, failedMandatory: 0,
      groups: [{ groupId: g.id, logic: "All", counted: true, passed: true }],
      rules: [{ ruleId: genderRule.id, groupId: g.id, fieldKey: "gender", type: "Mandatory", outcome: "Skipped", message: null, dataMissing: false }],
    });

    expect(screen.getByRole("listitem")).toHaveTextContent("Skipped (switched off)");
  });

  it("explains a group that has no say", async () => {
    await runWith({
      eligible: true, warnings: 1, failedMandatory: 0,
      groups: [{ groupId: g.id, logic: "All", counted: false, passed: true }],
      rules: [{ ruleId: infoRule.id, groupId: g.id, fieldKey: "attended_info_session", type: "Optional", outcome: "Failed", message: "Please attend a session.", dataMissing: false }],
    });

    expect(screen.getByRole("heading", { name: /Basics/ })).toHaveTextContent("Group has no mandatory rule, so it is ignored");
  });

  it("says the result is out of date once the rules change, and not before", async () => {
    const { rerender } = await runWith(failingResult(), [g], "v1");
    expect(screen.queryByText(/The rules have changed since this test/)).not.toBeInTheDocument();

    rerender(<Panel groups={[g]} rulesKey="v2" runTest={async () => ({ ok: true, data: failingResult() })} />);

    expect(screen.getByText("The rules have changed since this test. Run it again to see the new result.")).toBeInTheDocument();
  });

  it("keeps describing the rules as they were when the test ran, even if they are edited after", async () => {
    const { rerender } = await runWith(failingResult(), [g], "v1");

    const edited = draftGroup([{ ...ageRule, values: ["30", "40"] }, genderRule, infoRule], { id: g.id, name: "Basics" });
    rerender(<Panel groups={[edited]} rulesKey="v2" runTest={async () => ({ ok: true, data: failingResult() })} />);

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("age is between 17 and 23");
  });
});
