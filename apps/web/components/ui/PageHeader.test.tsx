import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PageHeader from "./PageHeader";

describe("PageHeader", () => {
  it("shows the title as the page's one heading, with its description", () => {
    render(<PageHeader title="Sessions" description="Plan the sessions." />);
    expect(screen.getByRole("heading", { level: 1, name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByText("Plan the sessions.")).toBeInTheDocument();
  });

  it("offers a way back and the page's actions when it is given them", () => {
    render(<PageHeader title="Sessions" back={{ href: "/admin/campaigns/1", label: "Back to setup" }} actions={<button type="button">Add</button>} />);
    expect(screen.getByRole("link", { name: "Back to setup" })).toHaveAttribute("href", "/admin/campaigns/1");
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("marks the current breadcrumb and links the others", () => {
    render(
      <PageHeader
        title="Setup"
        breadcrumbsLabel="Breadcrumbs"
        breadcrumbs={[{ label: "Campaigns", href: "/admin/campaigns" }, { label: "Spring 2027", current: true }]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumbs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Campaigns" })).toBeInTheDocument();
    expect(screen.getByText("Spring 2027")).toHaveAttribute("aria-current", "page");
  });
});
