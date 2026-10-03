import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DraftGroup, DraftRule } from "@/lib/eligibility/draft";
import type { SaveRequest, TestResult } from "@/lib/eligibility/types";
import { ENGLISH, examCatalogue, group, LOGIC, MATH, PROVINCES, rule } from "@/test-utils/eligibility-fixtures";
import TestPanel from "./TestPanel";

// The test panel asks for the exam scores the rules need: one subject's score for a rule on that
// subject, and every subject's score for a rule on the total or the average.

const ctx = { catalogue: examCatalogue(), provinces: PROVINCES };
const REQUEST: SaveRequest = { ageReferenceDate: null, groups: [], version: 1 };
const draft = (r: ReturnType<typeof rule>): DraftRule => ({ ...r, customMessage: true });
const draftGroup = (rules: DraftRule[]): DraftGroup => ({ ...group([]), rules });

function Panel({ rules, runTest }: { rules: ReturnType<typeof rule>[]; runTest?: React.ComponentProps<typeof TestPanel>["runTest"] }) {
  return (
    <TestPanel
      groups={[draftGroup(rules.map(draft))]}
      ctx={ctx}
      rulesKey="v1"
      prepare={() => REQUEST}
      runTest={runTest ?? (async () => ({ ok: true, data: { eligible: true, warnings: 0, failedMandatory: 0, groups: [], rules: [] } }))}
    />
  );
}

const inputLabels = () => screen.getAllByRole("textbox").map((box) => (box as HTMLInputElement).labels?.[0]?.textContent);

describe("TestPanel: exam scores", () => {
  it("asks for just that subject's score, as a number of points", () => {
    render(<Panel rules={[rule(MATH, "at_least", ["50"])]} />);

    expect(inputLabels()).toEqual(["Math score"]);
    expect(screen.getByLabelText("Math score")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText("points")).toBeInTheDocument();
    expect(screen.queryByText(/worked out from the subject scores/)).not.toBeInTheDocument();
  });

  it("asks for each subject a rule uses, in the catalogue's order", () => {
    render(<Panel rules={[rule(ENGLISH, "at_least", ["40"]), rule(MATH, "at_least", ["50"])]} />);

    expect(inputLabels()).toEqual(["Math score", "English score"]);
  });

  it.each([
    ["total", "exam_total"],
    ["average", "exam_average"],
  ])("asks for every subject's score, and has no input of its own, for a rule on the %s", (_name, field) => {
    render(<Panel rules={[rule(field, "at_least", ["60"])]} />);

    expect(inputLabels()).toEqual(["Math score", "Logic score", "English score"]);
    expect(screen.queryByLabelText("Total exam score")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Average exam score")).not.toBeInTheDocument();
    expect(screen.getByText(/The total and average are worked out from the subject scores below/)).toBeInTheDocument();
  });

  it("asks for each score once when a rule on a subject and a rule on the total are both there", () => {
    render(<Panel rules={[rule(MATH, "at_least", ["50"]), rule("exam_total", "at_least", ["150"]), rule("exam_average", "at_least", ["60"])]} />);

    expect(inputLabels()).toEqual(["Math score", "Logic score", "English score"]);
  });

  it("does not ask for scores when no rule uses an exam field", () => {
    render(<Panel rules={[rule("gender", "is", ["female"])]} />);

    expect(screen.queryByLabelText(/score/i)).not.toBeInTheDocument();
  });

  it("sends the scores under each subject's key, and leaves out a score left blank so a missing one can be tested", async () => {
    const user = userEvent.setup();
    const runTest = vi.fn().mockResolvedValue({ ok: true, data: { eligible: false, warnings: 0, failedMandatory: 1, groups: [], rules: [] } });
    render(<Panel rules={[rule("exam_total", "at_least", ["150"])]} runTest={runTest} />);

    await user.type(screen.getByLabelText("Math score"), "80");
    await user.type(screen.getByLabelText("Logic score"), "70.5");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(runTest).toHaveBeenCalledTimes(1));
    expect(runTest).toHaveBeenCalledWith(REQUEST, { [MATH]: "80", [LOGIC]: "70.5" });
  });

  it("shows a total that could not be worked out because a score is missing", async () => {
    const user = userEvent.setup();
    const total = rule("exam_total", "at_least", ["200"], { message: "The total must be at least 200 points." });
    const g = draftGroup([draft(total)]);
    const outcome: TestResult = {
      eligible: false,
      warnings: 0,
      failedMandatory: 1,
      groups: [{ groupId: g.id, logic: "All", counted: true, passed: false }],
      rules: [{ ruleId: total.id, groupId: g.id, fieldKey: "exam_total", type: "Mandatory", outcome: "Failed", message: total.message, dataMissing: true }],
    };
    render(<TestPanel groups={[g]} ctx={ctx} rulesKey="v1" prepare={() => REQUEST} runTest={async () => ({ ok: true, data: outcome })} />);

    await user.type(screen.getByLabelText("Math score"), "100");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    const result = await screen.findByRole("region", { name: "Test result" });
    expect(within(result).getByText("total exam score is at least 200 points")).toBeInTheDocument();
    expect(within(result).getByText("Not provided.")).toBeInTheDocument();
    expect(within(result).getByText("The total must be at least 200 points.")).toBeInTheDocument();
  });
});
