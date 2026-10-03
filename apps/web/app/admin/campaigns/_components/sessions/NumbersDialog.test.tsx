import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ID, doneSession, sessionFixture } from "@/test-utils/session-fixtures";
import type { InformationSession } from "@/lib/sessions/types";

const setExpected = vi.fn();
const recordAttendance = vi.fn();
vi.mock("../../sessions-actions", () => ({
  setExpectedAction: (...args: unknown[]) => setExpected(...args),
  recordAttendanceAction: (...args: unknown[]) => recordAttendance(...args),
}));

import NumbersDialog from "./NumbersDialog";

beforeEach(() => {
  setExpected.mockReset();
  recordAttendance.mockReset();
});

// sessionFixture() is dated 2099 (not yet held); doneSession() is dated 2000 (held, with attendance).
const planned = () => sessionFixture();
const heldNoNumbers = () => sessionFixture({ date: "2000-03-01" });

function renderDialog(session: InformationSession | null) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<NumbersDialog session={session} onClose={onClose} />);
  return { user, onClose };
}

describe("NumbersDialog", () => {
  it("is closed when there is no session", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the session and starts empty for a session with no numbers", () => {
    renderDialog(heldNoNumbers());

    expect(screen.getByRole("dialog", { name: "Enter numbers" })).toBeInTheDocument();
    expect(screen.getByText(/Open day at Kampong Cham High School: how many candidates are expected/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Expected/ })).toHaveValue("");
    expect(screen.getByLabelText("Females")).toHaveValue("");
    expect(screen.getByLabelText("Males")).toHaveValue("");
  });

  it("starts from the numbers a session already has, and says who entered them", () => {
    renderDialog(doneSession());

    expect(screen.getByRole("textbox", { name: /^Expected/ })).toHaveValue("40");
    expect(screen.getByLabelText("Females")).toHaveValue("18");
    expect(screen.getByLabelText("Males")).toHaveValue("12");
    expect(screen.getByText("Total: 30")).toBeInTheDocument();
    expect(screen.getByText("Last entered by Sokha Officer. Saving again corrects it.")).toBeInTheDocument();
  });

  // ---------- Expected ----------

  it("saves the expected number on its own", async () => {
    setExpected.mockResolvedValue({ ok: true, data: planned() });
    const { user } = renderDialog(planned());

    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), "40");
    await user.click(screen.getByRole("button", { name: "Save expected" }));

    await waitFor(() => expect(setExpected).toHaveBeenCalledWith(CAMPAIGN_ID, planned().id, 40));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("clears the expected number when the box is emptied", async () => {
    setExpected.mockResolvedValue({ ok: true, data: planned() });
    const { user } = renderDialog(doneSession());

    await user.clear(screen.getByRole("textbox", { name: /^Expected/ }));
    await user.click(screen.getByRole("button", { name: "Save expected" }));

    await waitFor(() => expect(setExpected).toHaveBeenCalledWith(CAMPAIGN_ID, doneSession().id, null));
  });

  it("keeps 0 as a number", async () => {
    setExpected.mockResolvedValue({ ok: true, data: planned() });
    const { user } = renderDialog(planned());

    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), "0");
    await user.click(screen.getByRole("button", { name: "Save expected" }));

    await waitFor(() => expect(setExpected).toHaveBeenCalledWith(CAMPAIGN_ID, planned().id, 0));
  });

  it.each(["-3", "2.5", "many", "5001"])("refuses %s as an expected number without calling the server", async (value) => {
    const { user } = renderDialog(planned());

    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), value);
    await user.click(screen.getByRole("button", { name: "Save expected" }));

    expect(screen.getByRole("textbox", { name: /^Expected/ })).toHaveAccessibleDescription("Enter a whole number from 0 to 5000.");
    expect(setExpected).not.toHaveBeenCalled();
  });

  it("shows the server's message about the expected number under its box", async () => {
    setExpected.mockResolvedValue({ ok: false, message: "Bad", fieldErrors: { expected: "Enter a whole number from 0 to 5000." } });
    const { user } = renderDialog(planned());

    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), "10");
    await user.click(screen.getByRole("button", { name: "Save expected" }));

    expect(await screen.findByText("Enter a whole number from 0 to 5000.")).toBeInTheDocument();
  });

  it("shows any other failure as an alert", async () => {
    setExpected.mockResolvedValue({ ok: false, message: "This session was cancelled, so its numbers can no longer be changed." });
    const { user } = renderDialog(planned());

    await user.type(screen.getByRole("textbox", { name: /^Expected/ }), "10");
    await user.click(screen.getByRole("button", { name: "Save expected" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This session was cancelled");
  });

  // ---------- Actual ----------

  it("explains that attendance waits for the day, and disables it", () => {
    renderDialog(planned());

    expect(screen.getByText("Attendance can be entered from Fri, 20 Mar 2099, when the session takes place.")).toBeInTheDocument();
    expect(screen.getByLabelText("Females")).toBeDisabled();
    expect(screen.getByLabelText("Males")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save attendance" })).toBeDisabled();
  });

  it("saves the females and the males together once the session has taken place, and shows the total as it is typed", async () => {
    recordAttendance.mockResolvedValue({ ok: true, data: doneSession() });
    const { user } = renderDialog(heldNoNumbers());

    await user.type(screen.getByLabelText("Females"), "18");
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Males"), "12");
    expect(screen.getByText("Total: 30")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    await waitFor(() => expect(recordAttendance).toHaveBeenCalledWith(CAMPAIGN_ID, heldNoNumbers().id, 18, 12));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(setExpected).not.toHaveBeenCalled();
  });

  it("accepts 0 and 0 as a real answer", async () => {
    recordAttendance.mockResolvedValue({ ok: true, data: doneSession() });
    const { user } = renderDialog(heldNoNumbers());

    await user.type(screen.getByLabelText("Females"), "0");
    await user.type(screen.getByLabelText("Males"), "0");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    await waitFor(() => expect(recordAttendance).toHaveBeenCalledWith(CAMPAIGN_ID, heldNoNumbers().id, 0, 0));
  });

  it("needs both numbers and marks the one that is missing", async () => {
    const { user } = renderDialog(heldNoNumbers());

    await user.type(screen.getByLabelText("Females"), "5");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(screen.getByLabelText("Males")).toHaveAccessibleDescription("Enter both numbers, using 0 if nobody came.");
    expect(screen.getByLabelText("Females")).not.toHaveAccessibleDescription("Enter both numbers, using 0 if nobody came.");
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("refuses a number that is not a whole number from 0 to 5000", async () => {
    const { user } = renderDialog(heldNoNumbers());

    await user.type(screen.getByLabelText("Females"), "-1");
    await user.type(screen.getByLabelText("Males"), "5001");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(screen.getByLabelText("Females")).toHaveAccessibleDescription("Enter a whole number from 0 to 5000.");
    expect(screen.getByLabelText("Males")).toHaveAccessibleDescription("Enter a whole number from 0 to 5000.");
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("corrects attendance that was already recorded", async () => {
    recordAttendance.mockResolvedValue({ ok: true, data: doneSession() });
    const { user } = renderDialog(doneSession());

    await user.clear(screen.getByLabelText("Females"));
    await user.type(screen.getByLabelText("Females"), "20");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    await waitFor(() => expect(recordAttendance).toHaveBeenCalledWith(CAMPAIGN_ID, doneSession().id, 20, 12));
  });

  it("shows the server's per-box messages for the attendance", async () => {
    recordAttendance.mockResolvedValue({ ok: false, message: "Bad", fieldErrors: { male: "Enter a whole number from 0 to 5000." } });
    const { user } = renderDialog(heldNoNumbers());

    await user.type(screen.getByLabelText("Females"), "1");
    await user.type(screen.getByLabelText("Males"), "1");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(await screen.findByText("Enter a whole number from 0 to 5000.")).toBeInTheDocument();
  });

  it("shows a server refusal that is not about a box as an alert", async () => {
    recordAttendance.mockResolvedValue({ ok: false, message: "Attendance can be recorded once the session's date has arrived." });
    const { user } = renderDialog(heldNoNumbers());

    await user.type(screen.getByLabelText("Females"), "1");
    await user.type(screen.getByLabelText("Males"), "1");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("once the session's date has arrived");
  });

  it("disables the buttons while it saves", async () => {
    let finish: (value: unknown) => void = () => {};
    recordAttendance.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderDialog(heldNoNumbers());
    await user.type(screen.getByLabelText("Females"), "1");
    await user.type(screen.getByLabelText("Males"), "1");

    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save expected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    finish({ ok: true, data: doneSession() });
  });
});
