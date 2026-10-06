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
import type { InformationSession, SessionList } from "@/lib/sessions/types";

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

const TODAY = "2027-01-01";

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
      today={TODAY}
      hosts={canManage ? HOSTS : []}
      assignable={canManage && options.assignable !== false ? assignableFixture() : null}
      canManage={canManage}
    />,
  );
  const rerender = (next: SessionList) =>
    view.rerender(<SessionsManager list={next} today={TODAY} hosts={HOSTS} assignable={assignableFixture()} canManage={canManage} />);
  return { user, rerender };
}

const table = () => screen.getByRole("table", { name: "Information sessions" });
const rowOf = (title: string) => within(table()).getByRole("row", { name: new RegExp(title) });
/** The three-dots button of a row, and the actions in its menu once it is open. */
const menuButtonOf = (title: string) => within(rowOf(title)).queryByRole("button", { name: `Actions for ${title}` });
const menuActions = () => screen.queryAllByRole("menuitem").map((item) => item.textContent);
async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(menuButtonOf(title)!);
}
const tableTitles = () =>
  within(table())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1].querySelector("span")?.textContent);
const upcomingList = () => screen.queryByRole("list", { name: "Coming up" });
const cardOf = (title: string) => within(screen.getByRole("list", { name: "Coming up" })).getByRole("listitem", { name: title });

/** `count` planned sessions, one a day from 2099-01-01, titled "Session 01", "Session 02" … */
function manySessions(count: number): InformationSession[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return sessionFixture({ id: `id-${n}`, title: `Session ${n}`, date: `2099-01-${n}` });
  });
}

describe("SessionsManager: what is shown", () => {
  it("shows the totals and every session in the table", () => {
    renderManager(listFixture([planned, done, cancelled]));

    expect(screen.getByLabelText("Totals")).toBeInTheDocument();
    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 3);
    expect(screen.getByText("Showing 3 of 3")).toBeInTheDocument();
  });

  it("offers a manager add, edit, cancel and numbers where they apply, in each row's menu", async () => {
    const { user } = renderManager(listFixture([planned, done, cancelled]));

    expect(screen.getByRole("button", { name: "Add session" })).toBeInTheDocument();
    // The actions stay out of sight until a row's three dots are pressed.
    expect(menuActions()).toEqual([]);

    await openMenu(user, planned.title);
    expect(menuActions()).toEqual(["Enter numbers", "Edit", "Cancel session"]);
    await user.keyboard("{Escape}");

    // A done session can still have its numbers corrected, but not its details.
    await openMenu(user, done.title);
    expect(menuActions()).toEqual(["Enter numbers"]);
    await user.keyboard("{Escape}");

    // A cancelled session has no actions, so no menu button either.
    expect(menuButtonOf(cancelled.title)).not.toBeInTheDocument();
  });

  it("lets an officer see everything and enter numbers, but not add, edit or cancel", async () => {
    const { user } = renderManager(listFixture([planned, done]), { canManage: false });

    expect(screen.getByText(/Only a selection manager or a system admin can add or change sessions/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add session" })).not.toBeInTheDocument();

    await openMenu(user, planned.title);
    expect(menuActions()).toEqual(["Enter numbers"]);
  });

  it("locks the details of a closed campaign but leaves the numbers open", async () => {
    const { user } = renderManager(listFixture([planned], { campaignStatus: "Closed", isEditable: false }));

    expect(screen.getByText(/This campaign is closed, so sessions can no longer be added or changed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add session" })).not.toBeInTheDocument();

    await openMenu(user, planned.title);
    expect(menuActions()).toEqual(["Enter numbers"]);
  });

  it("closes the menu on Escape, on an outside click and after an action is chosen", async () => {
    const { user } = renderManager(listFixture([planned]));
    const trigger = () => menuButtonOf(planned.title)!;

    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger());
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit information session" })).toBeInTheDocument();
  });
});

describe("SessionsManager: coming up", () => {
  it("shows the next three planned sessions as cards, soonest first", () => {
    const sessions = manySessions(5);
    renderManager(listFixture([...sessions].reverse()));

    const cards = within(screen.getByRole("list", { name: "Coming up" })).getAllByRole("listitem");
    expect(cards.map((li) => within(li).getByRole("heading").textContent)).toEqual(["Session 01", "Session 02", "Session 03"]);
    expect(screen.getByText("2 more in the table below")).toBeInTheDocument();
  });

  it("leaves out sessions that are done, cancelled or already past", () => {
    renderManager(listFixture([done, cancelled, sessionFixture({ id: "past", title: "Planned but past", date: "2026-12-31" }), planned]));

    const cards = within(screen.getByRole("list", { name: "Coming up" })).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(cardOf(planned.title)).toBeInTheDocument();
    expect(screen.queryByText(/more in the table below/)).not.toBeInTheDocument();
  });

  it("says so when nothing is coming up, and still lists everything in the table", () => {
    renderManager(listFixture([done, cancelled]));

    expect(upcomingList()).not.toBeInTheDocument();
    expect(screen.getByText("No planned sessions from today on.")).toBeInTheDocument();
    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 2);
  });

  it("does not follow the filters: it is what is next for the campaign", async () => {
    const { user } = renderManager(listFixture([planned, done]));

    await user.selectOptions(screen.getByLabelText("Status"), "Done");

    expect(cardOf(planned.title)).toBeInTheDocument();
  });

  it("opens the same dialogs from a card", async () => {
    const { user } = renderManager(listFixture([planned]));

    await user.click(within(cardOf(planned.title)).getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Edit information session" })).toBeInTheDocument();
  });
});

describe("SessionsManager: the table of a long list", () => {
  it("shows ten sessions at a time and moves between pages", async () => {
    const { user } = renderManager(listFixture(manySessions(25)));

    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 10);
    expect(screen.getByText("1–10 of 25")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("11–20 of 25")).toBeInTheDocument();
    expect(tableTitles()[0]).toBe("Session 11");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("21–25 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("lists the earliest first, and the latest first when the date heading is pressed", async () => {
    const { user } = renderManager(listFixture(manySessions(12)));
    expect(tableTitles()[0]).toBe("Session 01");

    await user.click(screen.getByRole("button", { name: /^Date/ }));

    expect(tableTitles()[0]).toBe("Session 12");
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("searches the title, venue, host and person responsible, and goes back to the first page", async () => {
    const sessions = [...manySessions(25), withAlumnus];
    const { user } = renderManager(listFixture(sessions));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "alumni talk");

    expect(tableTitles()).toEqual(["Alumni talk"]);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 26")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "vanna");
    expect(tableTitles()).toEqual(["Alumni talk"]);
  });

  it("goes back to the first page when a filter narrows the list", async () => {
    const { user } = renderManager(listFixture([...manySessions(25), done]));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.selectOptions(screen.getByLabelText("Status"), "Done");

    expect(tableTitles()).toEqual([done.title]);
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
  });

  it("shows a message instead of an empty table when the search matches nothing", async () => {
    const { user } = renderManager(listFixture([planned]));

    await user.type(screen.getByLabelText("Search"), "nothing like this");

    expect(screen.getByText("No sessions match these filters")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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

    await openMenu(user, withAlumnus.title);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const dialog = within(screen.getByRole("dialog", { name: "Edit information session" }));
    expect(dialog.getByLabelText("Title")).toHaveValue("Alumni talk");
    expect(dialog.getByLabelText("Run by")).toHaveValue("Alumni");
  });

  it("opens the cancel dialog for that session", async () => {
    const { user } = renderManager(listFixture([planned]));

    await openMenu(user, planned.title);
    await user.click(screen.getByRole("menuitem", { name: "Cancel session" }));

    const dialog = screen.getByRole("dialog", { name: "Cancel this session?" });
    expect(within(dialog).getByText(/Open day at Kampong Cham High School will be marked as cancelled/)).toBeInTheDocument();
  });

  it("opens the numbers dialog for that session", async () => {
    const { user } = renderManager(listFixture([planned, done]));

    await openMenu(user, done.title);
    await user.click(screen.getByRole("menuitem", { name: "Enter numbers" }));

    const dialog = screen.getByRole("dialog", { name: "Enter numbers" });
    expect(within(dialog).getByLabelText("Females")).toHaveValue("18");
  });

  it("opens the numbers dialog for an officer too", async () => {
    const { user } = renderManager(listFixture([planned]), { canManage: false });

    await openMenu(user, planned.title);
    await user.click(screen.getByRole("menuitem", { name: "Enter numbers" }));

    expect(screen.getByRole("dialog", { name: "Enter numbers" })).toBeInTheDocument();
  });

  it("closes a dialog whose session is gone after the page refreshes", async () => {
    const { user, rerender } = renderManager(listFixture([planned, withAlumnus]));
    await openMenu(user, withAlumnus.title);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
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

    expect(tableTitles()).toEqual([done.title]);
    expect(screen.getByText("Showing 1 of 4")).toBeInTheDocument();
  });

  it("filters by who runs it", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    expect(tableTitles()).toEqual([withAlumnus.title]);
  });

  it("filters by who is responsible, listing each person once, by name", async () => {
    const { user } = renderManager(all());

    const options = within(screen.getByLabelText("Responsible")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All", "Sokha Officer", "Vanna Officer"]);

    await user.selectOptions(screen.getByLabelText("Responsible"), "officer-2");
    expect(tableTitles()).toEqual(["Alumni talk"]);
  });

  it("combines filters, says when nothing matches, and clears them", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Status"), "Done");
    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No sessions match these filters")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 4);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("clears the search along with the filters", async () => {
    const { user } = renderManager(all());

    await user.type(screen.getByLabelText("Search"), "alumni");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 4);
  });

  it("does not hide the totals when filtering: they are the campaign's", async () => {
    const { user } = renderManager(all());

    await user.selectOptions(screen.getByLabelText("Status"), "Cancelled");

    expect(within(screen.getByLabelText("Totals")).getByText("Sessions").nextElementSibling).toHaveTextContent("3");
  });
});

describe("SessionsManager: needs attention", () => {
  it("names what needs doing, with the sessions it is about", () => {
    // `planned` is ahead with no expected number; `withAlumnus` too.
    renderManager(listFixture([planned, withAlumnus]));

    const panel = screen.getByRole("region", { name: "Needs attention" });
    expect(within(panel).getByText("2 coming sessions have no expected number")).toBeInTheDocument();
    expect(within(panel).getByText(`${planned.title}, ${withAlumnus.title}`)).toBeInTheDocument();
  });

  it("says nothing needs doing when the sessions are in order", () => {
    renderManager(listFixture([done, cancelled]));

    expect(screen.queryByRole("region", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.getByText("Everything is in order. Nothing needs doing right now.")).toBeInTheDocument();
  });
});

describe("SessionsManager: feedback and small screens", () => {
  it("confirms a cancelled session, and the notice can be dismissed", async () => {
    const actions = await import("../../sessions-actions");
    vi.mocked(actions.cancelSessionAction).mockResolvedValue({ ok: true, data: cancelled });
    const { user } = renderManager(listFixture([planned]));

    await openMenu(user, planned.title);
    await user.click(screen.getByRole("menuitem", { name: "Cancel session" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this session?" });
    await user.type(within(dialog).getByLabelText("Reason"), "Venue closed");
    await user.click(within(dialog).getByRole("button", { name: "Cancel session" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Session cancelled.");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Session cancelled.")).not.toBeInTheDocument();
  });

  it("does not confirm anything when the server refuses", async () => {
    const actions = await import("../../sessions-actions");
    vi.mocked(actions.cancelSessionAction).mockResolvedValue({ ok: false, message: "Not allowed." });
    const { user } = renderManager(listFixture([planned]));

    await openMenu(user, planned.title);
    await user.click(screen.getByRole("menuitem", { name: "Cancel session" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this session?" });
    await user.type(within(dialog).getByLabelText("Reason"), "Venue closed");
    await user.click(within(dialog).getByRole("button", { name: "Cancel session" }));

    expect(await within(dialog).findByText("Not allowed.")).toBeInTheDocument();
    expect(screen.queryByText("Session cancelled.")).not.toBeInTheDocument();
  });

  it("counts the filters in use on the button that shows them on a phone", async () => {
    const { user } = renderManager(listFixture([planned, done]));
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.selectOptions(screen.getByLabelText("Status"), "Done");

    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("offers a way back to every session when the filters match nothing", async () => {
    const { user } = renderManager(listFixture([planned]));
    await user.selectOptions(screen.getByLabelText("Status"), "Cancelled");

    await user.click(screen.getByRole("button", { name: "Show all sessions" }));

    expect(screen.getByText("Showing 1 of 1")).toBeInTheDocument();
  });

  it("sorts from the button shown on a phone as well as from the date heading", async () => {
    const { user } = renderManager(listFixture(manySessions(12)));

    await user.click(screen.getByRole("button", { name: "Sort by date, earliest first" }));

    expect(tableTitles()[0]).toBe("Session 12");
    expect(screen.getByRole("button", { name: "Sort by date, latest first" })).toBeInTheDocument();
  });
});
