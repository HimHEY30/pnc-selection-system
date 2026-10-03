import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeCampaign, makeSteps } from "@/test-utils/fixtures";
import SetupProgressCard from "./SetupProgressCard";
import SetupStepList from "./SetupStepList";
import StepTabs from "./StepTabs";
import TimelinePreview from "./TimelinePreview";

const ID = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

describe("SetupStepList", () => {
  it("lists the five steps in order with their status", () => {
    render(<SetupStepList campaignId={ID} steps={makeSteps("InProgress")} canEdit />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(
      items.map((li) => within(li).getByRole("heading").textContent),
    ).toEqual(["Campaign info", "Eligibility rules", "Information sessions", "Candidates", "Entrance exam"]);
    expect(within(items[0]).getByText("In progress")).toBeInTheDocument();
    expect(within(items[1]).getByText("Not started")).toBeInTheDocument();
  });

  it("offers Continue on an in-progress Step 1 as a link to its page", () => {
    render(<SetupStepList campaignId={ID} steps={makeSteps("InProgress")} canEdit />);

    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", `/admin/campaigns/${ID}/info`);
  });

  it("offers Start on a Step 1 that has not begun and Review once it is complete", () => {
    const first = () => screen.getAllByRole("listitem")[0];
    const { rerender } = render(<SetupStepList campaignId={ID} steps={makeSteps("NotStarted")} canEdit />);
    expect(within(first()).getByRole("link", { name: "Start" })).toBeInTheDocument();

    rerender(<SetupStepList campaignId={ID} steps={makeSteps("Complete")} canEdit />);
    expect(within(first()).getByRole("link", { name: "Review" })).toBeInTheDocument();
  });

  it("shows the steps that have no page yet as disabled buttons, not as links to pages that do not exist", () => {
    render(<SetupStepList campaignId={ID} steps={makeSteps()} canEdit />);

    const disabled = screen.getAllByRole("button");
    expect(disabled).toHaveLength(3); // steps 3, 4 and 5
    for (const button of disabled) {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Start");
      expect(button).toHaveTextContent("Coming soon");
    }
    expect(screen.getAllByRole("link")).toHaveLength(2); // steps 1 and 2
  });

  it("links Step 2 to the eligibility rules page", () => {
    render(<SetupStepList campaignId={ID} steps={makeSteps("Complete")} canEdit />);

    const step2 = screen.getAllByRole("listitem")[1];
    expect(within(step2).getByRole("link", { name: "Start" })).toHaveAttribute("href", `/admin/campaigns/${ID}/eligibility`);
  });

  it("highlights Step 2 as the next one once Step 1 is complete", () => {
    render(<SetupStepList campaignId={ID} steps={makeSteps("Complete")} canEdit />);

    const step2 = screen.getAllByRole("listitem")[1];
    expect(within(step2).getByRole("link", { name: "Start" }).className).toContain("bg-primary");
    // Step 1 is done, so its button is the quiet outlined one.
    expect(screen.getByRole("link", { name: "Review" }).className).toContain("border-line-strong");
  });

  it("says View instead of Start or Continue for people who may not edit", () => {
    render(<SetupStepList campaignId={ID} steps={makeSteps("InProgress")} canEdit={false} />);

    const links = screen.getAllByRole("link", { name: "View" });
    expect(links[0]).toHaveAttribute("href", `/admin/campaigns/${ID}/info`);
    expect(links[1]).toHaveAttribute("href", `/admin/campaigns/${ID}/eligibility`);
    expect(screen.queryByRole("link", { name: "Continue" })).not.toBeInTheDocument();
  });
});

describe("SetupProgressCard", () => {
  it("shows how many steps are complete and in progress", () => {
    render(<SetupProgressCard campaign={makeCampaign()} />);

    expect(screen.getByText("0 of 5 steps complete")).toBeInTheDocument();
    expect(screen.getByText("1 in progress")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("keeps Review and activate disabled until every step is complete", () => {
    render(<SetupProgressCard campaign={makeCampaign({ canActivate: false })} />);

    expect(screen.getByRole("button", { name: "Review and activate" })).toBeDisabled();
  });

  it("enables Review and activate once the backend says the campaign can be activated", () => {
    render(<SetupProgressCard campaign={makeCampaign({ canActivate: true })} />);

    expect(screen.getByRole("button", { name: "Review and activate" })).toBeEnabled();
  });

  it("shows the academic year and who created the campaign", () => {
    render(<SetupProgressCard campaign={makeCampaign()} />);

    expect(screen.getByText("2027–2028")).toBeInTheDocument();
    expect(screen.getByText("Sreyneang Chea")).toBeInTheDocument();
  });
});

describe("StepTabs", () => {
  it("marks the current step with its status and lists the others by number", () => {
    render(<StepTabs steps={makeSteps("InProgress")} current="CampaignInfo" />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveTextContent("Step 1 · In progress");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(items[1]).toHaveTextContent("Step 2");
    expect(items[1]).toHaveTextContent("Eligibility rules");
  });
});

describe("StepTabs on another step", () => {
  it("numbers the current step by its own number, not always Step 1", () => {
    render(<StepTabs steps={makeSteps("Complete")} current="EligibilityRules" />);

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("Step 2 · Not started");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(items[0]).toHaveTextContent("Step 1");
  });
});

describe("TimelinePreview", () => {
  it("shows the start date and a placeholder for the end date", () => {
    render(<TimelinePreview startDate="2026-11-02" endDate="" />);

    expect(screen.getByText("2 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Not set yet")).toBeInTheDocument();
  });

  it("shows both dates when they are in order", () => {
    render(<TimelinePreview startDate="2026-11-02" endDate="2027-03-31" />);

    expect(screen.getByText("2 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("31 Mar 2027")).toBeInTheDocument();
  });

  it("shows the fix-it message instead of an end date that is not after the start", () => {
    render(<TimelinePreview startDate="2026-11-02" endDate="2026-10-30" />);

    expect(screen.getByText("Fix the end date to see it here")).toBeInTheDocument();
    expect(screen.queryByText("30 Oct 2026")).not.toBeInTheDocument();
  });

  it("always shows the sessions and exam rows that later steps will fill in", () => {
    render(<TimelinePreview startDate="" endDate="" />);

    expect(screen.getByText("Set in Step 3")).toBeInTheDocument();
    expect(screen.getByText("Set in Step 5")).toBeInTheDocument();
  });
});
