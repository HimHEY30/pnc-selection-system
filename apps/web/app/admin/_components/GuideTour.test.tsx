import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "@/lib/messages";
import ShowTourButton from "../guide/ShowTourButton";
import { GuideProvider } from "./GuideProvider";

afterEach(() => {
  document.cookie = "pnc_guide_seen=; Max-Age=0; Path=/";
});

const MANAGER = ["selection-manager"];
const OFFICER = ["selection-officer"];
const tourOpen = () => screen.queryByRole("dialog");
const hasSeenCookie = () => document.cookie.includes("pnc_guide_seen=1");

function renderTour(options: { roles?: string[]; startOpen?: boolean } = {}) {
  const user = userEvent.setup();
  render(
    <GuideProvider roles={options.roles ?? MANAGER} startOpen={options.startOpen ?? true}>
      <ShowTourButton />
    </GuideProvider>,
  );
  return { user };
}

describe("the welcome tour", () => {
  it("opens by itself on the first step when this browser has not seen it", () => {
    renderTour();

    expect(screen.getByRole("dialog", { name: t.guide.manager[0].title })).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${t.guide.manager.length}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("stays closed once it has been seen", () => {
    renderTour({ startOpen: false });

    expect(tourOpen()).not.toBeInTheDocument();
  });

  it("moves forward and back, one step at a time, with the step's points", async () => {
    const { user } = renderTour();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("dialog", { name: t.guide.manager[1].title })).toBeInTheDocument();
    expect(screen.getByText(`Step 2 of ${t.guide.manager.length}`)).toBeInTheDocument();
    for (const point of t.guide.manager[1].points) expect(screen.getByText(point)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("dialog", { name: t.guide.manager[0].title })).toBeInTheDocument();
  });

  it("shows the officer's steps to an officer, and the manager's to a manager", () => {
    renderTour({ roles: OFFICER });

    expect(screen.getByText(t.guide.officer[0].body)).toBeInTheDocument();
    expect(screen.queryByText(t.guide.manager[0].body)).not.toBeInTheDocument();
  });

  it("is closed and remembered by Skip the tour, from any step", async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(screen.getByRole("button", { name: "Skip the tour" }));

    expect(tourOpen()).not.toBeInTheDocument();
    expect(hasSeenCookie()).toBe(true);
  });

  it("is closed and remembered by the close button too", async () => {
    const { user } = renderTour();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(tourOpen()).not.toBeInTheDocument();
    expect(hasSeenCookie()).toBe(true);
  });

  it("offers Got it instead of Next, and no Skip, on the last step, and finishing remembers it", async () => {
    const { user } = renderTour();
    for (let i = 1; i < t.guide.manager.length; i++) await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText(`Step ${t.guide.manager.length} of ${t.guide.manager.length}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip the tour" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(tourOpen()).not.toBeInTheDocument();
    expect(hasSeenCookie()).toBe(true);
  });

  it("does not remember anything while it is simply open", () => {
    renderTour();

    expect(hasSeenCookie()).toBe(false);
  });

  it("opens again from the first step when asked, after it was seen", async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Skip the tour" }));

    await user.click(screen.getByRole("button", { name: "Show the tour again" }));

    expect(screen.getByRole("dialog", { name: t.guide.manager[0].title })).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${t.guide.manager.length}`)).toBeInTheDocument();
  });
});
