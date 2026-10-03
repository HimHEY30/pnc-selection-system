import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PROVINCES } from "@/test-utils/fixtures";
import ProvinceMultiSelect from "./ProvinceMultiSelect";

function Harness({ initial = [], disabled = false, onChange = () => {} }: { initial?: number[]; disabled?: boolean; onChange?: (ids: number[]) => void }) {
  const [value, setValue] = useState<number[]>(initial);
  return (
    <>
      <label htmlFor="provinces">Target provinces</label>
      <ProvinceMultiSelect
        id="provinces"
        provinces={PROVINCES}
        value={value}
        disabled={disabled}
        onChange={(ids) => {
          setValue(ids);
          onChange(ids);
        }}
      />
    </>
  );
}

describe("ProvinceMultiSelect", () => {
  it("shows the chosen provinces as chips", () => {
    render(<Harness initial={[17, 2]} />);

    const chips = within(screen.getByRole("list", { name: "Selected provinces" })).getAllByRole("listitem");
    // Alphabetical, whatever order they were chosen in.
    expect(chips.map((c) => c.textContent)).toEqual(["Battambang", "Siem Reap"]);
  });

  it("can be reached through its label", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Target provinces")).toBe(screen.getByRole("button", { name: "Target provinces" }));
  });

  it("opens a list of all provinces and focuses the search box", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Target provinces" }));

    expect(screen.getAllByRole("option")).toHaveLength(PROVINCES.length);
    expect(screen.getByRole("combobox", { name: "Search provinces" })).toHaveFocus();
  });

  it("adds a province when its option is clicked, and keeps the list open for more", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Target provinces" }));
    await user.click(screen.getByRole("option", { name: "Siem Reap" }));
    await user.click(screen.getByRole("option", { name: "Takeo" }));

    expect(onChange).toHaveBeenLastCalledWith([17, 21]);
    expect(screen.getByRole("option", { name: "Siem Reap" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Phnom Penh" })).toHaveAttribute("aria-selected", "false");
  });

  it("removes a province with its chip's x button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[2, 17]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove Battambang" }));

    expect(onChange).toHaveBeenLastCalledWith([17]);
    expect(screen.queryByText("Battambang")).not.toBeInTheDocument();
    // Focus lands somewhere sensible instead of vanishing with the chip.
    expect(screen.getByRole("button", { name: "Target provinces" })).toHaveFocus();
  });

  it("filters the list as you type", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Target provinces" }));
    await user.type(screen.getByRole("combobox"), "kam");

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Kampong Cham"]);
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Target provinces" }));
    await user.type(screen.getByRole("combobox"), "zzz");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No province matches your search.")).toBeInTheDocument();
  });

  it("works from the keyboard alone: arrows move, Enter toggles, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("combobox")).toHaveFocus();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    // Options are A-Z: Battambang, Kampong Cham, Phnom Penh ... so two steps down is Phnom Penh.
    expect(onChange).toHaveBeenLastCalledWith([12]);

    await user.keyboard("{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith([12, 3]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Target provinces" })).toHaveFocus();
  });

  it("does not submit a surrounding form when Enter picks an option", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ProvinceMultiSelect id="p" provinces={PROVINCES} value={[]} onChange={() => {}} />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "+ Add province" }));
    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes when you click elsewhere", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <p>Elsewhere</p>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Target provinces" }));
    await user.click(screen.getByText("Elsewhere"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("cannot be changed when disabled", () => {
    render(<Harness initial={[2]} disabled />);

    expect(screen.getByRole("button", { name: "Target provinces" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Battambang" })).toBeDisabled();
  });
});
