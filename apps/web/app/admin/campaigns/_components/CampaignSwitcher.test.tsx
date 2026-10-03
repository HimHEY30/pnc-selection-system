import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignSummary } from "@/lib/campaigns/types";

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../actions", () => ({ createCampaignAction: vi.fn(), saveCampaignInfoAction: vi.fn() }));

import CampaignSwitcher from "./CampaignSwitcher";
import { CreateCampaignProvider } from "./CreateCampaignProvider";

const A = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const B = "11111111-2222-4333-8444-555555555555";

const campaigns: CampaignSummary[] = [
  { id: A, name: "Selection 2027", academicYear: "2027–2028", status: "Draft", createdAt: "2026-10-03T02:00:00Z" },
  { id: B, name: "Selection 2026", academicYear: "2026–2027", status: "Closed", createdAt: "2025-10-03T02:00:00Z" },
];

function renderSwitcher(list: CampaignSummary[] | null, canCreate = true) {
  const user = userEvent.setup();
  render(
    <CreateCampaignProvider canCreate={canCreate}>
      <CampaignSwitcher campaigns={list} />
    </CreateCampaignProvider>,
  );
  return user;
}

beforeEach(() => {
  pathname = "/admin";
});

describe("CampaignSwitcher", () => {
  it("says there is no campaign yet when the list is empty", () => {
    renderSwitcher([]);

    expect(screen.getByRole("button", { name: /No campaign yet/ })).toBeInTheDocument();
  });

  it("shows the campaign in the URL, with its status", () => {
    pathname = `/admin/campaigns/${A}/info`;
    renderSwitcher(campaigns);

    const trigger = screen.getByRole("button", { name: /Selection 2027/ });
    expect(trigger).toHaveTextContent("Draft");
  });

  it("asks you to choose when the page is not about one campaign", () => {
    renderSwitcher(campaigns);

    expect(screen.getByRole("button", { name: /Choose a campaign/ })).toBeInTheDocument();
  });

  it("lists every campaign as a link, marking the current one", async () => {
    pathname = `/admin/campaigns/${A}`;
    const user = renderSwitcher(campaigns);

    await user.click(screen.getByRole("button", { name: /Selection 2027/ }));

    const current = screen.getByRole("link", { name: /Selection 2027/ });
    expect(current).toHaveAttribute("href", `/admin/campaigns/${A}`);
    expect(current).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: /Selection 2026/ })).toHaveAttribute("href", `/admin/campaigns/${B}`);
    expect(screen.getByRole("link", { name: /Selection 2026/ })).not.toHaveAttribute("aria-current");
  });

  it("reports whether the list is open", async () => {
    const user = renderSwitcher(campaigns);
    const trigger = screen.getByRole("button", { name: /Choose a campaign/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape and on a click outside", async () => {
    const user = renderSwitcher(campaigns);
    const trigger = screen.getByRole("button", { name: /Choose a campaign/ });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    await user.click(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("offers Create campaign to people who may create, and opens the dialog", async () => {
    const user = renderSwitcher(campaigns);

    await user.click(screen.getByRole("button", { name: /Choose a campaign/ }));
    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    expect(screen.getByRole("dialog", { name: "Create campaign" })).toBeInTheDocument();
  });

  it("does not offer Create campaign to people who may not create", async () => {
    const user = renderSwitcher(campaigns, false);

    await user.click(screen.getByRole("button", { name: /Choose a campaign/ }));

    expect(screen.queryByRole("button", { name: "Create campaign" })).not.toBeInTheDocument();
  });

  it("says so when the campaign list could not be loaded", async () => {
    const user = renderSwitcher(null);

    await user.click(screen.getByRole("button", { name: /Campaigns unavailable/ }));

    expect(screen.getByText("We could not load your campaigns.")).toBeInTheDocument();
  });

  it("explains an empty list inside the open panel", async () => {
    const user = renderSwitcher([]);

    await user.click(screen.getByRole("button", { name: /No campaign yet/ }));

    expect(screen.getByText("You have no campaigns yet.")).toBeInTheDocument();
  });
});
