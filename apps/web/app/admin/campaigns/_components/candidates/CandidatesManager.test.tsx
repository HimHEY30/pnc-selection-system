import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateFilters, CandidateList } from "@/lib/candidates/types";
import { CAMPAIGN_ID, SCHOOLS, SESSIONS, candidateFixture, candidateListFixture } from "@/test-utils/candidate-fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => `/admin/campaigns/${CAMPAIGN_ID}/candidates`,
}));

const deleteCandidate = vi.fn();
vi.mock("../../candidates-actions", () => ({
  createCandidateAction: vi.fn(),
  updateCandidateAction: vi.fn(),
  deleteCandidateAction: (...args: unknown[]) => deleteCandidate(...args),
}));

vi.mock("@/lib/address/client", () => ({ fetchPlaces: async () => [] }));

import CandidatesManager from "./CandidatesManager";

const PATH = `/admin/campaigns/${CAMPAIGN_ID}/candidates`;

const SOK = candidateFixture();
const VANN = candidateFixture({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  nameEn: "Vann Dara",
  nameKm: "វ៉ាន់ ដារ៉ា",
  gender: "Male",
  phone: "097111222",
  schoolHostId: SCHOOLS[0].id,
  schoolName: "Bak Touk High School",
  session: { id: SESSIONS[0].id, title: SESSIONS[0].title, date: SESSIONS[0].date, status: "Planned" },
  hasNgoSupport: true,
  ngoName: "Hope NGO",
  address: {
    province: { code: "02", name: "Battambang" },
    district: { code: "0201", name: "Banan" },
    commune: { code: "020101", name: "Kantueu Muoy" },
    village: { code: "02010101", name: "Phum Thmei" },
  },
});

function renderManager(
  options: { list?: Partial<CandidateList>; filters?: CandidateFilters; canDelete?: boolean } = {},
) {
  const user = userEvent.setup();
  render(
    <CandidatesManager
      list={candidateListFixture({ items: [SOK, VANN], provinces: ["Battambang", "Phnom Penh"], ...options.list })}
      filters={options.filters ?? {}}
      sessions={SESSIONS}
      schools={SCHOOLS}
      canDelete={options.canDelete ?? true}
    />,
  );
  return { user };
}

const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

beforeEach(() => {
  replace.mockReset();
  deleteCandidate.mockReset();
});

describe("CandidatesManager: the table", () => {
  it("shows each candidate with both names, gender, birth date, phone, address, school, session and NGO", () => {
    renderManager();

    const sok = within(rowOf("Sok Chenda"));
    expect(sok.getByText("សុខ ចិន្តា")).toBeInTheDocument();
    expect(sok.getByText("Female")).toBeInTheDocument();
    expect(sok.getByText("Wed, 20 May 2009")).toBeInTheDocument();
    expect(sok.getByText("012345678")).toBeInTheDocument();
    expect(sok.getByText("Tonle Basak, Chamkar Mon, Phnom Penh")).toBeInTheDocument();
    expect(sok.getByText("Tiny Village School")).toBeInTheDocument();
    expect(sok.getByText("Not set")).toBeInTheDocument();
    expect(sok.getByText("None")).toBeInTheDocument();

    const vann = within(rowOf("Vann Dara"));
    expect(vann.getByText("Phum Thmei, Kantueu Muoy, Banan, Battambang")).toBeInTheDocument();
    expect(vann.getByText("Battambang open day")).toBeInTheDocument();
    expect(vann.getByText("Hope NGO")).toBeInTheDocument();
  });

  it("shows a session that was called off struck through and marked", () => {
    renderManager({
      list: { items: [candidateFixture({ session: { id: "s", title: "Rained off", date: "2027-01-01", status: "Cancelled" } })] },
    });

    expect(screen.getByText("Rained off")).toHaveClass("line-through");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("says which rows are showing out of how many", () => {
    renderManager({ list: { page: 2, pageSize: 2, totalCount: 5, totalPages: 3 } });

    expect(screen.getByText("Showing 3–4 of 5")).toBeInTheDocument();
  });
});

describe("CandidatesManager: search, filters and pages go through the address", () => {
  it("searches on Enter or the button, and goes back to the first page", async () => {
    const { user } = renderManager({ filters: { page: 3 } });

    await user.type(screen.getByRole("searchbox"), "  chenda {Enter}");

    expect(replace).toHaveBeenLastCalledWith(`${PATH}?q=chenda`);
  });

  it("starts the search box from what the address already says", () => {
    renderManager({ filters: { q: "chenda" } });

    expect(screen.getByRole("searchbox")).toHaveValue("chenda");
  });

  it("filters by province, session and NGO support, keeping the others", async () => {
    const { user } = renderManager({ filters: { q: "dara" } });

    await user.selectOptions(screen.getByLabelText("Province"), "Battambang");
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?q=dara&province=Battambang`);
  });

  it("filters by session and by NGO support", async () => {
    const { user } = renderManager();

    await user.selectOptions(screen.getByLabelText("Information session"), SESSIONS[0].id);
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?sessionId=${SESSIONS[0].id}`);

    await user.selectOptions(screen.getByLabelText("NGO support"), "yes");
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?ngo=yes`);
  });

  it("drops the page when a filter changes, because the new list may be shorter", async () => {
    const { user } = renderManager({ filters: { province: "Battambang", page: 4 } });

    await user.selectOptions(screen.getByLabelText("NGO support"), "no");

    expect(replace).toHaveBeenLastCalledWith(`${PATH}?province=Battambang&ngo=no`);
  });

  it("offers Clear only while something narrows the list, and clears everything", async () => {
    const { user } = renderManager({ filters: { q: "x", ngo: "yes", page: 2 } });

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(replace).toHaveBeenLastCalledWith(PATH);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("has no Clear button when nothing is filtered, and the page alone does not count", () => {
    renderManager({ filters: { page: 2 } });

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("keeps a filter the address asks for even if it is not among the choices", () => {
    renderManager({ filters: { province: "Kampot" } });

    expect(screen.getByLabelText("Province")).toHaveValue("Kampot");
  });

  it("moves between pages with Previous and Next, and says where it is", async () => {
    const { user } = renderManager({ list: { page: 2, pageSize: 2, totalCount: 5, totalPages: 3 }, filters: { q: "a", page: 2 } });

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?q=a&page=3`);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?q=a`);
  });

  it("disables Previous on the first page and Next on the last", () => {
    renderManager({ list: { page: 1, totalPages: 1 } });

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("CandidatesManager: nothing to show", () => {
  it("invites the first candidate when the campaign has none", async () => {
    const { user } = renderManager({ list: { items: [], totalCount: 0, totalPages: 0, provinces: [] } });

    expect(screen.getByText("No candidates yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add candidate" }));
    expect(screen.getByRole("dialog", { name: "Add a candidate" })).toBeInTheDocument();
  });

  it("says nothing was added, without an Add button, when the campaign is closed and empty", () => {
    renderManager({ list: { items: [], totalCount: 0, totalPages: 0, canChange: false, campaignStatus: "Closed" } });

    expect(screen.getByText("No candidates were added to this campaign.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add candidate" })).not.toBeInTheDocument();
  });

  it("says no candidate matches when a filter leaves nothing, and keeps the filters to change", () => {
    renderManager({ list: { items: [], totalCount: 0, totalPages: 0 }, filters: { q: "zzz" } });

    expect(screen.getByText("No candidates match")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 0")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CandidatesManager: add and change", () => {
  it("opens the form for a new candidate", async () => {
    const { user } = renderManager();

    await user.click(screen.getByRole("button", { name: "Add candidate" }));

    expect(screen.getByRole("dialog", { name: "Add a candidate" })).toBeInTheDocument();
  });

  it("opens the form for the candidate in the row, filled in", async () => {
    const { user } = renderManager();

    await user.click(within(rowOf("Vann Dara")).getByRole("button", { name: "Actions for Vann Dara" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Change candidate" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name in English")).toHaveValue("Vann Dara");
    expect(screen.getByLabelText("Phone number")).toHaveValue("097111222");
  });

  it("offers no Add and no row actions at all once the campaign is closed, and says why", () => {
    renderManager({ list: { canChange: false, campaignStatus: "Closed" } });

    expect(screen.getByText("This campaign is closed, so candidates can be read but not changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add candidate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });
});

describe("CandidatesManager: delete", () => {
  async function openDelete(user: ReturnType<typeof userEvent.setup>, name = "Vann Dara") {
    await user.click(within(rowOf(name)).getByRole("button", { name: `Actions for ${name}` }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  }

  it("asks first, naming the candidate, and Keep does nothing", async () => {
    const { user } = renderManager();
    await openDelete(user);

    expect(screen.getByRole("dialog", { name: "Delete Vann Dara?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep" }));

    expect(deleteCandidate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Delete Vann Dara?" })).not.toBeInTheDocument();
  });

  it("deletes the right candidate in this campaign when confirmed", async () => {
    deleteCandidate.mockResolvedValue({ ok: true, data: null });
    const { user } = renderManager();
    await openDelete(user);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteCandidate).toHaveBeenCalledWith(CAMPAIGN_ID, VANN.id));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows why when the delete is refused", async () => {
    deleteCandidate.mockResolvedValue({ ok: false, message: "This campaign is closed, so its candidates can no longer be changed." });
    const { user } = renderManager();
    await openDelete(user);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This campaign is closed");
  });

  it("does not offer Delete to someone who cannot delete (an officer), only Edit", async () => {
    const { user } = renderManager({ canDelete: false });

    await user.click(within(rowOf("Vann Dara")).getByRole("button", { name: "Actions for Vann Dara" }));

    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Edit"]);
  });
});
