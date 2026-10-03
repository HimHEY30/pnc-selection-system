import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCampaign, makeSteps, PROVINCES } from "@/test-utils/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const saveAction = vi.fn();
vi.mock("../actions", () => ({ saveCampaignInfoAction: (...args: unknown[]) => saveAction(...args) }));

import CampaignInfoForm from "./CampaignInfoForm";

const SAVED = {
  version: 8,
  infoSavedAt: "2026-10-03T03:30:00Z", // 10:30 AM in Cambodia
  steps: makeSteps("InProgress"),
  progress: { total: 5, complete: 0, inProgress: 1 },
};

function setup(props: Partial<React.ComponentProps<typeof CampaignInfoForm>> = {}) {
  const user = userEvent.setup();
  render(<CampaignInfoForm campaign={makeCampaign()} provinces={PROVINCES} canEdit {...props} />);
  return user;
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Start date"), "2026-11-02");
  await user.type(screen.getByLabelText("End date"), "2027-03-31");
  await user.type(screen.getByLabelText("Expected candidates"), "1500");
  await user.type(screen.getByLabelText("Seats available"), "150");
  await user.click(screen.getByRole("button", { name: "Target provinces" }));
  await user.click(screen.getByRole("option", { name: "Siem Reap" }));
  await user.click(screen.getByRole("option", { name: "Takeo" }));
  await user.keyboard("{Escape}");
}

beforeEach(() => {
  push.mockReset();
  saveAction.mockReset();
});

describe("CampaignInfoForm: what it shows", () => {
  it("fills the fields from the saved campaign", () => {
    setup({
      campaign: makeCampaign({
        startDate: "2026-11-02",
        endDate: "2027-03-31",
        expectedCandidates: 1500,
        seatsAvailable: 150,
        provinceIds: [17, 2],
      }),
    });

    expect(screen.getByLabelText("Campaign name")).toHaveValue("Selection 2027");
    expect(screen.getByLabelText("Academic year")).toHaveValue("2027–2028");
    expect(screen.getByLabelText("Description")).toHaveValue("Yearly selection of students for the PNC IT training programme.");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-11-02");
    expect(screen.getByLabelText("End date")).toHaveValue("2027-03-31");
    expect(screen.getByLabelText("Expected candidates")).toHaveValue("1500");
    expect(screen.getByLabelText("Seats available")).toHaveValue("150");
    expect(screen.getByRole("button", { name: "Remove Siem Reap" })).toBeInTheDocument();
  });

  it("shows when the draft was last saved", () => {
    setup();

    expect(screen.getByRole("status")).toHaveTextContent("Draft saved at 9:12 AM");
  });

  it("shows the step strip with Step 1 in progress", () => {
    setup();

    expect(screen.getByText("Step 1 · In progress")).toBeInTheDocument();
  });

  it("keeps an academic year that is outside the usual list", () => {
    setup({ campaign: makeCampaign({ academicYear: "2019–2020" }) });

    expect(screen.getByLabelText("Academic year")).toHaveValue("2019–2020");
  });
});

describe("CampaignInfoForm: inline date validation and timeline", () => {
  it("shows the end-date error under the field as soon as the dates disagree", async () => {
    const user = setup();

    await user.type(screen.getByLabelText("Start date"), "2026-11-02");
    await user.type(screen.getByLabelText("End date"), "2026-10-30");

    const end = screen.getByLabelText("End date");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription("End date must be after the start date (2 Nov 2026).");
  });

  it("follows the dates in the timeline preview", async () => {
    const user = setup();

    await user.type(screen.getByLabelText("Start date"), "2026-11-02");
    expect(screen.getByText("2 Nov 2026")).toBeInTheDocument();

    await user.type(screen.getByLabelText("End date"), "2026-10-30");
    expect(screen.getByText("Fix the end date to see it here")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2027-03-31");
    expect(screen.getByText("31 Mar 2027")).toBeInTheDocument();
    expect(screen.queryByText("Fix the end date to see it here")).not.toBeInTheDocument();
  });

  it("shows a field's error once the user leaves it, not before", async () => {
    const user = setup({ campaign: makeCampaign({ name: "" }) });
    const name = screen.getByLabelText("Campaign name");
    expect(name).not.toHaveAttribute("aria-invalid");

    await user.click(name);
    await user.tab();

    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter a campaign name.");
  });
});

describe("CampaignInfoForm: Save draft", () => {
  it("sends whatever is filled in, with the version it last read, and keeps the step in progress", async () => {
    saveAction.mockResolvedValue({ ok: true, data: SAVED });
    const user = setup();
    await user.type(screen.getByLabelText("Expected candidates"), "1500");

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
    expect(saveAction).toHaveBeenCalledWith(
      "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
      "draft",
      expect.objectContaining({
        name: "Selection 2027",
        expectedCandidates: 1500,
        startDate: null,
        endDate: null,
        seatsAvailable: null,
        provinceIds: [],
        version: 7,
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("updates the last-saved time and uses the new version next time", async () => {
    saveAction.mockResolvedValue({ ok: true, data: SAVED });
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Draft saved at 10:30 AM"));
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(2));
    expect(saveAction.mock.calls[1][2]).toMatchObject({ version: 8 });
  });

  it("does not call the server when something filled in is wrong", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Expected candidates"), "0");

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Expected candidates")).toHaveAccessibleDescription(
      "Expected candidates must be a whole number greater than 0.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Some fields need your attention");
    expect(screen.getByLabelText("Expected candidates")).toHaveFocus();
  });
});

describe("CampaignInfoForm: Save and continue", () => {
  it("asks for every missing field, under each field, and does not call the server", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 2" }));

    expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Start date")).toHaveAccessibleDescription("Enter a start date.");
    expect(screen.getByLabelText("End date")).toHaveAccessibleDescription("Enter an end date.");
    expect(screen.getByLabelText("Expected candidates")).toHaveAccessibleDescription("Enter the expected number of candidates.");
    expect(screen.getByLabelText("Seats available")).toHaveAccessibleDescription("Enter the number of seats available.");
    expect(screen.getByText("Choose at least one target province.")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveFocus();
  });

  it("explains seats above expected candidates", async () => {
    const user = setup();
    await fillValid(user);
    await user.clear(screen.getByLabelText("Seats available"));
    await user.type(screen.getByLabelText("Seats available"), "1501");

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 2" }));

    expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Seats available")).toHaveAccessibleDescription(
      "Seats available cannot be more than expected candidates (1,500).",
    );
  });

  it("saves as complete and goes back to the setup overview", async () => {
    saveAction.mockResolvedValue({ ok: true, data: SAVED });
    const user = setup();
    await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 2" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
    expect(saveAction).toHaveBeenCalledWith(
      "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
      "complete",
      expect.objectContaining({
        startDate: "2026-11-02",
        endDate: "2027-03-31",
        expectedCandidates: 1500,
        seatsAvailable: 150,
        provinceIds: [17, 21],
        version: 7,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/campaigns/6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f"));
  });

  it("submits with the Enter key from a text field", async () => {
    saveAction.mockResolvedValue({ ok: true, data: SAVED });
    const user = setup();
    await fillValid(user);

    await user.type(screen.getByLabelText("Seats available"), "{Enter}");

    await waitFor(() => expect(saveAction).toHaveBeenCalledWith(expect.any(String), "complete", expect.anything()));
  });

  it("shows a message from the server under the field it belongs to", async () => {
    saveAction.mockResolvedValue({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { name: "A campaign with this name already exists." },
    });
    const user = setup();
    await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 2" }));

    const name = screen.getByLabelText("Campaign name");
    await waitFor(() => expect(name).toHaveAccessibleDescription("A campaign with this name already exists."));
    expect(name).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("clears a server message from a field as soon as the user edits that field", async () => {
    saveAction.mockResolvedValue({
      ok: false,
      message: "x",
      fieldErrors: { name: "A campaign with this name already exists." },
    });
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Save and continue to Step 2" }));
    await waitFor(() => expect(screen.getByLabelText("Campaign name")).toHaveAttribute("aria-invalid", "true"));

    await user.type(screen.getByLabelText("Campaign name"), " B");

    expect(screen.getByLabelText("Campaign name")).not.toHaveAttribute("aria-invalid");
  });

  it("shows a problem that is not about one field as a message above the form", async () => {
    saveAction.mockResolvedValue({ ok: false, message: "Someone else changed this campaign. Reload the page and try again." });
    const user = setup();
    await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Save and continue to Step 2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else changed this campaign");
    expect(push).not.toHaveBeenCalled();
  });

  it("disables the buttons and says Saving while the save is running", async () => {
    let finish: (value: unknown) => void = () => {};
    saveAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const saving = await screen.findAllByRole("button", { name: "Saving…" });
    expect(saving).toHaveLength(2);
    for (const button of saving) expect(button).toBeDisabled();

    finish({ ok: true, data: SAVED });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
  });
});

describe("CampaignInfoForm: people who may not edit", () => {
  it("shows every field disabled, no save buttons, and says why", () => {
    setup({ canEdit: false });

    expect(screen.getByLabelText("Campaign name")).toBeDisabled();
    expect(screen.getByLabelText("Start date")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Target provinces" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save and continue to Step 2" })).not.toBeInTheDocument();
    expect(screen.getByText(/only a selection manager or a system admin can change it/)).toBeInTheDocument();
  });

  it("explains a campaign that is no longer a draft", () => {
    setup({ canEdit: false, campaign: makeCampaign({ status: "Active" }) });

    expect(screen.getByText(/no longer a draft/)).toBeInTheDocument();
  });

  it("does not save when Enter is pressed in a read-only form", async () => {
    const user = setup({ canEdit: false });

    await user.click(screen.getByLabelText("Campaign name"));
    await user.keyboard("{Enter}");

    expect(saveAction).not.toHaveBeenCalled();
  });
});
