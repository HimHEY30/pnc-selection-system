import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  HOSTS,
  assignableFixture,
  cancelledSession,
  listFixture,
  sessionFixture,
  unscheduledSession,
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

import { updateSessionAction } from "../../sessions-actions";
import SessionCard from "./SessionCard";
import SessionsManager from "./SessionsManager";

const TODAY = "2027-01-01";
const planned = sessionFixture();
const copy = unscheduledSession();

function renderManager(list: SessionList, canManage = true) {
  const user = userEvent.setup();
  render(
    <SessionsManager
      list={list}
      today={TODAY}
      hosts={canManage ? HOSTS : []}
      assignable={canManage ? assignableFixture() : null}
      canManage={canManage}
    />,
  );
  return { user };
}

const table = () => screen.getByRole("table", { name: "Information sessions" });
const rowOf = (title: string) => within(table()).getByRole("row", { name: new RegExp(title) });
const menuOf = (title: string) => within(rowOf(title)).getByRole("button", { name: `Actions for ${title}` });
const menuActions = () => screen.queryAllByRole("menuitem").map((item) => item.textContent);

describe("a session copied from another campaign: the card", () => {
  it("says it is not scheduled, and that nobody is responsible or runs it yet", () => {
    render(
      <ul>
        <SessionCard session={copy} canChange canEnterNumbers={false} onEdit={vi.fn()} onCancel={vi.fn()} onNumbers={vi.fn()} />
      </ul>,
    );

    const card = screen.getByRole("listitem", { name: copy.title });
    expect(within(card).getByText(/Not scheduled yet/)).toBeInTheDocument();
    expect(within(card).getByText("Not scheduled")).toBeInTheDocument(); // the status badge
    expect(within(card).getAllByText("Not chosen yet")).toHaveLength(2); // responsible and run by
    expect(within(card).queryByText(/Fri,|Sat,|2099/)).not.toBeInTheDocument();
  });

  it("offers Schedule in place of Edit, and Cancel, and no numbers", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <SessionCard session={copy} canChange canEnterNumbers={false} onEdit={onEdit} onCancel={vi.fn()} onNumbers={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter numbers" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel session" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(onEdit).toHaveBeenCalledWith(copy);
  });
});

describe("a session copied from another campaign: the page", () => {
  const list = () => listFixture([planned, copy, unscheduledSession({ id: "second", title: "Another copy" })]);

  it("lists copies in the table after the dated sessions, with Not scheduled in place of a date", () => {
    renderManager(list());

    const titles = within(table()).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].querySelector("span")?.textContent);
    expect(titles).toEqual([planned.title, "Another copy", copy.title]);
    expect(within(rowOf(copy.title)).getAllByText("Not scheduled").length).toBeGreaterThan(0);
  });

  it("keeps copies out of Coming up, and counts them in the totals", () => {
    renderManager(list());

    const cards = within(screen.getByRole("list", { name: "Coming up" })).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(screen.getByLabelText("Totals")).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Totals")).getByText(/2 not scheduled/)).toBeInTheDocument();
  });

  it("filters by Not scheduled", async () => {
    const { user } = renderManager(list());

    await user.selectOptions(screen.getByLabelText("Status"), "Unscheduled");

    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 2);
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
  });

  it("offers a manager Schedule and Cancel on a copy, and no numbers", async () => {
    const { user } = renderManager(list());

    await user.click(menuOf(copy.title));

    expect(menuActions()).toEqual(["Schedule", "Cancel session"]);
  });

  it("gives an officer nothing to do with a copy", () => {
    renderManager(list(), false);

    expect(within(rowOf(copy.title)).queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not offer anything on a copy that was cancelled before it was scheduled", () => {
    renderManager(listFixture([cancelledSession({ date: null, startTime: null, endTime: null, assignee: null, host: null })]));

    const row = rowOf(cancelledSession().title);
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(within(row).getByText("Not scheduled")).toBeInTheDocument();
  });
});

describe("scheduling a copy", () => {
  it("opens the form as Schedule, with the title, venue and notes kept and the date empty", async () => {
    const { user } = renderManager(listFixture([unscheduledSession({ venue: "School hall", notes: "Bring posters" })]));

    await user.click(menuOf(copy.title));
    await user.click(screen.getByRole("menuitem", { name: "Schedule" }));

    const dialog = within(screen.getByRole("dialog", { name: "Schedule information session" }));
    expect(dialog.getByLabelText("Title")).toHaveValue(copy.title);
    expect(dialog.getByLabelText("Venue")).toHaveValue("School hall");
    expect(dialog.getByLabelText(/Notes/)).toHaveValue("Bring posters");
    expect(dialog.getByLabelText("Date")).toHaveValue("");
    expect(dialog.getByRole("button", { name: "Schedule session" })).toBeInTheDocument();
  });

  it("will not send until the date is filled in, then sends the whole form", async () => {
    vi.mocked(updateSessionAction).mockResolvedValue({ ok: true, data: undefined } as never);
    const { user } = renderManager(listFixture([unscheduledSession({ venue: "School hall" })]));
    await user.click(menuOf(copy.title));
    await user.click(screen.getByRole("menuitem", { name: "Schedule" }));
    const dialog = within(screen.getByRole("dialog", { name: "Schedule information session" }));

    await user.click(dialog.getByRole("button", { name: "Schedule session" }));
    expect(updateSessionAction).not.toHaveBeenCalled();
    expect(dialog.getByText("Choose the date.")).toBeInTheDocument();

    await user.type(dialog.getByLabelText("Date"), "2028-03-18");
    await user.click(dialog.getByRole("button", { name: "Schedule session" }));

    expect(updateSessionAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateSessionAction).mock.calls[0][2]).toMatchObject({
      title: copy.title,
      date: "2028-03-18",
      startTime: "09:00",
      endTime: "11:00",
      // As for a new session, the person scheduling it is the default for both; they can pick someone else.
      assigneeId: "manager-1",
      hostType: "Officer",
      hostUserId: "manager-1",
    });
  });
});
