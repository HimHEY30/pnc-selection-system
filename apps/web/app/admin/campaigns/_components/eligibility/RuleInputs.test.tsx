import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CATALOGUE, DATE_OPS, PROVINCES } from "@/test-utils/eligibility-fixtures";
import type { CatalogueField, TargetProvince } from "@/lib/eligibility/types";
import { FieldSelect, OperatorSelect, optionsFor, TypeSelect, ValueInput } from "./RuleInputs";

const field = (key: string) => CATALOGUE.fields.find((f) => f.key === key)!;
const op = (fieldKey: string, key: string) => field(fieldKey).operators.find((o) => o.key === key)!;

function Value({
  fieldKey,
  opKey,
  initial = [],
  provinces = PROVINCES,
  onValues,
}: {
  fieldKey: string;
  opKey: string;
  initial?: string[];
  provinces?: TargetProvince[];
  onValues?: (values: string[]) => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <ValueInput
      field={field(fieldKey)}
      operator={op(fieldKey, opKey)}
      values={values}
      provinces={provinces}
      onChange={(v) => {
        setValues(v);
        onValues?.(v);
      }}
    />
  );
}

describe("FieldSelect", () => {
  it("lists every field of the catalogue", () => {
    render(<FieldSelect catalogue={CATALOGUE} value="age" onChange={() => {}} />);

    const options = within(screen.getByRole("combobox", { name: "Field" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(CATALOGUE.fields.map((f) => f.label));
  });

  it("reports the chosen field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldSelect catalogue={CATALOGUE} value="age" onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Field" }), "gender");

    expect(onChange).toHaveBeenCalledWith("gender");
  });

  it("offers a placeholder when no field is chosen yet", () => {
    render(<FieldSelect catalogue={CATALOGUE} value="" onChange={() => {}} />);

    expect(screen.getByRole("option", { name: "Choose…" })).toBeInTheDocument();
  });

  it("flags itself invalid and linked to its message", () => {
    render(<FieldSelect catalogue={CATALOGUE} value="" onChange={() => {}} invalid describedBy="msg" />);

    const select = screen.getByRole("combobox", { name: "Field" });
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-describedby", "msg");
  });
});

describe("OperatorSelect", () => {
  it.each([
    ["age", ["equals", "less than", "at most", "greater than", "at least", "between"]],
    ["gender", ["is", "is not", "is one of", "is none of"]],
    ["attended_info_session", ["is yes", "is no"]],
  ])("offers only the comparisons that fit %s", (fieldKey, labels) => {
    render(<OperatorSelect field={field(fieldKey)} value={field(fieldKey).operators[0].key} onChange={() => {}} />);

    const options = within(screen.getByRole("combobox", { name: "Comparison" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(labels);
  });

  it("offers date comparisons for a date field", () => {
    const date: CatalogueField = { ...field("age"), valueType: "Date", operators: DATE_OPS, unit: null };

    render(<OperatorSelect field={date} value="before" onChange={() => {}} />);

    expect(within(screen.getByRole("combobox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["before", "after", "between"]);
  });

  it("is disabled until a field is chosen", () => {
    render(<OperatorSelect field={undefined} value="" onChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Comparison" })).toBeDisabled();
  });
});

describe("TypeSelect", () => {
  it("switches between mandatory and optional", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypeSelect value="Mandatory" onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "Optional");

    expect(onChange).toHaveBeenCalledWith("Optional");
  });
});

describe("ValueInput adapts to the field and the comparison", () => {
  it("shows one number box with the unit for 'at most' on income", () => {
    render(<Value fieldKey="family_income" opKey="at_most" />);

    expect(screen.getByRole("textbox", { name: "Value" })).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText("USD")).toBeInTheDocument();
  });

  it("shows two boxes, From and To, for 'between'", () => {
    render(<Value fieldKey="age" opKey="between" initial={["17", "23"]} />);

    expect(screen.getByRole("textbox", { name: "From" })).toHaveValue("17");
    expect(screen.getByRole("textbox", { name: "To" })).toHaveValue("23");
  });

  it("reports both values as they are typed", async () => {
    const user = userEvent.setup();
    const onValues = vi.fn();
    render(<Value fieldKey="age" opKey="between" onValues={onValues} />);

    await user.type(screen.getByRole("textbox", { name: "From" }), "17");
    await user.type(screen.getByRole("textbox", { name: "To" }), "2");

    expect(onValues).toHaveBeenLastCalledWith(["17", "2"]);
  });

  it("fills in a missing first value when only the second is typed", async () => {
    const user = userEvent.setup();
    const onValues = vi.fn();
    render(<Value fieldKey="age" opKey="between" onValues={onValues} />);

    await user.type(screen.getByRole("textbox", { name: "To" }), "5");

    expect(onValues).toHaveBeenLastCalledWith(["", "5"]);
  });

  it("shows a drop-down of the options for 'is'", async () => {
    const user = userEvent.setup();
    const onValues = vi.fn();
    render(<Value fieldKey="gender" opKey="is" onValues={onValues} />);

    const select = screen.getByRole("combobox", { name: "Value" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Female", "Male"]);

    await user.selectOptions(select, "male");
    expect(onValues).toHaveBeenLastCalledWith(["male"]);
  });

  it("clears the value when the placeholder is chosen again", async () => {
    const user = userEvent.setup();
    const onValues = vi.fn();
    render(<Value fieldKey="gender" opKey="is" initial={["male"]} onValues={onValues} />);

    await user.selectOptions(screen.getByRole("combobox"), "");

    expect(onValues).toHaveBeenLastCalledWith([]);
  });

  it("shows checkboxes for 'is one of', and adds and removes options", async () => {
    const user = userEvent.setup();
    const onValues = vi.fn();
    render(<Value fieldKey="highest_grade" opKey="is_one_of" initial={["grade_12"]} onValues={onValues} />);

    const group = screen.getByRole("group", { name: "Highest grade completed: options" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(group).getByRole("checkbox", { name: "Grade 12" })).toBeChecked();

    await user.click(within(group).getByRole("checkbox", { name: "Diploma or higher" }));
    expect(onValues).toHaveBeenLastCalledWith(["grade_12", "diploma_or_higher"]);

    await user.click(within(group).getByRole("checkbox", { name: "Grade 12" }));
    expect(onValues).toHaveBeenLastCalledWith(["diploma_or_higher"]);
  });

  it("offers the campaign's target provinces for the province field, not a fixed list", () => {
    render(<Value fieldKey="province" opKey="is_one_of" />);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => (b as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Battambang", "Siem Reap"]);
  });

  it("offers no provinces when the campaign has no targets", () => {
    render(<Value fieldKey="province" opKey="is" provinces={[]} />);

    expect(within(screen.getByRole("combobox")).getAllByRole("option")).toHaveLength(1); // only the placeholder
  });

  it("shows no input for 'is yes'", () => {
    render(<Value fieldKey="attended_info_session" opKey="is_yes" />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("No value needed")).toBeInTheDocument();
  });

  it("shows date boxes for a date field", () => {
    const date: CatalogueField = { ...field("age"), valueType: "Date", operators: DATE_OPS, unit: null };

    const { container } = render(
      <ValueInput field={date} operator={DATE_OPS[2]} values={["2026-01-01", "2026-12-31"]} provinces={[]} onChange={() => {}} />,
    );

    expect(container.querySelectorAll("input[type=date]")).toHaveLength(2);
  });

  it("is a disabled placeholder until a field and comparison are chosen", () => {
    render(<ValueInput field={undefined} operator={undefined} values={[]} provinces={[]} onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: "Value" })).toBeDisabled();
  });

  it("can be disabled as a whole", () => {
    render(
      <>
        <ValueInput field={field("age")} operator={op("age", "between")} values={["1", "2"]} provinces={[]} onChange={() => {}} disabled />
        <ValueInput field={field("gender")} operator={op("gender", "is_one_of")} values={[]} provinces={[]} onChange={() => {}} disabled />
      </>,
    );

    expect(screen.getByRole("textbox", { name: "From" })).toBeDisabled();
    // Inside a disabled <fieldset> the boxes are disabled for the user; toBeDisabled understands that.
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });

  it("marks the value input invalid and linked to its message", () => {
    render(
      <ValueInput field={field("age")} operator={op("age", "at_least")} values={["abc"]} provinces={[]} onChange={() => {}} invalid describedBy="why" />,
    );

    const box = screen.getByRole("textbox", { name: "Value" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAttribute("aria-describedby", "why");
  });
});

describe("optionsFor", () => {
  it("returns the catalogue options, or the target provinces for the province field", () => {
    expect(optionsFor(field("gender"), PROVINCES).map((o) => o.key)).toEqual(["female", "male"]);
    expect(optionsFor(field("province"), PROVINCES)).toEqual([
      { key: "2", label: "Battambang" },
      { key: "17", label: "Siem Reap" },
    ]);
  });
});
