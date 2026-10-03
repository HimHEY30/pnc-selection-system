import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALUMNUS, PARTNER } from "@/test-utils/session-fixtures";
import type { Host } from "@/lib/sessions/types";

const setHostActive = vi.fn();
vi.mock("../../sessions-actions", () => ({
  setHostActiveAction: (...args: unknown[]) => setHostActive(...args),
  createHostAction: vi.fn(),
  updateHostAction: vi.fn(),
}));

import HostsManager from "./HostsManager";

beforeEach(() => setHostActive.mockReset());

const RETIRED: Host = { ...ALUMNUS, id: "33333333-4444-4555-8666-777777777777", name: "Zed Retired", isActive: false };

function renderManager(hosts: Host[], canManage = true) {
  const user = userEvent.setup();
  render(<HostsManager hosts={hosts} canManage={canManage} />);
  return { user };
}

const cardOf = (name: string) => screen.getByRole("listitem", { name });

describe("HostsManager", () => {
  it("lists the active hosts with their type, kind, contact person and how to reach them", () => {
    renderManager([ALUMNUS, PARTNER]);

    expect(within(cardOf("Chenda Sok")).getByText("Alumnus")).toBeInTheDocument();
    expect(within(cardOf("Chenda Sok")).getByText("012 345 678")).toBeInTheDocument();
    expect(within(cardOf("Hope School")).getByText("Partner · High school · Mr Rith")).toBeInTheDocument();
    expect(within(cardOf("Hope School")).getByText("info@hope.example.org")).toBeInTheDocument();
  });

  it("hides switched-off hosts until asked, and marks them when shown", async () => {
    const { user } = renderManager([ALUMNUS, RETIRED]);
    expect(screen.queryByRole("listitem", { name: "Zed Retired" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Show switched-off hosts (1)" }));

    expect(within(cardOf("Zed Retired")).getByText("Switched off")).toBeInTheDocument();
  });

  it("does not offer to show switched-off hosts when there are none", () => {
    renderManager([ALUMNUS]);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("filters by type, and says so when nothing matches", async () => {
    const { user } = renderManager([ALUMNUS]);

    await user.selectOptions(screen.getByLabelText("Type"), "Partner");

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText("No hosts match this filter.")).toBeInTheDocument();
  });

  it("invites a manager to add the first host when the directory is empty", async () => {
    const { user } = renderManager([]);

    expect(screen.getByRole("heading", { name: "No alumni or partners yet." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add partner" }));

    expect(screen.getByRole("dialog", { name: "Add partner" })).toBeInTheDocument();
  });

  it("opens the right dialog to add an alumnus or a partner", async () => {
    const { user } = renderManager([ALUMNUS]);

    await user.click(screen.getByRole("button", { name: "Add alumnus" }));

    expect(screen.getByRole("dialog", { name: "Add alumnus" })).toBeInTheDocument();
  });

  it("opens the edit dialog for that host, filled in", async () => {
    const { user } = renderManager([ALUMNUS, PARTNER]);

    await user.click(within(cardOf("Hope School")).getByRole("button", { name: "Edit" }));

    const dialog = screen.getByRole("dialog", { name: "Edit host" });
    expect(within(dialog).getByLabelText("Organisation name")).toHaveValue("Hope School");
  });

  it("switches a host off, and a switched-off one back on", async () => {
    setHostActive.mockResolvedValue({ ok: true, data: ALUMNUS });
    const { user } = renderManager([ALUMNUS, RETIRED]);

    await user.click(within(cardOf("Chenda Sok")).getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(setHostActive).toHaveBeenCalledWith(ALUMNUS.id, false));

    await user.click(screen.getByRole("checkbox"));
    await user.click(within(cardOf("Zed Retired")).getByRole("button", { name: "Switch on" }));
    await waitFor(() => expect(setHostActive).toHaveBeenCalledWith(RETIRED.id, true));
  });

  it("shows why a switch failed", async () => {
    setHostActive.mockResolvedValue({ ok: false, message: "This host does not exist." });
    const { user } = renderManager([ALUMNUS]);

    await user.click(screen.getByRole("button", { name: "Switch off" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This host does not exist.");
  });

  it("lets someone who may not manage only read the list", () => {
    renderManager([ALUMNUS, PARTNER], false);

    expect(screen.getByText("Only a selection manager or a system admin can change this list.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch off" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("offers a reader nothing to add when the directory is empty", () => {
    renderManager([], false);

    expect(screen.getByRole("heading", { name: "No alumni or partners yet." })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
