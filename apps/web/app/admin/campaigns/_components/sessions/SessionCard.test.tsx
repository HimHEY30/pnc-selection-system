import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALUMNUS, PARTNER, cancelledSession, doneSession, sessionFixture, summaryOf } from "@/test-utils/session-fixtures";
import type { InformationSession } from "@/lib/sessions/types";
import SessionCard from "./SessionCard";
import SummaryCards from "./SummaryCards";

function renderCard(session: InformationSession, props: Partial<Parameters<typeof SessionCard>[0]> = {}) {
  const handlers = { onEdit: vi.fn(), onCancel: vi.fn(), onNumbers: vi.fn() };
  const user = userEvent.setup();
  render(
    <ul>
      <SessionCard session={session} canChange canEnterNumbers {...handlers} {...props} />
    </ul>,
  );
  return { user, ...handlers };
}

describe("SessionCard", () => {
  it("shows the title, when, the format and the status", () => {
    renderCard(sessionFixture());

    const card = screen.getByRole("listitem", { name: "Open day at Kampong Cham High School" });
    expect(within(card).getByText(/Fri, 20 Mar 2099 · 09:00 – 11:00 · In person/)).toBeInTheDocument();
    expect(within(card).getByText("Planned")).toBeInTheDocument();
  });

  it("shows who is responsible and who runs it, with the host's type", () => {
    renderCard(
      sessionFixture({
        assignee: { id: "officer-2", name: "Vanna Officer" },
        host: { type: "Partner", name: "Hope School", userId: null, hostId: PARTNER.id, partnerKind: "HighSchool", phone: "012 999 888", email: "info@hope.example.org", isActive: true },
      }),
    );

    expect(screen.getByText("Vanna Officer")).toBeInTheDocument();
    expect(screen.getByText("Hope School")).toBeInTheDocument();
    expect(screen.getByText(/Partner \(High school\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "012 999 888" })).toHaveAttribute("href", "tel:012999888");
    expect(screen.getByRole("link", { name: "info@hope.example.org" })).toHaveAttribute("href", "mailto:info@hope.example.org");
  });

  it("shows an alumnus with their phone", () => {
    renderCard(
      sessionFixture({
        host: { type: "Alumni", name: ALUMNUS.name, userId: null, hostId: ALUMNUS.id, partnerKind: null, phone: "+855 12 345 678", email: null, isActive: true },
      }),
    );

    expect(screen.getByText(/Alumnus/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+855 12 345 678" })).toHaveAttribute("href", "tel:+85512345678");
  });

  it("marks a host that was switched off after the session was planned", () => {
    renderCard(sessionFixture({ host: { ...PARTNER, type: "Partner", userId: null, hostId: PARTNER.id, partnerKind: "HighSchool", phone: null, email: null, isActive: false } }));

    expect(screen.getByText("Switched off")).toBeInTheDocument();
  });

  it("shows the venue for an in-person session and a safe link for an online one", () => {
    const { unmount } = render(
      <ul>
        <SessionCard session={sessionFixture()} canChange={false} canEnterNumbers={false} />
      </ul>,
    );
    expect(screen.getByText("School hall")).toBeInTheDocument();
    expect(screen.queryByText("Link")).not.toBeInTheDocument();
    unmount();

    renderCard(sessionFixture({ format: "Online", venue: null, meetingLink: "https://meet.example.org/room" }));
    const link = screen.getByRole("link", { name: "https://meet.example.org/room" });
    expect(link).toHaveAttribute("href", "https://meet.example.org/room");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText("Venue")).not.toBeInTheDocument();
  });

  it("shows the province and the notes when it has them", () => {
    renderCard(sessionFixture({ province: { id: 17, name: "Siem Reap" }, notes: "Ask for Mr Rith" }));

    expect(screen.getByText("Siem Reap")).toBeInTheDocument();
    expect(screen.getByText("Ask for Mr Rith")).toBeInTheDocument();
  });

  it("says the numbers are not set or not recorded yet", () => {
    renderCard(sessionFixture());

    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });

  it("shows the expected number, and the attendance with its total, females and males", () => {
    renderCard(doneSession());

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("40")).toBeInTheDocument();
    expect(within(card).getByText("30")).toBeInTheDocument();
    expect(within(card).getByText("(18 female · 12 male)")).toBeInTheDocument();
    expect(within(card).getByText("Done")).toBeInTheDocument();
  });

  it("shows 0 as a number, not as missing", () => {
    renderCard(doneSession({ expectedCandidates: 0, attendance: { female: 0, male: 0, total: 0, recordedAt: "2000-03-01T10:00:00Z", recordedByName: "Sokha Officer" } }));

    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
    expect(screen.getByText("(0 female · 0 male)")).toBeInTheDocument();
  });

  it("shows a cancelled session with its reason", () => {
    renderCard(cancelledSession(), { canChange: false, canEnterNumbers: false });

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Cancelled: Heavy rain")).toBeInTheDocument();
  });

  it("names the campaign, as a link to its sessions, when sessions of several campaigns are listed", () => {
    renderCard(sessionFixture(), { campaign: { id: "c-1", name: "Selection 2027" } });

    expect(screen.getByRole("link", { name: "Selection 2027" })).toHaveAttribute("href", "/admin/campaigns/c-1/sessions");
  });

  describe("actions", () => {
    it("offers the numbers, edit and cancel, and calls back with the session", async () => {
      const session = sessionFixture();
      const { user, onEdit, onCancel, onNumbers } = renderCard(session);

      const group = screen.getByRole("group", { name: "Actions for Open day at Kampong Cham High School" });
      await user.click(within(group).getByRole("button", { name: "Enter numbers" }));
      await user.click(within(group).getByRole("button", { name: "Edit" }));
      await user.click(within(group).getByRole("button", { name: "Cancel session" }));

      expect(onNumbers).toHaveBeenCalledWith(session);
      expect(onEdit).toHaveBeenCalledWith(session);
      expect(onCancel).toHaveBeenCalledWith(session);
    });

    it("offers only the numbers to someone who may not change sessions", () => {
      renderCard(sessionFixture(), { canChange: false });

      expect(screen.getByRole("button", { name: "Enter numbers" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    });

    it("offers nothing when there is nothing to do", () => {
      renderCard(cancelledSession(), { canChange: false, canEnterNumbers: false });

      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});

describe("SummaryCards", () => {
  it("shows the sessions, the expected candidates and who came, with females and males", () => {
    render(<SummaryCards summary={summaryOf([doneSession(), sessionFixture({ expectedCandidates: 25 }), cancelledSession()])} />);

    const totals = screen.getByLabelText("Totals");
    expect(within(totals).getByText("Sessions").nextElementSibling).toHaveTextContent("2");
    expect(within(totals).getByText("1 planned · 1 done · 1 cancelled")).toBeInTheDocument();
    expect(within(totals).getByText("Expected candidates").nextElementSibling).toHaveTextContent("65");
    expect(within(totals).getByText("Attended").nextElementSibling).toHaveTextContent("30");
    expect(within(totals).getByText("18 female · 12 male")).toBeInTheDocument();
  });

  it("does not mention cancelled sessions when there are none", () => {
    render(<SummaryCards summary={summaryOf([sessionFixture()])} />);

    expect(screen.getByText("1 planned · 0 done")).toBeInTheDocument();
  });

  it("shows zeros for a campaign with no sessions", () => {
    render(<SummaryCards summary={summaryOf([])} />);

    expect(screen.getByText("0 planned · 0 done")).toBeInTheDocument();
    expect(screen.getByText("0 female · 0 male")).toBeInTheDocument();
  });
});
