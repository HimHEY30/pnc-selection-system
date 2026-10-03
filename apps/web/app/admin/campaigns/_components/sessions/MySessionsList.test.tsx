import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { cancelledSession, doneSession, mySession, sessionFixture } from "@/test-utils/session-fixtures";

vi.mock("../../sessions-actions", () => ({
  setExpectedAction: vi.fn(),
  recordAttendanceAction: vi.fn(),
}));

import MySessionsList from "./MySessionsList";

const TODAY = "2027-03-10";

const soon = sessionFixture({ id: "a1", title: "Soon", date: "2027-03-10" });
const later = sessionFixture({ id: "a2", title: "Later", date: "2027-06-01" });
const missed = sessionFixture({ id: "a3", title: "Missed, never recorded", date: "2027-03-01" });
const recent = doneSession({ id: "a4", title: "Recent visit", date: "2027-03-05" });
const old = doneSession({ id: "a5", title: "Old visit", date: "2026-11-01" });
const called = cancelledSession({ id: "a6", title: "Called off", date: "2027-05-01" });

describe("MySessionsList", () => {
  it("says so, kindly, when nothing is assigned", () => {
    render(<MySessionsList sessions={[]} today={TODAY} />);

    expect(screen.getByRole("heading", { name: "Nothing assigned to you yet" })).toBeInTheDocument();
    expect(screen.getByText(/When a manager makes you responsible for a session/)).toBeInTheDocument();
  });

  it("lists planned sessions from today on as upcoming, and everything else as earlier", () => {
    render(<MySessionsList sessions={[soon, later, missed, recent, old, called].map((s) => mySession(s))} today={TODAY} />);

    const upcoming = within(screen.getByRole("list", { name: "Upcoming" }));
    expect(upcoming.getAllByRole("listitem").map((li) => li.getAttribute("aria-labelledby"))).toEqual(["session-a1", "session-a2"]);

    const earlier = within(screen.getByRole("list", { name: "Earlier" }));
    // Most recent first. A cancelled session in the future is not "upcoming": it is not going to happen.
    expect(earlier.getAllByRole("listitem").map((li) => li.getAttribute("aria-labelledby"))).toEqual([
      "session-a6",
      "session-a4",
      "session-a3",
      "session-a5",
    ]);
  });

  it("leaves out a group that has nothing in it", () => {
    render(<MySessionsList sessions={[mySession(soon)]} today={TODAY} />);

    expect(screen.getByRole("list", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Earlier" })).not.toBeInTheDocument();
  });

  it("names each session's campaign as a link to that campaign's sessions", () => {
    render(<MySessionsList sessions={[mySession(soon, "Selection 2027")]} today={TODAY} />);

    expect(screen.getByRole("link", { name: "Selection 2027" })).toHaveAttribute("href", `/admin/campaigns/${soon.campaignId}/sessions`);
  });

  it("offers the numbers on a session that is not cancelled, and never edit or cancel", () => {
    render(<MySessionsList sessions={[mySession(soon), mySession(called)]} today={TODAY} />);

    const soonCard = within(screen.getByRole("listitem", { name: "Soon" }));
    expect(soonCard.getByRole("button", { name: "Enter numbers" })).toBeInTheDocument();
    expect(soonCard.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(soonCard.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Called off" })).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the numbers dialog for the session whose button was pressed", async () => {
    const user = userEvent.setup();
    render(<MySessionsList sessions={[mySession(missed), mySession(recent)]} today={TODAY} />);

    await user.click(within(screen.getByRole("listitem", { name: "Recent visit" })).getByRole("button", { name: "Enter numbers" }));

    const dialog = screen.getByRole("dialog", { name: "Enter numbers" });
    expect(within(dialog).getByText(/Recent visit: how many candidates are expected/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Females")).toHaveValue("18");
  });
});
