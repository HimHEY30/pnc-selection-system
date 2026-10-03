import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/campaigns/types";
import type { ExamSetup, Subject } from "@/lib/eligibility/types";
import { ENGLISH, examSetup, LOGIC, MATH, SUBJECTS } from "@/test-utils/eligibility-fixtures";
import SubjectsPanel from "./SubjectsPanel";

const ok = (subjects: Subject[]): ActionResult<ExamSetup> => ({ ok: true, data: examSetup(subjects) });
const refused = (message: string, name?: string): ActionResult<ExamSetup> =>
  name ? { ok: false, message, fieldErrors: { name } } : { ok: false, message };

type Handlers = {
  onAdd?: (name: string) => Promise<ActionResult<ExamSetup>>;
  onRename?: (key: string, name: string) => Promise<ActionResult<ExamSetup>>;
  onRemove?: (key: string) => Promise<ActionResult<ExamSetup>>;
};

/** Holds the list the way the builder does: the panel reports what the server sent, and the list follows. */
function Harness({
  initial = SUBJECTS,
  usage = {},
  canEdit = true,
  maxSubjects = 12,
  onAdd = async (name) => ok([...initial, { key: "exam_new", name, ruleCount: 0 }]),
  onRename = async (key, name) => ok(initial.map((s) => (s.key === key ? { ...s, name } : s))),
  onRemove = async (key) => ok(initial.filter((s) => s.key !== key)),
}: Handlers & { initial?: Subject[]; usage?: Record<string, number>; canEdit?: boolean; maxSubjects?: number }) {
  const [subjects, setSubjects] = useState(initial);
  return (
    <SubjectsPanel
      subjects={subjects}
      maxSubjects={maxSubjects}
      usage={usage}
      canEdit={canEdit}
      onAdd={onAdd}
      onRename={onRename}
      onRemove={onRemove}
      onChanged={(setup) => setSubjects(setup.subjects)}
    />
  );
}

const rows = () => within(screen.getByRole("list", { name: "Exam subjects" })).getAllByRole("listitem");
const rowOf = (name: string) => rows().find((r) => within(r).queryByText(name))!;

describe("SubjectsPanel: reading the list", () => {
  it("lists each subject with how many there are", () => {
    render(<Harness />);

    expect(screen.getByRole("heading", { name: "Exam subjects" })).toBeInTheDocument();
    expect(screen.getByText("3 of 12 subjects")).toBeInTheDocument();
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining("Math"),
      expect.stringContaining("Logic"),
      expect.stringContaining("English"),
    ]);
    expect(screen.getByText(/Scores are points from 0 to 100/)).toBeInTheDocument();
  });

  it("says when there are no subjects, and that the total and average need two", () => {
    render(<Harness initial={[]} />);

    expect(screen.getByText("No subjects yet. Add one to write rules about exam scores.")).toBeInTheDocument();
    expect(screen.getByText(/total and average scores become available once there are two or more subjects/)).toBeInTheDocument();
  });

  it("says the total and average need two subjects when only one is left, and stops saying it at two", () => {
    const { unmount } = render(<Harness initial={SUBJECTS.slice(0, 1)} />);
    expect(screen.getByText(/become available once there are two or more subjects/)).toBeInTheDocument();
    unmount();

    render(<Harness initial={SUBJECTS.slice(0, 2)} />);
    expect(screen.queryByText(/become available once there are two or more subjects/)).not.toBeInTheDocument();
  });

  it("shows how many rules use a subject, and does not let it be removed", () => {
    render(<Harness usage={{ [MATH]: 2, [LOGIC]: 1 }} />);

    expect(within(rowOf("Math")).getByText("Used by 2 rules")).toBeInTheDocument();
    expect(within(rowOf("Logic")).getByText("Used by 1 rule")).toBeInTheDocument();
    expect(within(rowOf("English")).queryByText(/Used by/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Math" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Logic" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove English" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove Math" })).toHaveAttribute("title", expect.stringContaining("Delete those rules"));
  });

  it("still lets a subject that rules use be renamed", () => {
    render(<Harness usage={{ [MATH]: 2 }} />);

    expect(screen.getByRole("button", { name: "Rename Math" })).toBeEnabled();
  });

  it("is read only for someone who cannot edit: the list and what uses it, but no way to change it", () => {
    render(<Harness canEdit={false} usage={{ [MATH]: 1 }} />);

    expect(rows()).toHaveLength(3);
    expect(screen.getByText("Used by 1 rule")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename|Remove|Add subject/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subject name")).not.toBeInTheDocument();
  });
});

describe("SubjectsPanel: adding", () => {
  it("adds the name typed, shows the subject, and gets ready for the next one", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async (name: string) => ok([...SUBJECTS, { key: "exam_new", name, ruleCount: 0 }]));
    render(<Harness onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Subject name"), "Physics");
    await user.click(screen.getByRole("button", { name: "Add subject" }));

    expect(onAdd).toHaveBeenCalledWith("Physics");
    expect(await screen.findByText("Physics")).toBeInTheDocument();
    expect(screen.getByText("4 of 12 subjects")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject name")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Subject name")).toHaveFocus());
  });

  it("adds with the Enter key", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async (name: string) => ok([...SUBJECTS, { key: "exam_new", name, ruleCount: 0 }]));
    render(<Harness onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Subject name"), "Khmer{Enter}");

    expect(onAdd).toHaveBeenCalledWith("Khmer");
    expect(await screen.findByText("Khmer")).toBeInTheDocument();
  });

  it("puts the server's problem with the name under the box and keeps what was typed", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => refused("Invalid.", "This campaign already has a subject with this name."));
    render(<Harness onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Subject name"), "math");
    await user.click(screen.getByRole("button", { name: "Add subject" }));

    const input = screen.getByLabelText("Subject name");
    expect(await screen.findByText("This campaign already has a subject with this name.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("math");
    expect(rows()).toHaveLength(3);
  });

  it("clears the problem as soon as the name is edited", async () => {
    const user = userEvent.setup();
    render(<Harness onAdd={async () => refused("Invalid.", "Enter the subject's name.")} />);
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    expect(await screen.findByText("Enter the subject's name.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Subject name"), "P");

    expect(screen.queryByText("Enter the subject's name.")).not.toBeInTheDocument();
  });

  it("shows a failure that is not about the name as a banner", async () => {
    const user = userEvent.setup();
    render(<Harness onAdd={async () => refused("We could not reach the server. Check your connection and try again.")} />);

    await user.type(screen.getByLabelText("Subject name"), "Physics");
    await user.click(screen.getByRole("button", { name: "Add subject" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server");
  });

  it("falls back to a general message when the server gave none", async () => {
    const user = userEvent.setup();
    render(<Harness onAdd={async () => refused("")} />);

    await user.click(screen.getByRole("button", { name: "Add subject" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not save this change. Try again.");
  });

  it("stops at the limit and says why", () => {
    render(<Harness maxSubjects={3} />);

    expect(screen.getByLabelText("Subject name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add subject" })).toBeDisabled();
    expect(screen.getByText("A campaign can have at most 3 subjects.")).toBeInTheDocument();
  });

  it("does not add twice while the first request is still running", async () => {
    const user = userEvent.setup();
    let finish: (r: ActionResult<ExamSetup>) => void = () => {};
    const onAdd = vi.fn(() => new Promise<ActionResult<ExamSetup>>((resolve) => (finish = resolve)));
    render(<Harness onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Subject name"), "Physics{Enter}");
    expect(await screen.findByRole("button", { name: "Adding…" })).toBeDisabled();
    await user.keyboard("{Enter}");
    finish(ok([...SUBJECTS, { key: "exam_new", name: "Physics", ruleCount: 0 }]));

    expect(await screen.findByText("Physics")).toBeInTheDocument();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("SubjectsPanel: renaming", () => {
  it("opens a box with the current name, saves the new one, and puts focus back on the button", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn(async (key: string, name: string) => ok(SUBJECTS.map((s) => (s.key === key ? { ...s, name } : s))));
    render(<Harness onRename={onRename} />);

    await user.click(screen.getByRole("button", { name: "Rename Math" }));
    const box = screen.getByLabelText("New name for Math");
    expect(box).toHaveValue("Math");
    await user.clear(box);
    await user.type(box, "Mathematics");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).toHaveBeenCalledWith(MATH, "Mathematics");
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByLabelText(/New name for/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Rename Mathematics" })).toHaveFocus());
  });

  it("saves with the Enter key", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn(async (key: string, name: string) => ok(SUBJECTS.map((s) => (s.key === key ? { ...s, name } : s))));
    render(<Harness onRename={onRename} />);

    await user.click(screen.getByRole("button", { name: "Rename Logic" }));
    await user.type(screen.getByLabelText("New name for Logic"), " puzzles{Enter}");

    expect(onRename).toHaveBeenCalledWith(LOGIC, "Logic puzzles");
  });

  it("cancels with the button or Escape, changing nothing", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness onRename={onRename} />);

    await user.click(screen.getByRole("button", { name: "Rename Math" }));
    await user.type(screen.getByLabelText("New name for Math"), "XYZ");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/New name for/)).not.toBeInTheDocument();
    expect(screen.getByText("Math")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Math" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText(/New name for/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Rename Math" })).toHaveFocus());
    expect(onRename).not.toHaveBeenCalled();
  });

  it("keeps the box open with the server's problem under it", async () => {
    const user = userEvent.setup();
    render(<Harness onRename={async () => refused("Invalid.", "This campaign already has a subject with this name.")} />);

    await user.click(screen.getByRole("button", { name: "Rename Math" }));
    const box = screen.getByLabelText("New name for Math");
    await user.clear(box);
    await user.type(box, "Logic");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("This campaign already has a subject with this name.")).toBeInTheDocument();
    expect(screen.getByLabelText("New name for Math")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("New name for Math")).toHaveValue("Logic");
  });

  it("only one subject is renamed at a time", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Rename Math" }));

    expect(screen.getByRole("button", { name: "Rename Logic" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename English" })).toBeDisabled();
  });

  it("explains that messages already written keep the old name", () => {
    render(<Harness />);

    expect(screen.getByText(/A message you wrote yourself keeps the old name/)).toBeInTheDocument();
  });
});

describe("SubjectsPanel: removing", () => {
  it("asks first, and says it happens now rather than on save", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Remove English" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: 'Remove "English"?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/English is removed from this campaign now, not when you save the rules/)).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("keeps the subject when the person changes their mind", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Remove English" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep subject" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  it("removes the subject once confirmed", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn(async (key: string) => ok(SUBJECTS.filter((s) => s.key !== key)));
    render(<Harness onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Remove English" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove subject" }));

    expect(onRemove).toHaveBeenCalledWith(ENGLISH);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByText("English")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 12 subjects")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Subject name")).toHaveFocus());
  });

  it("says why when the server refuses, and keeps the subject", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn(async () => refused("English is used by 1 saved rule. Remove that rule first."));
    render(<Harness onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Remove English" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove subject" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("English is used by 1 saved rule. Remove that rule first.");
    expect(rows()).toHaveLength(3);
  });

  it("can remove every subject, leaving the empty message", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SUBJECTS.slice(0, 1)} onRemove={async () => ok([])} />);

    await user.click(screen.getByRole("button", { name: "Remove Math" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove subject" }));

    expect(await screen.findByText(/No subjects yet/)).toBeInTheDocument();
  });
});
