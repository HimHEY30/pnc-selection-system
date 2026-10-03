import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALUMNUS, PARTNER } from "@/test-utils/session-fixtures";

const createHost = vi.fn();
const updateHost = vi.fn();
vi.mock("../../sessions-actions", () => ({
  createHostAction: (...args: unknown[]) => createHost(...args),
  updateHostAction: (...args: unknown[]) => updateHost(...args),
}));

import HostDialog, { type HostDialogTarget } from "./HostDialog";

beforeEach(() => {
  createHost.mockReset();
  updateHost.mockReset();
});

function renderDialog(target: HostDialogTarget | null) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<HostDialog target={target} onClose={onClose} onSaved={onSaved} />);
  return { user, onClose, onSaved };
}

describe("HostDialog", () => {
  it("is closed when there is nothing to do", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds an alumnus with a name and a phone number", async () => {
    createHost.mockResolvedValue({ ok: true, data: ALUMNUS });
    const { user, onClose, onSaved } = renderDialog({ kind: "create", type: "Alumni" });

    expect(screen.getByRole("dialog", { name: "Add alumnus" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kind of organisation")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Full name"), "Chenda Sok");
    await user.type(screen.getByLabelText("Phone"), "012 345 678");
    await user.click(screen.getByRole("button", { name: "Save host" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(ALUMNUS));
    expect(createHost).toHaveBeenCalledWith({
      type: "Alumni",
      name: "Chenda Sok",
      partnerKind: null,
      contactPerson: null,
      phone: "012 345 678",
      email: null,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("adds a partner with its kind and contact person", async () => {
    createHost.mockResolvedValue({ ok: true, data: PARTNER });
    const { user, onSaved } = renderDialog({ kind: "create", type: "Partner" });

    expect(screen.getByRole("dialog", { name: "Add partner" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Organisation name"), "Hope School");
    await user.selectOptions(screen.getByLabelText("Kind of organisation"), "HighSchool");
    await user.type(screen.getByLabelText(/Contact person/), "Mr Rith");
    await user.type(screen.getByLabelText("Email"), "info@hope.example.org");
    await user.click(screen.getByRole("button", { name: "Save host" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(PARTNER));
    expect(createHost).toHaveBeenCalledWith({
      type: "Partner",
      name: "Hope School",
      partnerKind: "HighSchool",
      contactPerson: "Mr Rith",
      phone: null,
      email: "info@hope.example.org",
    });
  });

  it("marks what is missing, puts focus on the first problem and sends nothing", async () => {
    const { user } = renderDialog({ kind: "create", type: "Partner" });

    await user.click(screen.getByRole("button", { name: "Save host" }));

    expect(screen.getByLabelText("Organisation name")).toHaveAccessibleDescription("Enter a name.");
    expect(screen.getByLabelText("Kind of organisation")).toHaveAccessibleDescription("Choose what kind of organisation this is.");
    expect(screen.getByLabelText("Phone")).toHaveAccessibleDescription("Give a phone number or an email address.");
    expect(screen.getByLabelText("Organisation name")).toHaveFocus();
    expect(createHost).not.toHaveBeenCalled();
  });

  it("shows the server's message under the box it names, and stays open", async () => {
    createHost.mockResolvedValue({
      ok: false,
      message: "A host with this name already exists.",
      fieldErrors: { name: "An alumnus with this name is already in the list." },
    });
    const { user, onClose } = renderDialog({ kind: "create", type: "Alumni" });

    await user.type(screen.getByLabelText("Full name"), "Chenda Sok");
    await user.type(screen.getByLabelText("Phone"), "012 345 678");
    await user.click(screen.getByRole("button", { name: "Save host" }));

    expect(await screen.findByText("An alumnus with this name is already in the list.")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a message that is not about one box as an alert", async () => {
    createHost.mockResolvedValue({ ok: false, message: "We could not reach the server. Check your connection and try again." });
    const { user } = renderDialog({ kind: "create", type: "Alumni" });

    await user.type(screen.getByLabelText("Full name"), "Chenda");
    await user.type(screen.getByLabelText("Phone"), "012 345 678");
    await user.click(screen.getByRole("button", { name: "Save host" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server");
  });

  it("edits a host, starting from what it has, and does not offer to change its type", async () => {
    updateHost.mockResolvedValue({ ok: true, data: { ...PARTNER, name: "Hope Foundation" } });
    const { user, onSaved } = renderDialog({ kind: "edit", host: PARTNER });

    expect(screen.getByRole("dialog", { name: "Edit host" })).toBeInTheDocument();
    expect(screen.getByLabelText("Organisation name")).toHaveValue("Hope School");
    expect(screen.getByLabelText("Kind of organisation")).toHaveValue("HighSchool");
    expect(screen.getByLabelText(/Contact person/)).toHaveValue("Mr Rith");
    expect(screen.getByLabelText("Email")).toHaveValue("info@hope.example.org");
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Organisation name"));
    await user.type(screen.getByLabelText("Organisation name"), "Hope Foundation");
    await user.click(screen.getByRole("button", { name: "Save host" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateHost).toHaveBeenCalledWith(
      PARTNER.id,
      expect.objectContaining({ type: "Partner", name: "Hope Foundation", partnerKind: "HighSchool", email: "info@hope.example.org" }),
    );
    expect(createHost).not.toHaveBeenCalled();
  });

  it("disables the buttons while it saves", async () => {
    let finish: (value: unknown) => void = () => {};
    createHost.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderDialog({ kind: "create", type: "Alumni" });
    await user.type(screen.getByLabelText("Full name"), "Chenda");
    await user.type(screen.getByLabelText("Phone"), "012 345 678");

    await user.click(screen.getByRole("button", { name: "Save host" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish({ ok: true, data: ALUMNUS });
  });

  it("cancels without saving", async () => {
    const { user, onClose } = renderDialog({ kind: "create", type: "Alumni" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(createHost).not.toHaveBeenCalled();
  });
});
