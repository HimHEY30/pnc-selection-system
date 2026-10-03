import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createAction = vi.fn();
vi.mock("../actions", () => ({ createCampaignAction: (...args: unknown[]) => createAction(...args) }));

import CreateCampaignButton from "./CreateCampaignButton";
import CreateCampaignDialog from "./CreateCampaignDialog";
import { CreateCampaignProvider } from "./CreateCampaignProvider";

beforeEach(() => {
  push.mockReset();
  createAction.mockReset();
});

function renderDialog() {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<CreateCampaignDialog open onClose={onClose} />);
  return { user, onClose };
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

  it("offers Start from scratch, selected, and a disabled Copy option that explains itself", () => {
    renderDialog();

    const scratch = screen.getByRole("radio", { name: /Start from scratch/ });
    const copy = screen.getByRole("radio", { name: /Copy settings from a previous campaign/ });
    expect(scratch).toBeChecked();
    expect(copy).toBeDisabled();
    expect(copy).toHaveAccessibleDescription("Available once you have completed your first campaign.");
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

  it("shows no create button, and no dialog, to people who may not create campaigns", () => {
    render(
      <CreateCampaignProvider canCreate={false}>
        <CreateCampaignButton />
      </CreateCampaignProvider>,
    );

    expect(screen.queryByRole("button", { name: "Create campaign" })).not.toBeInTheDocument();
  });
});
