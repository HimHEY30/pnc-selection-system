import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Level, PlaceOption } from "@/lib/address/places";
import type { Candidate } from "@/lib/candidates/types";
import { CAMPAIGN_ID, SCHOOLS, SESSIONS, candidateFixture } from "@/test-utils/candidate-fixtures";

const fetchPlaces = vi.fn<(level: Level, parent: string | null) => Promise<PlaceOption[] | null>>();
vi.mock("@/lib/address/client", () => ({ fetchPlaces: (level: Level, parent: string | null) => fetchPlaces(level, parent) }));

const createCandidate = vi.fn();
const updateCandidate = vi.fn();
vi.mock("../../candidates-actions", () => ({
  createCandidateAction: (...args: unknown[]) => createCandidate(...args),
  updateCandidateAction: (...args: unknown[]) => updateCandidate(...args),
}));

import CandidateFormDialog, { type CandidateDialogTarget } from "./CandidateFormDialog";

const place = (code: string, name: string): PlaceOption => ({ code, name, nameKm: null });
const DATA: Record<string, PlaceOption[]> = {
  "provinces:": [place("02", "Battambang"), place("12", "Phnom Penh")],
  "districts:12": [place("1201", "Chamkar Mon")],
  "communes:1201": [place("120101", "Tonle Basak")],
  "villages:120101": [place("12010101", "Phum 1")],
};

beforeEach(() => {
  fetchPlaces.mockReset();
  fetchPlaces.mockImplementation(async (level, parent) => DATA[`${level}:${parent ?? ""}`] ?? []);
  createCandidate.mockReset();
  updateCandidate.mockReset();
});

function renderDialog(
  target: CandidateDialogTarget | null = { kind: "create" },
  options: { schools?: typeof SCHOOLS; sessions?: typeof SESSIONS } = {},
) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <CandidateFormDialog
      target={target}
      campaignId={CAMPAIGN_ID}
      sessions={options.sessions ?? SESSIONS}
      schools={options.schools ?? SCHOOLS}
      onClose={onClose}
    />,
  );
  return { user, onClose };
}

const field = (name: RegExp | string) => screen.getByLabelText(name, { selector: "select, input" }) as HTMLSelectElement | HTMLInputElement;
const optionsOf = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

type User = ReturnType<typeof userEvent.setup>;

/** Picks the address down to the commune, from the lists. */
async function pickAddress(user: User) {
  await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
  await user.selectOptions(field(/province or city/i), "12");
  await waitFor(() => expect(field(/^district/i)).toBeEnabled());
  await user.selectOptions(field(/^district/i), "1201");
  await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
  await user.selectOptions(field(/^commune/i), "120101");
}

/** Everything a new candidate needs: names, gender, birth date, phone, address and a picked school. */
async function fillEverything(user: User) {
  await user.type(field("Name in Khmer"), "សុខ ចិន្តា");
  await user.type(field("Name in English"), "Sok Chenda");
  await user.selectOptions(field("Gender"), "Female");
  await user.type(field("Date of birth"), "2009-05-20");
  await user.type(field("Phone number"), "012 345 678");
  await pickAddress(user);
  await user.selectOptions(field("Came from high school"), SCHOOLS[0].id);
}

const submit = (user: User, name = "Add candidate") => user.click(screen.getByRole("button", { name }));

describe("CandidateFormDialog: opening", () => {
  it("is closed when there is nothing to do", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a new candidate empty, with no NGO support and no session", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Add a candidate" })).toBeInTheDocument();
    expect(field("Name in Khmer")).toHaveValue("");
    expect(field("Gender")).toHaveValue("");
    expect(field("Came from high school")).toHaveValue("");
    expect(field(/information session attended/i)).toHaveValue("");
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    expect(screen.queryByLabelText("Name of the NGO")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("School name")).not.toBeInTheDocument();
  });

  it("opens a candidate being changed with everything filled in, a typed school shown as Other with its name", async () => {
    renderDialog({ kind: "edit", candidate: candidateFixture() });

    expect(screen.getByRole("dialog", { name: "Change candidate" })).toBeInTheDocument();
    expect(field("Name in Khmer")).toHaveValue("សុខ ចិន្តា");
    expect(field("Name in English")).toHaveValue("Sok Chenda");
    expect(field("Gender")).toHaveValue("Female");
    expect(field("Date of birth")).toHaveValue("2009-05-20");
    expect(field("Phone number")).toHaveValue("012345678");
    expect(field("Came from high school")).toHaveValue("__other");
    expect(field("School name")).toHaveValue("Tiny Village School");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
    expect(field(/province or city/i)).toHaveValue("12");
    expect(field(/^commune/i)).toHaveValue("120101");
  });

  it("opens a picked school, a session and NGO support as they were saved", () => {
    const candidate = candidateFixture({
      schoolHostId: SCHOOLS[1].id,
      schoolName: SCHOOLS[1].name,
      session: { id: SESSIONS[0].id, title: SESSIONS[0].title, date: SESSIONS[0].date, status: "Planned" },
      hasNgoSupport: true,
      ngoName: "Hope NGO",
    });
    renderDialog({ kind: "edit", candidate });

    expect(field("Came from high school")).toHaveValue(SCHOOLS[1].id);
    expect(screen.queryByLabelText("School name")).not.toBeInTheDocument();
    expect(field(/information session attended/i)).toHaveValue(SESSIONS[0].id);
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(field("Name of the NGO")).toHaveValue("Hope NGO");
  });
});

describe("CandidateFormDialog: the lists", () => {
  it("offers the schools by name and Other, and the sessions with their dates and none", () => {
    renderDialog();

    expect(optionsOf(field("Came from high school"))).toEqual(["Choose…", "Bak Touk High School", "Hun Sen Prey Chhor High School", "Other: type the name"]);
    expect(optionsOf(field(/information session attended/i))).toEqual([
      "No session, or not known",
      "Battambang open day · Sat, 20 Mar 2027",
      "Visit to Hope School · Mon, 1 Feb 2027",
    ]);
  });

  it("keeps the candidate's own school and session in the lists even when they are no longer offered", () => {
    const candidate = candidateFixture({
      schoolHostId: "99999999-9999-4999-8999-999999999999",
      schoolName: "Closed High School",
      session: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "Rained off", date: "2027-01-01", status: "Cancelled" },
    });
    renderDialog({ kind: "edit", candidate }, { schools: [], sessions: [] });

    expect(optionsOf(field("Came from high school"))).toContain("Closed High School (switched off)");
    expect(field("Came from high school")).toHaveValue("99999999-9999-4999-8999-999999999999");
    expect(optionsOf(field(/information session attended/i))).toContain("Rained off (cancelled)");
  });

  it("shows a box for the school's name only when Other is chosen", async () => {
    const { user } = renderDialog();

    await user.selectOptions(field("Came from high school"), "__other");
    expect(field("School name")).toBeInTheDocument();

    await user.selectOptions(field("Came from high school"), SCHOOLS[0].id);
    expect(screen.queryByLabelText("School name")).not.toBeInTheDocument();
  });

  it("shows the NGO's name box only for Yes, and No forgets the name", async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.type(field("Name of the NGO"), "Hope NGO");
    await user.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.queryByLabelText("Name of the NGO")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(field("Name of the NGO")).toHaveValue("");
  });

  it("does not let a birth date in the future be picked", () => {
    renderDialog();

    expect(field("Date of birth")).toHaveAttribute("max", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});

describe("CandidateFormDialog: adding", () => {
  it("sends what was filled in, with the school's id and the address as picked, and closes when saved", async () => {
    createCandidate.mockResolvedValue({ ok: true, data: candidateFixture() });
    const { user, onClose } = renderDialog();
    await fillEverything(user);

    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(createCandidate).toHaveBeenCalledWith(CAMPAIGN_ID, {
      nameKm: "សុខ ចិន្តា",
      nameEn: "Sok Chenda",
      gender: "Female",
      dateOfBirth: "2009-05-20",
      phone: "012 345 678",
      address: {
        province: { code: "12", name: "Phnom Penh" },
        district: { code: "1201", name: "Chamkar Mon" },
        commune: { code: "120101", name: "Tonle Basak" },
        village: null,
      },
      schoolHostId: SCHOOLS[0].id,
      schoolName: null,
      sessionId: null,
      hasNgoSupport: false,
      ngoName: null,
      version: null,
    });
    expect(updateCandidate).not.toHaveBeenCalled();
  });

  it("sends a typed school, a chosen session and an NGO", async () => {
    createCandidate.mockResolvedValue({ ok: true, data: candidateFixture() });
    const { user } = renderDialog();
    await fillEverything(user);
    await user.selectOptions(field("Came from high school"), "__other");
    await user.type(field("School name"), "Tiny Village School");
    await user.selectOptions(field(/information session attended/i), SESSIONS[1].id);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.type(field("Name of the NGO"), "Hope NGO");

    await submit(user);

    await waitFor(() => expect(createCandidate).toHaveBeenCalled());
    expect(createCandidate.mock.calls[0][1]).toMatchObject({
      schoolHostId: null,
      schoolName: "Tiny Village School",
      sessionId: SESSIONS[1].id,
      hasNgoSupport: true,
      ngoName: "Hope NGO",
    });
  });

  it("says what is missing beside each field, puts the cursor on the first, and sends nothing", async () => {
    const { user, onClose } = renderDialog();

    await submit(user);

    expect(screen.getByText("Enter the name in Khmer.")).toBeInTheDocument();
    expect(screen.getByText("Enter the name in English.")).toBeInTheDocument();
    expect(screen.getByText("Choose female or male.")).toBeInTheDocument();
    expect(screen.getByText("Enter the date of birth.")).toBeInTheDocument();
    expect(screen.getByText("Enter a phone number.")).toBeInTheDocument();
    expect(screen.getByText("Choose the province or city.")).toBeInTheDocument();
    expect(screen.getByText("Choose the district.")).toBeInTheDocument();
    expect(screen.getByText("Choose the commune.")).toBeInTheDocument();
    expect(screen.getByText("Choose the high school, or choose Other and type its name.")).toBeInTheDocument();
    expect(field("Name in Khmer")).toHaveFocus();
    expect(field("Name in Khmer")).toHaveAttribute("aria-invalid", "true");
    expect(createCandidate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("needs the school's name for Other and the NGO's name for Yes", async () => {
    const { user } = renderDialog();
    await fillEverything(user);
    await user.selectOptions(field("Came from high school"), "__other");
    await user.click(screen.getByRole("radio", { name: "Yes" }));

    await submit(user);

    expect(screen.getByText("Enter the name of the school.")).toBeInTheDocument();
    expect(screen.getByText("Enter the name of the NGO.")).toBeInTheDocument();
    expect(field("School name")).toHaveFocus();
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it("clears a message when the person starts fixing that field", async () => {
    const { user } = renderDialog();
    await submit(user);
    expect(screen.getByText("Enter the name in English.")).toBeInTheDocument();

    await user.type(field("Name in English"), "S");

    expect(screen.queryByText("Enter the name in English.")).not.toBeInTheDocument();
    expect(screen.getByText("Enter the name in Khmer.")).toBeInTheDocument();
  });
});

describe("CandidateFormDialog: the server says no", () => {
  it("puts the server's message beside its field, keeps what was typed and stays open", async () => {
    createCandidate.mockResolvedValue({
      ok: false,
      message: "Some fields need your attention.",
      fieldErrors: { nameEn: "Use English letters, spaces, hyphens, apostrophes and full stops only.", phone: "Enter a Cambodian phone number." },
    });
    const { user, onClose } = renderDialog();
    await fillEverything(user);

    await submit(user);

    expect(await screen.findByText("Enter a Cambodian phone number.")).toBeInTheDocument();
    expect(screen.getByText(/Use English letters/)).toBeInTheDocument();
    expect(field("Name in English")).toHaveFocus();
    expect(field("Name in English")).toHaveValue("Sok Chenda");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a message for a refusal that belongs to no field, such as a taken phone", async () => {
    createCandidate.mockResolvedValue({ ok: false, message: "This phone number already belongs to Vann Dara in this campaign." });
    const { user, onClose } = renderDialog();
    await fillEverything(user);

    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("This phone number already belongs to Vann Dara in this campaign.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("puts a message about the school under the school's name when Other is chosen", async () => {
    createCandidate.mockResolvedValue({ ok: false, message: "x", fieldErrors: { schoolName: "Use at most 150 characters." } });
    const { user } = renderDialog();
    await fillEverything(user);
    await user.selectOptions(field("Came from high school"), "__other");
    await user.type(field("School name"), "A");

    await submit(user);

    expect(await screen.findByText("Use at most 150 characters.")).toBeInTheDocument();
    expect(field("School name")).toHaveFocus();
  });

  it("puts an address message under its level", async () => {
    createCandidate.mockResolvedValue({ ok: false, message: "x", fieldErrors: { commune: "Choose the commune." } });
    const { user } = renderDialog();
    await fillEverything(user);

    await submit(user);

    expect(await screen.findByText("Choose the commune.")).toBeInTheDocument();
    expect(field(/^commune/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the buttons and says Saving… while the save is in flight, then lets go", async () => {
    let finish: (value: unknown) => void = () => {};
    createCandidate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderDialog();
    await fillEverything(user);

    await submit(user);

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    finish({ ok: false, message: "That did not work." });
    expect(await screen.findByRole("button", { name: "Add candidate" })).toBeEnabled();
  });
});

describe("CandidateFormDialog: changing", () => {
  it("sends the form with the version that was loaded, to the candidate's own id", async () => {
    updateCandidate.mockResolvedValue({ ok: true, data: candidateFixture() });
    const candidate = candidateFixture({ version: 9 });
    const { user, onClose } = renderDialog({ kind: "edit", candidate });
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
    await user.clear(field("Name in English"));
    await user.type(field("Name in English"), "Sok Dara");

    await submit(user, "Save changes");

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateCandidate).toHaveBeenCalledWith(CAMPAIGN_ID, candidate.id, expect.objectContaining({ nameEn: "Sok Dara", version: 9, schoolName: "Tiny Village School" }));
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it("tells the person when somebody else changed the candidate first", async () => {
    updateCandidate.mockResolvedValue({ ok: false, message: "Someone else changed this. Reload the page and try again." });
    const { user, onClose } = renderDialog({ kind: "edit", candidate: candidateFixture() });
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());

    await submit(user, "Save changes");

    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else changed this");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("CandidateFormDialog: unsaved changes", () => {
  const asking = () => screen.queryByRole("dialog", { name: "Discard your changes?" });

  it("closes without asking when nothing was typed", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(asking()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before throwing away what was typed, and Discard closes", async () => {
    const { user, onClose } = renderDialog();
    await user.type(field("Name in English"), "Sok");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(asking()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks after a pick in the address too", async () => {
    const { user, onClose } = renderDialog();
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    await user.selectOptions(field(/province or city/i), "12");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(asking()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not ask for an edit nobody touched, nor after a change was typed back", async () => {
    const candidate: Candidate = candidateFixture();
    const { user, onClose } = renderDialog({ kind: "edit", candidate });
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
    await user.type(field("Name in English"), "x");
    await user.type(field("Name in English"), "{Backspace}");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(asking()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
