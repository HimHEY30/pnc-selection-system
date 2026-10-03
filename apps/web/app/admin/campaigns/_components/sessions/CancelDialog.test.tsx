import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ID, cancelledSession, sessionFixture } from "@/test-utils/session-fixtures";

const cancelSession = vi.fn();
vi.mock("../../sessions-actions", () => ({ cancelSessionAction: (...args: unknown[]) => cancelSession(...args) }));

import CancelDialog from "./CancelDialog";

beforeEach(() => cancelSession.mockReset());

function renderDialog(open = true) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<CancelDialog session={open ? sessionFixture() : null} onClose={onClose} />);
  return { user, onClose };
}

describe("CancelDialog", () => {
  it("is closed when there is no session", () => {
    renderDialog(false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says what cancelling does, and puts focus in the reason box", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Cancel this session?" })).toBeInTheDocument();
    expect(screen.getByText(/Open day at Kampong Cham High School will be marked as cancelled/)).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toHaveAccessibleDescription("Everyone who looks at the session will see this.");
  });

  it("cancels with the reason, trimmed, and closes", async () => {
    cancelSession.mockResolvedValue({ ok: true, data: cancelledSession() });
    const { user, onClose } = renderDialog();

    await user.type(screen.getByLabelText("Reason"), "  Heavy rain  ");
    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    await waitFor(() => expect(cancelSession).toHaveBeenCalledWith(CAMPAIGN_ID, sessionFixture().id, "Heavy rain"));
    expect(onClose).toHaveBeenCalled();
  });

  it("will not cancel without a reason", async () => {
    const { user, onClose } = renderDialog();

    await user.type(screen.getByLabelText("Reason"), "   ");
    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    expect(screen.getByLabelText("Reason")).toHaveAccessibleDescription("Say why the session is cancelled.");
    expect(cancelSession).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("will not cancel with a reason that is too long", async () => {
    const { user } = renderDialog();

    await user.click(screen.getByLabelText("Reason"));
    await user.paste("r".repeat(301));
    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    expect(screen.getByLabelText("Reason")).toHaveAccessibleDescription("Use at most 300 characters.");
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it("keeps the session when asked to, without calling the server", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Keep session" }));

    expect(onClose).toHaveBeenCalled();
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it("stays open and says why when the server refuses", async () => {
    cancelSession.mockResolvedValue({ ok: false, message: "A session that took place cannot be cancelled." });
    const { user, onClose } = renderDialog();

    await user.type(screen.getByLabelText("Reason"), "Rain");
    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A session that took place cannot be cancelled.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the server's message about the reason under the box", async () => {
    cancelSession.mockResolvedValue({ ok: false, message: "Bad", fieldErrors: { reason: "Say why the session is cancelled." } });
    const { user } = renderDialog();

    await user.type(screen.getByLabelText("Reason"), "x");
    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    expect(await screen.findByText("Say why the session is cancelled.")).toBeInTheDocument();
  });

  it("disables both buttons while it works", async () => {
    let finish: (value: unknown) => void = () => {};
    cancelSession.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderDialog();
    await user.type(screen.getByLabelText("Reason"), "Rain");

    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    expect(await screen.findByRole("button", { name: "Cancelling…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep session" })).toBeDisabled();
    finish({ ok: true, data: cancelledSession() });
  });
});
