import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";
import FormField from "./FormField";
import ProgressBar from "./ProgressBar";
import StatusBadge from "./StatusBadge";
import { TextInput } from "./inputs";

describe("StatusBadge", () => {
  it.each([
    ["NotStarted", "Not started"],
    ["InProgress", "In progress"],
    ["Complete", "Complete"],
    ["Draft", "Draft"],
  ] as const)("shows %s as the text %j, so colour is never the only signal", (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("never uses white text on the light fills", () => {
    const { container } = render(
      <>
        <StatusBadge status="InProgress" />
        <StatusBadge status="NotStarted" />
        <StatusBadge status="Complete" />
      </>,
    );

    for (const badge of container.querySelectorAll("span")) {
      expect(badge.className).not.toContain("text-white");
    }
  });
});

describe("FormField", () => {
  it("ties the label to the control", () => {
    render(<FormField label="Campaign name">{(control) => <TextInput {...control} />}</FormField>);

    expect(screen.getByLabelText("Campaign name")).toBeInstanceOf(HTMLInputElement);
  });

  it("marks an optional field", () => {
    render(<FormField label="Description" optional>{(c) => <TextInput {...c} />}</FormField>);

    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("describes the control with its hint", () => {
    render(
      <FormField label="Seats available" hint="How many students PNC can admit this year.">
        {(c) => <TextInput {...c} />}
      </FormField>,
    );

    const input = screen.getByLabelText("Seats available");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("How many students PNC can admit this year.");
  });

  it("shows the error instead of the hint, and flags the control invalid", () => {
    render(
      <FormField label="End date" hint="A hint" error="End date must be after the start date (2 Nov 2026).">
        {(c) => <TextInput {...c} />}
      </FormField>,
    );

    const input = screen.getByLabelText("End date");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("End date must be after the start date (2 Nov 2026).");
    expect(screen.queryByText("A hint")).not.toBeInTheDocument();
  });

  it("draws an invalid control with the red border", () => {
    render(<FormField label="End date" error="Nope">{(c) => <TextInput {...c} />}</FormField>);

    expect(screen.getByLabelText("End date").className).toContain("border-danger");
  });
});

describe("ProgressBar", () => {
  it("reports its value to assistive technology", () => {
    render(<ProgressBar total={5} complete={1} inProgress={1} label="1 of 5 steps complete, 1 in progress" />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuetext", "1 of 5 steps complete, 1 in progress");
  });

  it("draws one segment per step: complete, then in progress, then empty", () => {
    render(<ProgressBar total={5} complete={2} inProgress={1} label="x" />);

    const segments = screen.getByRole("progressbar").children;
    expect(Array.from(segments, (s) => s.className.match(/bg-(primary|brand-orange|line)\b/)?.[0])).toEqual([
      "bg-primary",
      "bg-primary",
      "bg-brand-orange",
      "bg-line",
      "bg-line",
    ]);
  });
});

describe("EmptyState", () => {
  it("shows the message, the action and the hint", () => {
    render(
      <EmptyState
        title="No campaign yet"
        description="A campaign is one selection cycle."
        action={<button type="button">Create campaign</button>}
        hint="Setup takes 5 steps."
      />,
    );

    expect(screen.getByRole("heading", { name: "No campaign yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create campaign" })).toBeInTheDocument();
    expect(screen.getByText("Setup takes 5 steps.")).toBeInTheDocument();
  });

  it("works without an action", () => {
    render(<EmptyState title="Nothing here" description="Ask someone." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
