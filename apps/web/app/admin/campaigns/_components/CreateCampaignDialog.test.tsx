import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createAction = vi.fn();
const previewAction = vi.fn();
vi.mock("../actions", () => ({
  createCampaignAction: (...args: unknown[]) => createAction(...args),
  loadCopyPreviewAction: (...args: unknown[]) => previewAction(...args),
}));

import type { CampaignSummary, CopyPreview } from "@/lib/campaigns/types";
import CreateCampaignButton from "./CreateCampaignButton";
import CreateCampaignDialog from "./CreateCampaignDialog";
import { CreateCampaignProvider } from "./CreateCampaignProvider";

beforeEach(() => {
  push.mockReset();
  createAction.mockReset();
  previewAction.mockReset();
});

const SOURCE: CampaignSummary = { id: "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f", name: "Selection 2026", academicYear: "2026–2027", status: "Closed", createdAt: "2026-01-01T00:00:00Z" };
const OTHER: CampaignSummary = { id: "7a2d2e3f-4b5c-4d6e-8f0a-1b2c3d4e5f60", name: "Selection 2025", academicYear: "2025–2026", status: "Closed", createdAt: "2025-01-01T00:00:00Z" };

const PREVIEW: CopyPreview = {
  sourceCampaignId: SOURCE.id,
  name: SOURCE.name,
  academicYear: SOURCE.academicYear,
  parts: [
    { key: "Provinces", label: "Target provinces", available: true, count: 4, note: null },
    { key: "Details", label: "Details", available: true, count: 3, note: "The name, academic year and dates are not copied." },
    { key: "EligibilityRules", label: "Eligibility rules", available: true, count: 9, note: "Includes the 4 exam subjects the rules use." },
    { key: "InformationSessions", label: "Information sessions", available: false, count: 0, note: "This campaign has no sessions to copy." },
  ],
};

function renderDialog(copySources: CampaignSummary[] = []) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<CreateCampaignDialog open onClose={onClose} copySources={copySources} />);
  return { user, onClose };
}

/** Types a name, chooses to copy from SOURCE and waits for the checklist. */
async function startCopyFromSource(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");
  await user.click(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ }));
  await user.selectOptions(screen.getByLabelText("Copy from"), SOURCE.id);
  await screen.findByRole("group", { name: "What do you want to copy?" });
}

describe("CreateCampaignDialog", () => {
  it("is a modal dialog labelled by its title", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Create campaign" })).toBeInTheDocument();
    expect(screen.getByText("Start with the basics. You will configure the details in the next steps.")).toBeInTheDocument();
  });

  it("has the fields from the design, with the hint and the optional marker", () => {
    renderDialog();

    expect(screen.getByLabelText("Campaign name")).toHaveAccessibleDescription("Staff will see this name everywhere in the app.");
    expect(screen.getByLabelText("Academic year")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText(/Short description/)).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("preselects next year's academic year", () => {
    renderDialog();

    const nextYear = new Date().getFullYear() + 1;
    expect(screen.getByLabelText("Academic year")).toHaveValue(`${nextYear}–${nextYear + 1}`);
  });

  it("offers Start from scratch, selected, and a disabled Copy option that explains itself when there is nothing to copy from", () => {
    renderDialog();

    const scratch = screen.getByRole("radio", { name: /Start from scratch/ });
    const copy = screen.getByRole("radio", { name: /Copy settings from an existing campaign/ });
    expect(scratch).toBeChecked();
    expect(copy).toBeDisabled();
    expect(copy).toHaveAccessibleDescription("Available once there is another campaign to copy from.");
  });

  it("lets the Copy option be chosen once there is a campaign to copy from", () => {
    renderDialog([SOURCE]);

    const copy = screen.getByRole("radio", { name: /Copy settings from an existing campaign/ });
    expect(copy).toBeEnabled();
    expect(copy).toHaveAccessibleDescription("Pick the campaign, then choose what to carry over, one by one.");
    expect(screen.queryByLabelText("Copy from")).not.toBeInTheDocument();
  });

  it("asks for a name before creating anything, and puts focus on the field", async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    expect(createAction).not.toHaveBeenCalled();
    const name = screen.getByLabelText("Campaign name");
    expect(name).toHaveAccessibleDescription("Enter a campaign name.");
    expect(name).toHaveFocus();
  });

  it("creates the campaign and opens its setup overview", async () => {
    createAction.mockResolvedValue({ ok: true, data: { id: "abc-123" } });
    const { user, onClose } = renderDialog();
    await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");
    await user.type(screen.getByLabelText(/Short description/), "Yearly selection");

    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/campaigns/abc-123"));
    expect(createAction).toHaveBeenCalledWith({
      name: "Selection 2027",
      academicYear: expect.stringMatching(/^\d{4}–\d{4}$/),
      description: "Yearly selection",
      startMode: "scratch",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a duplicate-name error from the server under the name field and stays open", async () => {
    createAction.mockResolvedValue({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { name: "A campaign with this name already exists." },
    });
    const { user, onClose } = renderDialog();
    await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");

    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    const name = screen.getByLabelText("Campaign name");
    await waitFor(() => expect(name).toHaveAccessibleDescription("A campaign with this name already exists."));
    expect(name).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a server problem that is not about a field as an alert", async () => {
    createAction.mockResolvedValue({ ok: false, message: "We could not reach the server. Check your connection and try again." });
    const { user } = renderDialog();
    await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");

    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server");
  });

  it("closes from Cancel", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from the X button", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("with something typed", () => {
    const asking = () => screen.queryByRole("dialog", { name: "Discard your changes?" });

    it("asks before the X button throws it away, and Keep editing keeps what was typed", async () => {
      const { user, onClose } = renderDialog();
      await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(asking()).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(asking()).not.toBeInTheDocument();
      expect(screen.getByLabelText("Campaign name")).toHaveValue("Selection 2027");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes once, on Discard", async () => {
      const { user, onClose } = renderDialog();
      await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");
      await user.click(screen.getByRole("button", { name: "Close" }));

      await user.click(screen.getByRole("button", { name: "Discard" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks on the backdrop and on Escape, and holds Escape back", async () => {
      const { user } = renderDialog();
      await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");

      const escape = new Event("cancel", { cancelable: true });
      await act(async () => {
        document.querySelector("dialog")!.dispatchEvent(escape);
      });

      expect(escape.defaultPrevented).toBe(true);
      expect(asking()).toBeInTheDocument();
    });

    it("treats a chosen source campaign as something to lose too", async () => {
      const { user, onClose } = renderDialog([SOURCE]);
      previewAction.mockResolvedValue({ ok: true, data: PREVIEW });
      await user.click(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ }));
      await user.selectOptions(screen.getByLabelText("Copy from"), SOURCE.id);

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(asking()).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("leaves Cancel as an explicit way out that does not ask", async () => {
      const { user, onClose } = renderDialog();
      await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(asking()).not.toBeInTheDocument();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe("CreateCampaignDialog: copying from an existing campaign", () => {
  beforeEach(() => {
    previewAction.mockResolvedValue({ ok: true, data: PREVIEW });
  });

  it("lists the campaigns to copy from, with their year and status", async () => {
    const { user } = renderDialog([SOURCE, OTHER]);

    await user.click(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ }));

    const options = within(screen.getByLabelText("Copy from")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a campaign…", "Selection 2026 · 2026–2027 (Closed)", "Selection 2025 · 2025–2026 (Closed)"]);
  });

  it("shows what the chosen campaign has, one box each with its count, nothing ticked yet", async () => {
    const { user } = renderDialog([SOURCE]);

    await startCopyFromSource(user);

    expect(previewAction).toHaveBeenCalledWith(SOURCE.id);
    const group = within(screen.getByRole("group", { name: "What do you want to copy?" }));
    expect(group.getByRole("checkbox", { name: /Target provinces · 4 provinces/ })).not.toBeChecked();
    expect(group.getByRole("checkbox", { name: /Description, expected candidates and seats · 3 of 3 filled in/ })).not.toBeChecked();
    expect(group.getByRole("checkbox", { name: /Eligibility rules · 9 rules/ })).not.toBeChecked();
    expect(group.getByText("Includes the 4 exam subjects the rules use.")).toBeInTheDocument();
  });

  it("shows a part with nothing to copy, unticked and disabled, with the reason", async () => {
    const { user } = renderDialog([SOURCE]);

    await startCopyFromSource(user);

    const sessions = screen.getByRole("checkbox", { name: /Information sessions/ });
    expect(sessions).toBeDisabled();
    expect(screen.getByText("This campaign has no sessions to copy.")).toBeInTheDocument();
  });

  it("says it is checking while the preview loads, and shows the server's message if it fails", async () => {
    previewAction.mockResolvedValue({ ok: false, message: "This campaign does not exist." });
    const { user } = renderDialog([SOURCE]);
    await user.click(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ }));

    await user.selectOptions(screen.getByLabelText("Copy from"), SOURCE.id);

    expect(await screen.findByRole("alert")).toHaveTextContent("This campaign does not exist.");
    expect(screen.queryByRole("group", { name: "What do you want to copy?" })).not.toBeInTheDocument();
  });

  it("forgets what was ticked when another campaign is chosen, and ignores a late answer for the first", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    previewAction
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({ ok: true, data: { ...PREVIEW, sourceCampaignId: OTHER.id, name: OTHER.name } });
    const { user } = renderDialog([SOURCE, OTHER]);
    await user.click(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ }));

    await user.selectOptions(screen.getByLabelText("Copy from"), SOURCE.id);
    await user.selectOptions(screen.getByLabelText("Copy from"), OTHER.id);
    await screen.findByRole("group", { name: "What do you want to copy?" });
    await user.click(screen.getByRole("checkbox", { name: /Target provinces/ }));
    answerFirst({ ok: true, data: { ...PREVIEW, parts: [] } });

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Target provinces/ })).toBeChecked());
  });

  it("asks for a campaign, then for at least one thing, before creating anything", async () => {
    const { user } = renderDialog([SOURCE]);
    await user.type(screen.getByLabelText("Campaign name"), "Selection 2027");
    await user.click(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ }));

    await user.click(screen.getByRole("button", { name: "Create and continue" }));
    expect(screen.getByLabelText("Copy from")).toHaveAccessibleDescription("Choose the campaign to copy from.");
    expect(screen.getByLabelText("Copy from")).toHaveFocus();

    await user.selectOptions(screen.getByLabelText("Copy from"), SOURCE.id);
    await screen.findByRole("group", { name: "What do you want to copy?" });
    await user.click(screen.getByRole("button", { name: "Create and continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one thing to copy.");

    expect(createAction).not.toHaveBeenCalled();
  });

  it("sends the source and exactly the parts that were ticked, in the order they are copied", async () => {
    createAction.mockResolvedValue({ ok: true, data: { id: "new-1", copyResults: [] } });
    const { user } = renderDialog([SOURCE]);
    await startCopyFromSource(user);

    await user.click(screen.getByRole("checkbox", { name: /Eligibility rules/ }));
    await user.click(screen.getByRole("checkbox", { name: /Target provinces/ }));
    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(createAction).toHaveBeenCalledWith({
      name: "Selection 2027",
      academicYear: expect.stringMatching(/^\d{4}–\d{4}$/),
      description: "",
      startMode: "copy",
      copyFrom: { sourceCampaignId: SOURCE.id, parts: ["Provinces", "EligibilityRules"] },
    });
  });

  it("does not send a copy that was ticked and then switched back to from scratch", async () => {
    createAction.mockResolvedValue({ ok: true, data: { id: "new-2", copyResults: null } });
    const { user } = renderDialog([SOURCE]);
    await startCopyFromSource(user);
    await user.click(screen.getByRole("checkbox", { name: /Target provinces/ }));

    await user.click(screen.getByRole("radio", { name: /Start from scratch/ }));
    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/campaigns/new-2"));
    expect(createAction).toHaveBeenCalledWith(expect.not.objectContaining({ copyFrom: expect.anything() }));
    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({ startMode: "scratch" }));
  });

  it("says how each part went before opening the campaign, including what did not copy", async () => {
    createAction.mockResolvedValue({
      ok: true,
      data: {
        id: "new-3",
        copyResults: [
          { part: "Provinces", outcome: "Copied", count: 4, issues: [] },
          { part: "EligibilityRules", outcome: "Partly", count: 9, issues: ["1 rule(s) name provinces this campaign does not target yet."] },
          { part: "InformationSessions", outcome: "Failed", count: 0, issues: ["The campaign you are copying from has no sessions to copy."] },
        ],
      },
    });
    const { user, onClose } = renderDialog([SOURCE]);
    await startCopyFromSource(user);
    await user.click(screen.getByRole("checkbox", { name: /Target provinces/ }));
    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    const list = await screen.findByRole("list", { name: "What was copied" });
    expect(screen.getByRole("heading", { name: "Campaign created" })).toBeInTheDocument();
    const items = within(list).getAllByRole("listitem").filter((li) => li.parentElement === list);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Target provinces · 4 provinces");
    expect(items[0]).toHaveTextContent("Copied");
    expect(items[1]).toHaveTextContent("Copied, with something to check");
    expect(items[1]).toHaveTextContent("1 rule(s) name provinces this campaign does not target yet.");
    expect(items[2]).toHaveTextContent("Not copied");
    expect(items[2]).toHaveTextContent("The campaign you are copying from has no sessions to copy.");
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open campaign" }));

    expect(push).toHaveBeenCalledWith("/admin/campaigns/new-3");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server's message about the source under the Copy from box and stays open", async () => {
    createAction.mockResolvedValue({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { "copyFrom.sourceCampaignId": "The campaign to copy from no longer exists." },
    });
    const { user, onClose } = renderDialog([SOURCE]);
    await startCopyFromSource(user);
    await user.click(screen.getByRole("checkbox", { name: /Target provinces/ }));

    await user.click(screen.getByRole("button", { name: "Create and continue" }));

    await waitFor(() => expect(screen.getByLabelText("Copy from")).toHaveAccessibleDescription("The campaign to copy from no longer exists."));
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("CreateCampaignProvider and button", () => {
  it("opens an empty dialog from the button, and a fresh empty one every time", async () => {
    const user = userEvent.setup();
    render(
      <CreateCampaignProvider canCreate>
        <CreateCampaignButton />
      </CreateCampaignProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    await user.type(screen.getByLabelText("Campaign name"), "Half typed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    expect(screen.getByLabelText("Campaign name")).toHaveValue("");
  });

  it("hands the campaign list to the dialog, so Copy can be chosen from the button's dialog", async () => {
    const user = userEvent.setup();
    render(
      <CreateCampaignProvider canCreate copySources={[SOURCE]}>
        <CreateCampaignButton />
      </CreateCampaignProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    expect(screen.getByRole("radio", { name: /Copy settings from an existing campaign/ })).toBeEnabled();
  });

  it("shows no create button, and no dialog, to people who may not create campaigns", () => {
    render(
      <CreateCampaignProvider canCreate={false}>
        <CreateCampaignButton />
      </CreateCampaignProvider>,
    );

    expect(screen.queryByRole("button", { name: "Create campaign" })).not.toBeInTheDocument();
  });
});
