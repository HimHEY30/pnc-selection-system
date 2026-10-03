import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DraftAction, DraftGroup, DraftRule } from "@/lib/eligibility/draft";
import { CATALOGUE, group, PROVINCES, rule } from "@/test-utils/eligibility-fixtures";
import RuleGroupCard from "./RuleGroupCard";
import RuleRow from "./RuleRow";

const ctx = { catalogue: CATALOGUE, provinces: PROVINCES };
const draftRule = (r = rule("age", "between", ["17", "23"])): DraftRule => ({ ...r, customMessage: false });
const draftGroup = (rules: DraftRule[], name = "Basics"): DraftGroup => ({ ...group([]), name, rules });

// ---------- A single rule row ----------

function Row(props: Partial<React.ComponentProps<typeof RuleRow>> & { rule?: DraftRule }) {
  const r = props.rule ?? draftRule();
  const g = draftGroup([r]);
  return (
    <DndContext>
      <SortableContext items={[r.id]}>
        <ul>
          <RuleRow
            rule={r}
            index={0}
            count={1}
            ctx={ctx}
            groups={[g]}
            groupId={g.id}
            errorFor={() => undefined}
            canEdit
            onChange={() => {}}
            onMove={() => {}}
            onMoveToGroup={() => {}}
            onDelete={() => {}}
            onTouch={() => {}}
            {...props}
          />
        </ul>
      </SortableContext>
    </DndContext>
  );
}

describe("RuleRow", () => {
  it("shows the rule as field, comparison and value", () => {
    render(<Row />);

    expect(screen.getByRole("combobox", { name: "Field" })).toHaveValue("age");
    expect(screen.getByRole("combobox", { name: "Comparison" })).toHaveValue("between");
    expect(screen.getByRole("textbox", { name: "From" })).toHaveValue("17");
    expect(screen.getByRole("textbox", { name: "To" })).toHaveValue("23");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("Mandatory");
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("is a group named by what the rule says, so a screen reader knows which row it is in", () => {
    render(<Row />);

    expect(screen.getByRole("group", { name: "age is between 17 and 23" })).toBeInTheDocument();
  });

  it("reports each change as a patch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Row onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Field" }), "gender");
    expect(onChange).toHaveBeenLastCalledWith({ fieldKey: "gender" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Comparison" }), "at_least");
    expect(onChange).toHaveBeenLastCalledWith({ operatorKey: "at_least" });

    await user.type(screen.getByRole("textbox", { name: "To" }), "5");
    expect(onChange).toHaveBeenLastCalledWith({ values: ["17", "235"] });

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "Optional");
    expect(onChange).toHaveBeenLastCalledWith({ type: "Optional" });

    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith({ isActive: false });
  });

  it("says when a rule is switched off, or optional", () => {
    const { rerender } = render(<Row rule={draftRule(rule("age", "at_least", ["17"], { isActive: false }))} />);
    expect(screen.getByText("Switched off. This rule is ignored.")).toBeInTheDocument();

    rerender(<Row rule={draftRule(rule("age", "at_least", ["17"], { type: "Optional" }))} />);
    expect(screen.getByText("A candidate who fails this is only given a warning.")).toBeInTheDocument();
  });

  it("moves up and down, and the buttons stop at the ends", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { rerender } = render(<Row index={1} count={3} onMove={onMove} />);

    await user.click(screen.getByRole("button", { name: "Move rule up" }));
    await user.click(screen.getByRole("button", { name: "Move rule down" }));
    expect(onMove.mock.calls).toEqual([[-1], [1]]);

    rerender(<Row index={0} count={3} onMove={onMove} />);
    expect(screen.getByRole("button", { name: "Move rule up" })).toBeDisabled();

    rerender(<Row index={2} count={3} onMove={onMove} />);
    expect(screen.getByRole("button", { name: "Move rule down" })).toBeDisabled();
  });

  it("has a drag handle named after the rule, and a delete button", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Row onDelete={onDelete} />);

    expect(screen.getByRole("button", { name: "Reorder: age is between 17 and 23" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("tells the page when an input is left, so its errors may start to show", async () => {
    const user = userEvent.setup();
    const onTouch = vi.fn();
    render(<Row onTouch={onTouch} />);

    await user.click(screen.getByRole("textbox", { name: "From" }));
    await user.tab();

    expect(onTouch).toHaveBeenCalled();
  });

  // ---------- Details ----------

  it("keeps the message in a details section that opens and closes", async () => {
    const user = userEvent.setup();
    render(<Row rule={draftRule({ ...rule("age", "at_least", ["17"]), message: "Age must be at least 17." })} />);
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: /Message shown/ })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: /Message shown/ })).toHaveValue("Age must be at least 17.");

    await user.click(toggle);
    expect(screen.queryByRole("textbox", { name: /Message shown/ })).not.toBeInTheDocument();
  });

  it("reports an edited message", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Row onChange={onChange} rule={draftRule({ ...rule("age", "at_least", ["17"]), message: "Hi" })} />);

    await user.click(screen.getByRole("button", { name: "Details" }));
    await user.type(screen.getByRole("textbox", { name: /Message shown/ }), "!");

    expect(onChange).toHaveBeenLastCalledWith({ message: "Hi!" });
  });

  it("opens the details by itself when the message has a problem", () => {
    const r = draftRule(rule("age", "at_least", ["17"], { message: "" }));

    render(<Row rule={r} errorFor={(key) => (key === `rules.${r.id}.message` ? "Write the reason." : undefined)} />);

    expect(screen.getByRole("textbox", { name: /Message shown/ })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Write the reason.")).toBeInTheDocument();
  });

  it("moves the rule to another group from the details", async () => {
    const user = userEvent.setup();
    const onMoveToGroup = vi.fn();
    const r = draftRule();
    const here = draftGroup([r], "Basics");
    const other = draftGroup([], "Where from");
    render(
      <DndContext>
        <SortableContext items={[r.id]}>
          <ul>
            <RuleRow
              rule={r} index={0} count={1} ctx={ctx} groups={[here, other]} groupId={here.id}
              errorFor={() => undefined} canEdit onChange={() => {}} onMove={() => {}}
              onMoveToGroup={onMoveToGroup} onDelete={() => {}} onTouch={() => {}}
            />
          </ul>
        </SortableContext>
      </DndContext>,
    );

    await user.click(screen.getByRole("button", { name: "Details" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Group" }), other.id);

    expect(onMoveToGroup).toHaveBeenCalledWith(other.id);
  });

  it("offers no group move when there is only one group", async () => {
    const user = userEvent.setup();
    render(<Row />);

    await user.click(screen.getByRole("button", { name: "Details" }));

    expect(screen.queryByRole("combobox", { name: "Group" })).not.toBeInTheDocument();
  });

  // ---------- Errors ----------

  it("shows each problem under the row and links the inputs to it", () => {
    const r = draftRule(rule("age", "between", ["23", "17"]));
    const errors: Record<string, string> = {
      [`rules.${r.id}.values`]: "The first value must be lower than the second.",
      [`rules.${r.id}`]: "The same rule already exists in this group.",
    };

    render(<Row rule={r} errorFor={(key) => errors[key]} />);

    expect(screen.getByText("The first value must be lower than the second.")).toBeInTheDocument();
    expect(screen.getByText("The same rule already exists in this group.")).toBeInTheDocument();
    const from = screen.getByRole("textbox", { name: "From" });
    expect(from).toHaveAttribute("aria-invalid", "true");
    expect(from).toHaveAccessibleDescription(/first value must be lower/);
  });

  it("shows no error styling when there is nothing wrong", () => {
    render(<Row />);

    expect(screen.getByRole("textbox", { name: "From" })).not.toHaveAttribute("aria-invalid");
  });

  // ---------- Read only ----------

  it("is read only for someone who may not edit: inputs disabled, no handle, move or delete", () => {
    render(<Row canEdit={false} />);

    expect(screen.getByRole("combobox", { name: "Field" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Comparison" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "From" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move rule up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete rule" })).not.toBeInTheDocument();
  });

  it("still lets a read-only viewer open the details to read the message", async () => {
    const user = userEvent.setup();
    render(<Row canEdit={false} rule={draftRule({ ...rule("age", "at_least", ["17"]), message: "Seen." })} />);

    await user.click(screen.getByRole("button", { name: "Details" }));

    const message = screen.getByRole("textbox", { name: /Message shown/ });
    expect(message).toHaveValue("Seen.");
    expect(message).toBeDisabled();
  });
});

// ---------- A group ----------

function Group(props: Partial<React.ComponentProps<typeof RuleGroupCard>> = {}) {
  const g = props.group ?? draftGroup([draftRule(), draftRule(rule("gender", "is", ["female"]))]);
  return (
    <RuleGroupCard
      group={g}
      index={0}
      count={1}
      allGroups={[g]}
      ctx={ctx}
      errorFor={() => undefined}
      canEdit
      dispatch={() => {}}
      onRequestDeleteRule={() => {}}
      onRequestDeleteGroup={() => {}}
      onTouchRule={() => {}}
      {...props}
    />
  );
}

describe("RuleGroupCard", () => {
  it("shows the group's name, its ALL/ANY choice and its rules in order", () => {
    render(<Group />);

    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Basics");
    expect(screen.getByRole("combobox", { name: "How the rules in this group combine" })).toHaveValue("All");
    const list = screen.getByRole("list", { name: "Rules in Basics" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("combobox", { name: "Field" }).map((s) => (s as HTMLSelectElement).value)).toEqual(["age", "gender"]);
  });

  it("is a labelled section", () => {
    render(<Group />);

    expect(screen.getByRole("region", { name: "Group: Basics" })).toBeInTheDocument();
  });

  it("renames the group, and switches it between ALL and ANY", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn<(a: DraftAction) => void>();
    const g = draftGroup([draftRule()]);
    render(<Group group={g} dispatch={dispatch} />);

    await user.type(screen.getByRole("textbox", { name: "Group name" }), "!");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "renameGroup", groupId: g.id, name: "Basics!" });

    await user.selectOptions(screen.getByRole("combobox", { name: "How the rules in this group combine" }), "Any");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setLogic", groupId: g.id, logic: "Any" });
  });

  it("adds a rule to this group", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn<(a: DraftAction) => void>();
    const g = draftGroup([]);
    render(<Group group={g} dispatch={dispatch} />);

    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "addRule", groupId: g.id });
  });

  it("passes a rule's edits, moves and deletion up with that rule's id", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn<(a: DraftAction) => void>();
    const onRequestDeleteRule = vi.fn();
    const first = draftRule();
    const second = draftRule(rule("gender", "is", ["female"]));
    const g = draftGroup([first, second]);
    render(<Group group={g} dispatch={dispatch} onRequestDeleteRule={onRequestDeleteRule} />);

    await user.click(screen.getAllByRole("button", { name: "Move rule down" })[0]);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "moveRule", ruleId: first.id, direction: 1 });

    await user.click(screen.getAllByRole("switch")[1]);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "updateRule", ruleId: second.id, patch: { isActive: false } });

    await user.click(screen.getAllByRole("button", { name: "Delete rule" })[1]);
    expect(onRequestDeleteRule).toHaveBeenCalledWith(second);
  });

  it("asks before deleting the group, and moves it up and down", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn<(a: DraftAction) => void>();
    const onRequestDeleteGroup = vi.fn();
    const g = draftGroup([draftRule()]);
    render(<Group group={g} index={1} count={3} dispatch={dispatch} onRequestDeleteGroup={onRequestDeleteGroup} />);

    await user.click(screen.getByRole("button", { name: "Delete group" }));
    expect(onRequestDeleteGroup).toHaveBeenCalledWith(g);
    expect(dispatch).not.toHaveBeenCalled(); // nothing is deleted until confirmed

    await user.click(screen.getByRole("button", { name: "Move group up" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "moveGroup", groupId: g.id, direction: -1 });
    await user.click(screen.getByRole("button", { name: "Move group down" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "moveGroup", groupId: g.id, direction: 1 });
  });

  it("stops the group's move buttons at the ends", () => {
    const { rerender } = render(<Group index={0} count={2} />);
    expect(screen.getByRole("button", { name: "Move group up" })).toBeDisabled();

    rerender(<Group index={1} count={2} />);
    expect(screen.getByRole("button", { name: "Move group down" })).toBeDisabled();
  });

  it("says when a group has no rules", () => {
    render(<Group group={draftGroup([])} />);

    expect(screen.getByText("No rules in this group yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Rules in/ })).not.toBeInTheDocument();
  });

  it("shows a problem with the group's name", () => {
    const g = draftGroup([], " ");

    render(<Group group={g} errorFor={(key) => (key === `groups.${g.id}.name` ? "Give the group a name." : undefined)} />);

    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Give the group a name.")).toBeInTheDocument();
  });

  it("tells the page which rule was touched", async () => {
    const user = userEvent.setup();
    const onTouchRule = vi.fn();
    const r = draftRule();
    render(<Group group={draftGroup([r])} onTouchRule={onTouchRule} />);

    await user.click(screen.getByRole("textbox", { name: "From" }));
    await user.tab();

    expect(onTouchRule).toHaveBeenCalledWith(r.id);
  });

  it("is read only: no add, delete or move buttons, and the inputs are disabled", () => {
    render(<Group canEdit={false} />);

    expect(screen.getByRole("textbox", { name: "Group name" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "How the rules in this group combine" })).toBeDisabled();
    for (const name of ["Add rule", "Delete group", "Move group up", "Move group down"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});
