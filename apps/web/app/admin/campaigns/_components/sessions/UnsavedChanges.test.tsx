import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALUMNUS, CAMPAIGN_ID, HOSTS, assignableFixture, sessionFixture } from "@/test-utils/session-fixtures";

const setExpected = vi.fn();
vi.mock("../../sessions-actions", () => ({
  createSessionAction: vi.fn(),
  updateSessionAction: vi.fn(),
  createHostAction: vi.fn(),
  updateHostAction: vi.fn(),
  cancelSessionAction: vi.fn(),
  recordAttendanceAction: vi.fn(),
  setExpectedAction: (...args: unknown[]) => setExpected(...args),
}));

import CancelDialog from "./CancelDialog";
import HostDialog from "./HostDialog";
import NumbersDialog from "./NumbersDialog";
import SessionFormDialog from "./SessionFormDialog";

beforeEach(() => setExpected.mockReset());

const PROVINCES = [{ id: 2, name: "Battambang" }];
const asking = () => screen.queryByRole("dialog", { name: "Discard your changes?" });

/** What every form must do: leave quietly when untouched, ask once something was typed, and honour the answer. */
function behavesLikeAGuardedForm(name: string, render: () => { onClose: ReturnType<typeof vi.fn> }, type: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  describe(name, () => {
    it("closes without asking when nothing was typed", async () => {
      const user = userEvent.setup();
      const { onClose } = render();

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(asking()).not.toBeInTheDocument();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks before the close button discards what was typed, and Keep editing keeps it open", async () => {
      const user = userEvent.setup();
      const { onClose } = render();
      await type(user);

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(asking()).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(asking()).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes on Discard", async () => {
      const user = userEvent.setup();
      const { onClose } = render();
      await type(user);
      await user.click(screen.getByRole("button", { name: "Close" }));

      await user.click(screen.getByRole("button", { name: "Discard" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
}

behavesLikeAGuardedForm(
  "the session form",
  () => {
    const onClose = vi.fn();
    render(
      <SessionFormDialog target={{ kind: "create" }} campaignId={CAMPAIGN_ID} targetProvinces={PROVINCES} hosts={HOSTS} assignable={assignableFixture()} onClose={onClose} />,
    );
    return { onClose };
  },
  async (user) => {
    await user.type(screen.getByLabelText("Title"), "Open day");
  },
);

behavesLikeAGuardedForm(
  "the host form",
  () => {
    const onClose = vi.fn();
    render(<HostDialog target={{ kind: "create", type: "Alumni" }} onClose={onClose} onSaved={vi.fn()} />);
    return { onClose };
  },
  async (user) => {
    await user.type(screen.getByLabelText("Full name"), "Chenda");
  },
);

behavesLikeAGuardedForm(
  "the cancel-session form",
  () => {
    const onClose = vi.fn();
    render(<CancelDialog session={sessionFixture()} onClose={onClose} />);
    return { onClose };
  },
  async (user) => {
    await user.type(screen.getByLabelText("Reason"), "Heavy rain");
  },
);

behavesLikeAGuardedForm(
  "the numbers form",
  () => {
    const onClose = vi.fn();
    render(<NumbersDialog session={sessionFixture()} onClose={onClose} />);
    return { onClose };
  },
  async (user) => {
    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), "40");
  },
);

describe("editing a form back to how it started", () => {
  it("is not unsaved any more", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HostDialog target={{ kind: "edit", host: ALUMNUS }} onClose={onClose} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText("Full name"), "x");
    await user.type(screen.getByLabelText("Full name"), "{Backspace}");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(asking()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is judged against the last save in the numbers form, which stays open after saving", async () => {
    setExpected.mockResolvedValue({ ok: true, data: sessionFixture({ expectedCandidates: 40 }) });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NumbersDialog session={sessionFixture()} onClose={onClose} />);

    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), "40");
    await user.click(screen.getByRole("button", { name: "Save expected" }));
    await waitFor(() => expect(setExpected).toHaveBeenCalled());
    await screen.findByText("Saved.");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(asking()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
