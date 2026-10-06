import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Level, PlaceOption } from "@/lib/address/places";
import type { Address } from "@/lib/candidates/types";

const fetchPlaces = vi.fn<(level: Level, parent: string | null) => Promise<PlaceOption[] | null>>();
vi.mock("@/lib/address/client", () => ({ fetchPlaces: (level: Level, parent: string | null) => fetchPlaces(level, parent) }));

import AddressPicker from "./AddressPicker";

const place = (code: string, name: string, nameKm: string | null = null): PlaceOption => ({ code, name, nameKm });

const DATA: Record<string, PlaceOption[]> = {
  "provinces:": [place("02", "Battambang", "បាត់ដំបង"), place("12", "Phnom Penh", "ភ្នំពេញ")],
  "districts:12": [place("1201", "Chamkar Mon", "ចំការមន"), place("1202", "Doun Penh")],
  "districts:02": [place("0201", "Banan")],
  "communes:1201": [place("120101", "Tonle Basak"), place("120102", "Boeng Keng Kang Muoy")],
  "villages:120101": [place("12010101", "Phum 1"), place("12010102", "Phum 2")],
};

const EMPTY: Address = { province: null, district: null, commune: null, village: null };

/** Holds the value the way the form does. */
function Harness({ initial = EMPTY, errors, disabled, onValue }: { initial?: Address; errors?: Record<string, string>; disabled?: boolean; onValue?: (a: Address) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <AddressPicker
      value={value}
      errors={errors}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const field = (name: RegExp | string) => screen.getByLabelText(name, { selector: "select, input" }) as HTMLSelectElement | HTMLInputElement;
const optionsOf = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  fetchPlaces.mockReset();
  fetchPlaces.mockImplementation(async (level, parent) => DATA[`${level}:${parent ?? ""}`] ?? []);
});

describe("choosing an address from the lists", () => {
  it("loads the provinces first, with the Khmer name beside the English one, and keeps the others closed", async () => {
    render(<Harness />);

    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    expect(optionsOf(field(/province or city/i))).toEqual(["Choose…", "Battambang · បាត់ដំបង", "Phnom Penh · ភ្នំពេញ"]);
    expect(field(/^district/i)).toBeDisabled();
    expect(field(/^commune/i)).toBeDisabled();
    expect(field(/^village/i)).toBeDisabled();
    expect(within(field(/^district/i)).getByRole("option", { name: "Choose the province first" })).toBeInTheDocument();
    expect(within(field(/^commune/i)).getByRole("option", { name: "Choose the district first" })).toBeInTheDocument();
    expect(fetchPlaces).toHaveBeenCalledTimes(1);
  });

  it("opens each list when the one above is chosen, and reports each pick with its code and English name", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());

    await user.selectOptions(field(/province or city/i), "12");
    await waitFor(() => expect(field(/^district/i)).toBeEnabled());
    await user.selectOptions(field(/^district/i), "1201");
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
    await user.selectOptions(field(/^commune/i), "120101");
    await waitFor(() => expect(field(/^village/i)).toBeEnabled());
    await user.selectOptions(field(/^village/i), "12010102");

    expect(onValue).toHaveBeenLastCalledWith({
      province: { code: "12", name: "Phnom Penh" },
      district: { code: "1201", name: "Chamkar Mon" },
      commune: { code: "120101", name: "Tonle Basak" },
      village: { code: "12010102", name: "Phum 2" },
    });
    expect(fetchPlaces).toHaveBeenCalledWith("districts", "12");
    expect(fetchPlaces).toHaveBeenCalledWith("communes", "1201");
    expect(fetchPlaces).toHaveBeenCalledWith("villages", "120101");
  });

  it("clears what was chosen below when a higher level is chosen again, and loads the new list", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    await user.selectOptions(field(/province or city/i), "12");
    await waitFor(() => expect(field(/^district/i)).toBeEnabled());
    await user.selectOptions(field(/^district/i), "1201");
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
    await user.selectOptions(field(/^commune/i), "120101");

    await user.selectOptions(field(/province or city/i), "02");

    expect(onValue).toHaveBeenLastCalledWith({ province: { code: "02", name: "Battambang" }, district: null, commune: null, village: null });
    await waitFor(() => expect(optionsOf(field(/^district/i))).toEqual(["Choose…", "Banan"]));
    expect(field(/^district/i)).toHaveValue("");
    expect(field(/^commune/i)).toBeDisabled();
    expect(field(/^commune/i)).toHaveValue("");
  });

  it("clears only the village when the commune changes, and the village can be put back to none", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    const start: Address = {
      province: { code: "12", name: "Phnom Penh" },
      district: { code: "1201", name: "Chamkar Mon" },
      commune: { code: "120101", name: "Tonle Basak" },
      village: { code: "12010101", name: "Phum 1" },
    };
    render(<Harness initial={start} onValue={onValue} />);
    await waitFor(() => expect(field(/^village/i)).toBeEnabled());

    await user.selectOptions(field(/^village/i), "");
    expect(onValue).toHaveBeenLastCalledWith({ ...start, village: null });

    await user.selectOptions(field(/^commune/i), "120102");
    expect(onValue).toHaveBeenLastCalledWith({ ...start, commune: { code: "120102", name: "Boeng Keng Kang Muoy" }, village: null });
  });

  it("shows Loading… and keeps a list closed until it arrives", async () => {
    let arrive: (places: PlaceOption[]) => void = () => {};
    fetchPlaces.mockImplementation((level, parent) =>
      level === "provinces" ? new Promise((resolve) => (arrive = resolve)) : Promise.resolve(DATA[`${level}:${parent ?? ""}`] ?? []),
    );
    render(<Harness />);

    expect(field(/province or city/i)).toBeDisabled();
    expect(within(field(/province or city/i)).getByRole("option", { name: "Loading…" })).toBeInTheDocument();

    arrive(DATA["provinces:"]);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
  });

  it("shows an address already chosen before its lists arrive, and keeps a place that is no longer in the list", async () => {
    const saved: Address = {
      province: { code: "12", name: "Phnom Penh" },
      district: { code: "9999", name: "Old District" },
      commune: null,
      village: null,
    };
    render(<Harness initial={saved} />);

    expect(field(/province or city/i)).toHaveValue("12");
    expect(within(field(/province or city/i)).getByRole("option", { name: "Phnom Penh" })).toBeInTheDocument();
    await waitFor(() => expect(field(/^district/i)).toBeEnabled());
    expect(field(/^district/i)).toHaveValue("9999");
    expect(within(field(/^district/i)).getByRole("option", { name: "Old District" })).toBeInTheDocument();
  });

  it("marks the village optional and shows a message under the level it belongs to", async () => {
    render(<Harness errors={{ commune: "Choose the commune." }} />);

    expect(screen.getByText("Village", { exact: false }).parentElement).toHaveTextContent("(optional)");
    expect(field(/^commune/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose the commune.")).toBeInTheDocument();
    expect(field(/^district/i)).not.toHaveAttribute("aria-invalid");
  });

  it("disables every list while the form is busy", async () => {
    render(<Harness disabled />);

    await waitFor(() => expect(fetchPlaces).toHaveBeenCalled());
    expect(field(/province or city/i)).toBeDisabled();
  });
});

describe("when a list cannot be loaded", () => {
  it("says which list failed, and Try again asks again", async () => {
    const user = userEvent.setup();
    fetchPlaces.mockResolvedValueOnce(null);
    render(<Harness />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not load the list of provinces.");
    expect(field(/province or city/i)).toBeDisabled();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchPlaces).toHaveBeenCalledTimes(2);
  });

  it("names a lower list that failed, and the upper picks stay", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    fetchPlaces.mockImplementation(async (level, parent) => (level === "communes" ? null : (DATA[`${level}:${parent ?? ""}`] ?? [])));
    render(<Harness onValue={onValue} />);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    await user.selectOptions(field(/province or city/i), "12");
    await waitFor(() => expect(field(/^district/i)).toBeEnabled());
    await user.selectOptions(field(/^district/i), "1201");

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the list of communes.");
    expect(field(/province or city/i)).toHaveValue("12");
    expect(field(/^district/i)).toHaveValue("1201");
  });

  it("Type it instead swaps the lists for four text boxes that save names with no codes", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    fetchPlaces.mockResolvedValue(null);
    render(<Harness onValue={onValue} />);

    await user.click(await screen.findByRole("button", { name: "Type it instead" }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.type(field(/province or city/i), "Kampong Cham");
    await user.type(field(/^district/i), "Cheung Prey");
    await user.type(field(/^commune/i), "Prey Chhor");
    await user.type(field(/^village/i), "Phum Thmei");

    expect(onValue).toHaveBeenLastCalledWith({
      province: { code: null, name: "Kampong Cham" },
      district: { code: null, name: "Cheung Prey" },
      commune: { code: null, name: "Prey Chhor" },
      village: { code: null, name: "Phum Thmei" },
    });
  });

  it("emptying a typed box leaves that level empty", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    fetchPlaces.mockResolvedValue(null);
    render(<Harness onValue={onValue} />);
    await user.click(await screen.findByRole("button", { name: "Type it instead" }));

    await user.type(field(/^village/i), "A");
    await user.clear(field(/^village/i));

    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ village: null }));
  });

  it("Pick from the lists instead goes back and clears what was typed", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    fetchPlaces.mockImplementation(async () => null);
    render(<Harness onValue={onValue} />);
    await user.click(await screen.findByRole("button", { name: "Type it instead" }));
    await user.type(field(/province or city/i), "Kampong Cham");

    fetchPlaces.mockImplementation(async (level, parent) => DATA[`${level}:${parent ?? ""}`] ?? []);
    await user.click(screen.getByRole("button", { name: "Pick from the lists instead" }));

    expect(onValue).toHaveBeenLastCalledWith(EMPTY);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    expect(field(/province or city/i)).toHaveValue("");
  });

  it("starts in typing mode for an address that was saved typed, and does not ask the service", async () => {
    const typed: Address = {
      province: { code: null, name: "Kampong Cham" },
      district: { code: null, name: "Cheung Prey" },
      commune: { code: null, name: "Prey Chhor" },
      village: null,
    };
    render(<Harness initial={typed} />);

    expect(field(/province or city/i)).toHaveValue("Kampong Cham");
    expect(field(/^district/i)).toHaveValue("Cheung Prey");
    expect(fetchPlaces).not.toHaveBeenCalled();
  });
});

describe("guiding the person through the levels", () => {
  it("says how far along they are and what comes next, then that the address is complete", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());

    expect(screen.getByText(/0 of 3 required levels chosen · Next: choose the province/)).toBeInTheDocument();

    await user.selectOptions(field(/province or city/i), "12");
    await waitFor(() => expect(field(/^district/i)).toBeEnabled());
    expect(screen.getByText(/1 of 3 required levels chosen · Next: choose the district/)).toBeInTheDocument();

    await user.selectOptions(field(/^district/i), "1201");
    await waitFor(() => expect(field(/^commune/i)).toBeEnabled());
    await user.selectOptions(field(/^commune/i), "120101");

    expect(screen.getByText("Address complete")).toBeInTheDocument();
  });

  it("tells assistive technology each step's number and state, not just its colour", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());

    expect(screen.getByText("Step 1 of 4, choose now")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4, waiting")).toBeInTheDocument();

    await user.selectOptions(field(/province or city/i), "12");
    expect(screen.getByText("Step 1 of 4, chosen")).toBeInTheDocument();
  });

  it("shows the retry panel beside the level that failed, and asks again when Try again is pressed", async () => {
    const user = userEvent.setup();
    fetchPlaces.mockResolvedValueOnce(null);
    render(<Harness />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not load the list of provinces.");
    expect(screen.getByText("Step 1 of 4, could not load")).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(field(/province or city/i)).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchPlaces).toHaveBeenCalledTimes(2);
  });

  it("marks typing by hand so the person knows the lists are not in use", async () => {
    const user = userEvent.setup();
    fetchPlaces.mockResolvedValue(null);
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Type it instead" }));

    expect(screen.getByText("Typing by hand")).toBeInTheDocument();
  });
});
