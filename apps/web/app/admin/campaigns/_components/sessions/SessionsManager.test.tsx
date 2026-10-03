import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ALUMNUS,
  HOSTS,
  assignableFixture,
  cancelledSession,
  doneSession,
  listFixture,
  sessionFixture,
} from "@/test-utils/session-fixtures";
import type { SessionList } from "@/lib/sessions/types";

vi.mock("../../sessions-actions", () => ({
  createSessionAction: vi.fn(),
  updateSessionAction: vi.fn(),
  cancelSessionAction: vi.fn(),
  setExpectedAction: vi.fn(),
  recordAttendanceAction: vi.fn(),
  createHostAction: vi.fn(),
  updateHostAction: vi.fn(),
}));

import SessionsManager from "./SessionsManager";

const planned = sessionFixture();
const done = doneSession();
const cancelled = cancelledSession();
const withAlumnus = sessionFixture({
  id: "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f70",
  title: "Alumni talk",
  date: "2099-04-10",
  assignee: { id: "officer-2", name: "Vanna Officer" },
  host: { type: "Alumni", name: ALUMNUS.name, userId: null, hostId: ALUMNUS.id, partnerKind: null, phone: null, email: null, isActive: true },
});

function renderManager(list: SessionList, options: { canManage?: boolean; assignable?: boolean } = {}) {
  const canManage = options.canManage ?? true;
  const user = userEvent.setup();
  const view = render(
    <SessionsManager
      list={list}
      hosts={canManage ? HOSTS : []}
      assignable={canManage && options.assignable !== false ? assignableFixture() : null}
      canManage={canManage}
    />,
  );
  const rerender = (next: SessionList) =>
    view.rerender(<SessionsManager list={next} hosts={HOSTS} assignable={assignableFixture()} canManage={canManage} />);
  return { user, rerender };
}

const cardOf = (title: string) => screen.getByRole("listitem", { name: title });

describe("SessionsManager: what is shown", () => {
  it("shows the totals and every session", () => {
    renderManager(listFixture([planned, done, cancelled]));

    expect(screen.getByLabelText("Totals")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Showing 3 of 3")).toBeInTheDocument();
  });

  it("offers a manager add, edit, cancel and numbers where they apply", () => {
    renderManager(listFixture([planned, done, cancelled]));

    expect(screen.getByRole("button", { name: "Add session" })).toBeInTheDocument();

    const plannedCard = within(cardOf(planned.title));
    expect(plannedCard.getByRole("button", { name: "Enter numbers" })).toBeInTheDocument();
    expect(plannedCard.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(plannedCard.getByRole("button", { name: "Cancel session" })).toBeInTheDocument();

    // A done session can still have its numbers corrected, but not its details.
    const doneCard = within(cardOf(done.title));
    expect(doneCard.getByRole("button", { name: "Enter numbers" })).toBeInTheDocument();
    expect(doneCard.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(doneCard.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();

    // A cancelled session has no actions at all.
    expect(within(cardOf(cancelled.title)).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets an officer see everything and enter numbers, but not add, edit or cancel", () => {
    renderManager(listFixture([planned, done]), { canManage: false });

    expect(screen.getByText(/Only a selection manager or a system admin can add or change sessions/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Enter numbers" })).toHaveLength(2);
  });

  it("locks the details of a closed campaign but leaves the numbers open", () => {
    renderManager(listFixture([planned], { campaignStatus: "Closed", isEditable: false }));

    expect(screen.getByText(/This campaign is closed, so sessions can no longer be added or changed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter numbers" })).toBeInTheDocument();
  });
});

describe("SessionsManager: no sessions yet", () => {
  it("invites a manager to add the first one, and the button opens the form", async () => {
    const { user } = renderManager(listFixture([]));

    expect(screen.getByRole("heading", { name: "No information sessions yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(screen.getByRole("dialog", { name: "Add information session" })).toBeInTheDocument();
  });

  it("only says nothing is planned yet to an officer, with nothing to click", () => {
    renderManager(listFixture([]), { canManage: false });

    expect(screen.getByText("No sessions have been planned for this campaign yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add session" })).not.toBeInTheDocument();
  });
});

describe("SessionsManager: dialogs", () => {
  it("opens the form for a new session", async () => {
    const { user } = renderManager(listFixture([planned]));

    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(screen.getByRole("dialog", { name: "Add information session" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("opens the form for the session whose Edit was pressed, filled in", async () => {
    const { user } = renderManager(listFixture([planned, withAlumnus]));

    await user.click(within(cardOf(withAlumnus.title)).getByRole("button", { name: "Edit" }));

    const dialog = within(screen.getByRole("dialog", { name: "Edit information session" }));
    expect(dialog.getByLabelText("Title")).toHaveValue("Alumni talk");
    expect(dialog.getByLabelText("Run by")).toHaveValue("Alumni");
  });

  it("opens the cancel dialog for that session", async () => {
    const { user } = renderManager(listFixture([planned]));

    await user.click(screen.getByRole("button", { name: "Cancel session" }));

    const dialog = screen.getByRole("dialog", { name: "Cancel this session?" });
    expect(within(dialog).getByText(/Open day at Kampong Cham High School will be marked as cancelled/)).toBeInTheDocument();
  });

  it("opens the numbers dialog for that session", async () => {
    const { user } = renderManager(listFixture([planned, done]));

    await user.click(within(cardOf(done.title)).getByRole("button", { name: "Enter numbers" }));

    const dialog = screen.getByRole("dialog", { name: "Enter numbers" });
    expect(within(dialog).getByLabelText("Females")).toHaveValue("18");
  });

  it("opens the numbers dialog for an officer too", async () => {
    const { user } = renderManager(listFixture([planned]), { canManage: false });

    await user.click(screen.getByRole("button", { name: "Enter numbers" }));

    expect(screen.getByRole("dialog", { name: "Enter numbers" })).toBeInTheDocument();
  });

  it("closes a dialog whose session is gone after the page refreshes", async () => {
    const { user, rerender } = renderManager(listFixture([planned, withAlumnus]));
    await user.click(within(cardOf(withAlumnus.title)).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit information session" })).toBeInTheDocument();

    rerender(listFixture([planned]));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("SessionsManager: filters", () => {
  const all = () => listFixture([planned, done, cancelled, withAlumnus]);

  it("filters by status", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Status"), "Done");

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem", { name: done.title })).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 4")).toBeInTheDocument();
  });

  it("filters by who runs it", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-labelledby"))).toEqual([`session-${withAlumnus.id}`]);
  });

  it("filters by who is responsible, listing each person once, by name", async () => {
    const { user } = renderManager(all());

    const options = within(screen.getByLabelText("Responsible")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All", "Sokha Officer", "Vanna Officer"]);

    await user.selectOptions(screen.getByLabelText("Responsible"), "officer-2");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem", { name: "Alumni talk" })).toBeInTheDocument();
  });

  it("combines filters, says when nothing matches, and clears them", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Status"), "Done");
    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText("No sessions match these filters")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("does not hide the totals when filtering: they are the campaign's", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Status"), "Cancelled");

    expect(within(screen.getByLabelText("Totals")).getByText("Sessions").nextElementSibling).toHaveTextContent("3");
  });
});
