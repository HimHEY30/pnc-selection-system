import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALUMNUS, CAMPAIGN_ID, HOSTS, PARTNER, assignableFixture, sessionFixture } from "@/test-utils/session-fixtures";
import type { AssignableStaff, Host } from "@/lib/sessions/types";

const createSession = vi.fn();
const updateSession = vi.fn();
const createHost = vi.fn();
vi.mock("../../sessions-actions", () => ({
  createSessionAction: (...args: unknown[]) => createSession(...args),
  updateSessionAction: (...args: unknown[]) => updateSession(...args),
  createHostAction: (...args: unknown[]) => createHost(...args),
  updateHostAction: vi.fn(),
}));

import SessionFormDialog, { type SessionDialogTarget } from "./SessionFormDialog";

beforeEach(() => {
  createSession.mockReset();
  updateSession.mockReset();
  createHost.mockReset();
});

const PROVINCES = [
  { id: 2, name: "Battambang" },
  { id: 17, name: "Siem Reap" },
];

function renderDialog(
  target: SessionDialogTarget | null = { kind: "create" },
  options: { hosts?: Host[]; assignable?: AssignableStaff } = {},
) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <SessionFormDialog
      target={target}
      campaignId={CAMPAIGN_ID}
      targetProvinces={PROVINCES}
      hosts={options.hosts ?? HOSTS}
      assignable={options.assignable ?? assignableFixture()}
      onClose={onClose}
    />,
  );
  return { user, onClose };
}

/** Fills in the three boxes a new session needs besides its defaults. */
async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), "Open day at Kampong Cham High School");
  await user.type(screen.getByLabelText("Date"), "2027-03-20");
  await user.type(screen.getByLabelText("Venue"), "School hall");
}

describe("SessionFormDialog: opening", () => {
  it("is closed when there is nothing to do", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a new session with sensible defaults: in person, 09:00 to 11:00, me responsible and running it", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Add information session" })).toBeInTheDocument();
    expect(screen.getByLabelText("Format")).toHaveValue("InPerson");
    expect(screen.getByLabelText("Starts")).toHaveValue("09:00");
    expect(screen.getByLabelText("Ends")).toHaveValue("11:00");
    expect(screen.getByLabelText("Responsible")).toHaveValue("manager-1");
    expect(screen.getByLabelText("Run by")).toHaveValue("Officer");
    expect(screen.getByLabelText("Officer")).toHaveValue("manager-1");
  });

  it("lists me first, then the staff with their roles", () => {
    renderDialog();

    const options = within(screen.getByLabelText("Responsible")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Dara Manager (me)", "Sokha Officer (Officer)", "Vanna Officer (Officer)", "Admin Demo (Admin)"]);
  });

  it("offers only the caller when the staff list could not be loaded, and says why", () => {
    renderDialog({ kind: "create" }, { assignable: assignableFixture({ staff: [], directoryAvailable: false }) });

    expect(within(screen.getByLabelText("Responsible")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Dara Manager (me)"]);
    expect(screen.getByRole("status")).toHaveTextContent("The staff list could not be loaded");
  });

  it("offers the campaign's target provinces, and none", () => {
    renderDialog();

    expect(within(screen.getByLabelText(/Province/)).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Not tied to a province",
      "Battambang",
      "Siem Reap",
    ]);
  });
});

describe("SessionFormDialog: the format decides what is asked", () => {
  it("asks for a venue in person, a link online, and both for hybrid", async () => {
    const { user } = renderDialog();
    expect(screen.getByLabelText("Venue")).toBeInTheDocument();
    expect(screen.queryByLabelText("Meeting link")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Format"), "Online");
    expect(screen.queryByLabelText("Venue")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Meeting link")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Format"), "Hybrid");
    expect(screen.getByLabelText("Venue")).toBeInTheDocument();
    expect(screen.getByLabelText("Meeting link")).toBeInTheDocument();
  });
});

describe("SessionFormDialog: saving a new session", () => {
  it("sends the form as the backend takes it, and closes", async () => {
    createSession.mockResolvedValue({ ok: true, data: sessionFixture() });
    const { user, onClose } = renderDialog();

    await fillBasics(user);
    await user.selectOptions(screen.getByLabelText(/Province/), "17");
    await user.type(screen.getByLabelText(/Notes/), "Bring posters");
    await user.selectOptions(screen.getByLabelText("Responsible"), "officer-2");
    await user.click(screen.getByRole("button", { name: "Add session" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createSession).toHaveBeenCalledWith(CAMPAIGN_ID, {
      title: "Open day at Kampong Cham High School",
      date: "2027-03-20",
      startTime: "09:00",
      endTime: "11:00",
      format: "InPerson",
      venue: "School hall",
      meetingLink: null,
      provinceId: 17,
      notes: "Bring posters",
      assigneeId: "officer-2",
      hostType: "Officer",
      hostId: null,
      hostUserId: "manager-1",
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("sends an online session without a venue", async () => {
    createSession.mockResolvedValue({ ok: true, data: sessionFixture() });
    const { user } = renderDialog();

    await user.type(screen.getByLabelText("Title"), "Online info session");
    await user.type(screen.getByLabelText("Date"), "2027-03-21");
    await user.selectOptions(screen.getByLabelText("Format"), "Online");
    await user.type(screen.getByLabelText("Meeting link"), "https://meet.example.org/room");
    await user.click(screen.getByRole("button", { name: "Add session" }));

    await waitFor(() => expect(createSession).toHaveBeenCalled());
    expect(createSession.mock.calls[0][1]).toMatchObject({ format: "Online", venue: null, meetingLink: "https://meet.example.org/room" });
  });

  it("marks everything that is missing, focuses the first, and sends nothing", async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription("Enter a title.");
    expect(screen.getByLabelText("Date")).toHaveAccessibleDescription("Choose the date.");
    expect(screen.getByLabelText("Venue")).toHaveAccessibleDescription("Enter where the session takes place.");
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("marks an end time that is not after the start", async () => {
    const { user } = renderDialog();
    await fillBasics(user);

    await user.clear(screen.getByLabelText("Ends"));
    await user.type(screen.getByLabelText("Ends"), "08:00");
    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(screen.getByLabelText("Ends")).toHaveAccessibleDescription("The end must be after the start.");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("puts the server's messages under the boxes they name and stays open", async () => {
    createSession.mockResolvedValue({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { date: "Choose the date.", assigneeId: "Choose a staff member from the list." },
    });
    const { user, onClose } = renderDialog();
    await fillBasics(user);

    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(await screen.findByText("Choose a staff member from the list.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a conflict that is not about one box, such as a host who is busy, as an alert", async () => {
    createSession.mockResolvedValue({ ok: false, message: "Sokha Officer already runs another session at that time." });
    const { user, onClose } = renderDialog();
    await fillBasics(user);

    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sokha Officer already runs another session at that time.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the buttons while it saves", async () => {
    let finish: (value: unknown) => void = () => {};
    createSession.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderDialog();
    await fillBasics(user);

    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish({ ok: true, data: sessionFixture() });
  });

  it("closes without saving when cancelled", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("SessionFormDialog: who runs it", () => {
  it("lets the officer who runs it be copied from the responsible person", async () => {
    const { user } = renderDialog();
    await user.selectOptions(screen.getByLabelText("Responsible"), "officer-2");
    expect(screen.getByRole("button", { name: "Same as responsible" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Same as responsible" }));

    expect(screen.getByLabelText("Officer")).toHaveValue("officer-2");
    expect(screen.getByRole("button", { name: "Same as responsible" })).toBeDisabled();
  });

  it("offers the alumni when an alumnus runs it, and only the active ones", async () => {
    const off: Host = { ...ALUMNUS, id: "33333333-4444-4555-8666-777777777777", name: "Zed Retired", isActive: false };
    const { user } = renderDialog({ kind: "create" }, { hosts: [...HOSTS, off] });

    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    expect(screen.queryByLabelText("Officer")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Choose alumnus")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Chenda Sok"]);
  });

  it("offers the partners when a partner runs it", async () => {
    const { user } = renderDialog();

    await user.selectOptions(screen.getByLabelText("Run by"), "Partner");

    expect(within(screen.getByLabelText("Choose partner")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Hope School"]);
  });

  it("sends a directory id and no user id for an alumnus", async () => {
    createSession.mockResolvedValue({ ok: true, data: sessionFixture() });
    const { user } = renderDialog();
    await fillBasics(user);

    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");
    await user.selectOptions(screen.getByLabelText("Choose alumnus"), ALUMNUS.id);
    await user.click(screen.getByRole("button", { name: "Add session" }));

    await waitFor(() => expect(createSession).toHaveBeenCalled());
    expect(createSession.mock.calls[0][1]).toMatchObject({ hostType: "Alumni", hostId: ALUMNUS.id, hostUserId: null });
  });

  it("needs a host to be chosen from the directory", async () => {
    const { user } = renderDialog();
    await fillBasics(user);

    await user.selectOptions(screen.getByLabelText("Run by"), "Partner");
    await user.click(screen.getByRole("button", { name: "Add session" }));

    expect(screen.getByLabelText("Choose partner")).toHaveAccessibleDescription("Choose the partner who runs the session.");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("forgets the chosen host when the kind of host changes", async () => {
    const { user } = renderDialog();
    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");
    await user.selectOptions(screen.getByLabelText("Choose alumnus"), ALUMNUS.id);

    await user.selectOptions(screen.getByLabelText("Run by"), "Partner");
    expect(screen.getByLabelText("Choose partner")).toHaveValue("");

    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");
    expect(screen.getByLabelText("Choose alumnus")).toHaveValue("");
  });

  it("says when the directory has no one of that kind, and offers to add one", async () => {
    const { user } = renderDialog({ kind: "create" }, { hosts: [PARTNER] });

    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    expect(within(screen.getByLabelText("Choose alumnus")).getByRole("option")).toHaveTextContent("No one in the list yet");
    expect(screen.getByRole("button", { name: "Add alumnus" })).toBeInTheDocument();
  });

  it("adds a new alumnus from the form and chooses them at once, before the page has re-read the directory", async () => {
    createHost.mockResolvedValue({ ok: true, data: ALUMNUS });
    const { user } = renderDialog({ kind: "create" }, { hosts: [PARTNER] });
    await user.selectOptions(screen.getByLabelText("Run by"), "Alumni");

    await user.click(screen.getByRole("button", { name: "Add alumnus" }));
    const dialog = screen.getByRole("dialog", { name: "Add alumnus" });
    await user.type(within(dialog).getByLabelText("Full name"), "Chenda Sok");
    await user.type(within(dialog).getByLabelText("Phone"), "012 345 678");
    await user.click(within(dialog).getByRole("button", { name: "Save host" }));

    await waitFor(() => expect(screen.getByLabelText("Choose alumnus")).toHaveValue(ALUMNUS.id));
    expect(within(screen.getByLabelText("Choose alumnus")).getAllByRole("option").map((o) => o.textContent)).toContain("Chenda Sok");
    expect(screen.getByRole("dialog", { name: "Add information session" })).toBeInTheDocument();
  });

  it("keeps the session form, and what was typed in it, when the host dialog closes", async () => {
    createHost.mockResolvedValue({ ok: true, data: PARTNER });
    const { user, onClose } = renderDialog({ kind: "create" }, { hosts: [ALUMNUS] });
    await fillBasics(user);
    await user.selectOptions(screen.getByLabelText("Run by"), "Partner");

    await user.click(screen.getByRole("button", { name: "Add partner" }));
    const dialog = screen.getByRole("dialog", { name: "Add partner" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // The host dialog's close must not be taken for the session form's own.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("Open day at Kampong Cham High School");
    expect(screen.getByLabelText("Venue")).toHaveValue("School hall");
  });
});

describe("SessionFormDialog: editing", () => {
  const existing = sessionFixture({
    title: "Visit to Hope School",
    date: "2099-05-02",
    startTime: "13:00",
    endTime: "15:00",
    province: { id: 17, name: "Siem Reap" },
    notes: "Ask for Mr Rith",
    assignee: { id: "officer-2", name: "Vanna Officer" },
    host: { type: "Partner", name: "Hope School", userId: null, hostId: PARTNER.id, partnerKind: "HighSchool", phone: null, email: null, isActive: true },
  });

  it("starts from what the session has", () => {
    renderDialog({ kind: "edit", session: existing });

    expect(screen.getByRole("dialog", { name: "Edit information session" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Visit to Hope School");
    expect(screen.getByLabelText("Date")).toHaveValue("2099-05-02");
    expect(screen.getByLabelText("Starts")).toHaveValue("13:00");
    expect(screen.getByLabelText(/Province/)).toHaveValue("17");
    expect(screen.getByLabelText(/Notes/)).toHaveValue("Ask for Mr Rith");
    expect(screen.getByLabelText("Responsible")).toHaveValue("officer-2");
    expect(screen.getByLabelText("Run by")).toHaveValue("Partner");
    expect(screen.getByLabelText("Choose partner")).toHaveValue(PARTNER.id);
  });

  it("saves changes to that session, not a new one", async () => {
    updateSession.mockResolvedValue({ ok: true, data: existing });
    const { user, onClose } = renderDialog({ kind: "edit", session: existing });

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Visit to Hope School, second visit");
    await user.click(screen.getByRole("button", { name: "Save session" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateSession).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      existing.id,
      expect.objectContaining({ title: "Visit to Hope School, second visit", hostType: "Partner", hostId: PARTNER.id, hostUserId: null, provinceId: 17 }),
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("keeps a host that was switched off after the session was planned choosable, and marks it", () => {
    const off: Host = { ...PARTNER, isActive: false };
    renderDialog({ kind: "edit", session: existing }, { hosts: [ALUMNUS, off] });

    const select = screen.getByLabelText("Choose partner");
    expect(select).toHaveValue(PARTNER.id);
    expect(within(select).getByRole("option", { name: "Hope School (switched off)" })).toBeInTheDocument();
  });

  it("keeps a province the campaign no longer targets, so the session is not silently moved", () => {
    renderDialog({ kind: "edit", session: sessionFixture({ province: { id: 5, name: "Kampong Speu" } }) });

    expect(screen.getByLabelText(/Province/)).toHaveValue("5");
  });

  it("keeps a person who is no longer in the staff list, so the session is not silently reassigned", () => {
    renderDialog({ kind: "edit", session: sessionFixture({ assignee: { id: "left-1", name: "Former Officer" } }) });

    expect(screen.getByLabelText("Responsible")).toHaveValue("left-1");
  });
});
