import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_NAV_EVENT, type GuideNavDetail } from "@/lib/guide/guide";
import { t } from "@/lib/messages";
import ShowTourButton from "../guide/ShowTourButton";
import AdminShell from "./AdminShell";
import { GuideProvider } from "./GuideProvider";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../campaigns/actions", () => ({ createCampaignAction: vi.fn(), loadCopyPreviewAction: vi.fn() }));

const MANAGER = ["selection-manager"];
const OFFICER = ["selection-officer"];
const manager = t.guide.tour.manager;

/** jsdom has no layout, so every part of the screen the tour can point at is given a place here. */
const PLACES: Record<string, { top: number; left: number; width: number; height: number }> = {
  switcher: { top: 12, left: 300, width: 280, height: 44 },
  "nav-campaigns": { top: 120, left: 16, width: 208, height: 44 },
  "nav-sessions": { top: 170, left: 16, width: 208, height: 44 },
  "nav-guide": { top: 400, left: 16, width: 208, height: 44 },
  profile: { top: 12, left: 1180, width: 90, height: 44 },
};
let missing: Set<string>;
/** How far left the sidebar link is, while the drawer has not finished sliding in. */
let slideOffset: number;

beforeEach(() => {
  missing = new Set();
  slideOffset = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const name = this.getAttribute("data-guide");
    const place = name && !missing.has(name) ? PLACES[name] : undefined;
    const box = place
      ? { ...place, left: place.left + (name?.startsWith("nav-") ? slideOffset : 0) }
      : { top: 0, left: 0, width: 0, height: 0 };
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box };
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  document.cookie = "pnc_guide_seen=; Max-Age=0; Path=/";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const hasSeenCookie = () => document.cookie.includes("pnc_guide_seen=1");
const spotlight = () => document.querySelector<HTMLElement>("[data-guide-spotlight]")!;
const spotlightBox = () => ({
  top: parseFloat(spotlight().style.top),
  left: parseFloat(spotlight().style.left),
  width: parseFloat(spotlight().style.width),
  height: parseFloat(spotlight().style.height),
});

/** The shell's real parts, so the tour has something to point at. */
function renderTour(options: { roles?: string[]; startOpen?: boolean } = {}) {
  const user = userEvent.setup();
  render(
    <GuideProvider roles={options.roles ?? MANAGER} startOpen={options.startOpen ?? true}>
      <AdminShell user={{ name: "Sok Dara", roles: options.roles ?? MANAGER }} signOutAction={async () => {}} campaigns={[]} canCreate>
        <ShowTourButton />
      </AdminShell>
    </GuideProvider>,
  );
  return { user };
}

async function firstStep() {
  return screen.findByRole("dialog", { name: manager[0].title });
}

describe("the welcome tour", () => {
  it("opens by itself on the first step, in the middle of the screen with nothing highlighted", async () => {
    renderTour();

    expect(await firstStep()).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${manager.length}`)).toBeInTheDocument();
    expect(spotlightBox().width).toBe(0);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("stays closed once it has been seen", () => {
    renderTour({ startOpen: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("[data-guide-spotlight]")).toBeNull();
  });

  it("moves the highlight onto the part of the screen each step is about, with a little air around it", async () => {
    const { user } = renderTour();
    await firstStep();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: manager[1].title });

    await waitFor(() => expect(spotlightBox()).toEqual({ top: 6, left: 294, width: 292, height: 56 }));

    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: manager[2].title });

    await waitFor(() => expect(spotlightBox()).toEqual({ top: 114, left: 10, width: 220, height: 56 }));
  });

  it("puts the card beside the highlight, not on top of it", async () => {
    const { user } = renderTour();
    await firstStep();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: manager[2].title });

    const card = screen.getByRole("dialog");
    await waitFor(() => expect(parseFloat(card.style.left)).toBeGreaterThan(PLACES["nav-campaigns"].left + PLACES["nav-campaigns"].width));
  });

  it("shows a step whose target is not on the screen in the middle, with nothing highlighted", async () => {
    missing.add("switcher");
    const { user } = renderTour();
    await firstStep();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("dialog", { name: manager[1].title });
    await waitFor(() => expect(spotlightBox().width).toBe(0));
  });

  it("goes back a step", async () => {
    const { user } = renderTour();
    await firstStep();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: manager[1].title });

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await firstStep()).toBeInTheDocument();
  });

  it("shows an officer the officer's steps", async () => {
    renderTour({ roles: OFFICER });

    expect(await screen.findByText(t.guide.tour.officer[0].body)).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${t.guide.tour.officer.length}`)).toBeInTheDocument();
  });

  it("only points at parts of the screen that the shell really has, for both roles", async () => {
    renderTour();
    await firstStep();

    const targets = [...t.guide.tour.manager, ...t.guide.tour.officer].flatMap((step) => ("target" in step && step.target ? [step.target] : []));

    for (const target of new Set(targets)) {
      expect(document.querySelector(`[data-guide="${target}"]`), target).not.toBeNull();
    }
  });
});

describe("closing the tour", () => {
  it.each([
    ["Skip the tour", "Skip the tour"],
    ["the close button", "Close"],
  ])("is remembered when closed with %s, from any step", async (_name, label) => {
    const { user } = renderTour();
    await firstStep();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(screen.getByRole("button", { name: label }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hasSeenCookie()).toBe(true);
  });

  it("is remembered when closed with Escape", async () => {
    const { user } = renderTour();
    await firstStep();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hasSeenCookie()).toBe(true);
  });

  it("offers Got it instead of Next, and no Skip, on the last step, and finishing remembers it", async () => {
    const { user } = renderTour();
    await firstStep();
    for (let i = 1; i < manager.length; i++) await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText(`Step ${manager.length} of ${manager.length}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip the tour" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hasSeenCookie()).toBe(true);
  });

  it("does not remember anything while it is simply open", async () => {
    renderTour();
    await firstStep();

    expect(hasSeenCookie()).toBe(false);
  });

  it("opens again from the first step when asked, after it was seen", async () => {
    const { user } = renderTour();
    await firstStep();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Skip the tour" }));

    await user.click(screen.getByRole("button", { name: "Show the tour again" }));

    expect(await firstStep()).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${manager.length}`)).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("starts with focus on Next and keeps Tab inside the card", async () => {
    const { user } = renderTour();
    await firstStep();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toHaveFocus());

    // Skip, Close and Next are the card's buttons; the page behind has more, and Tab must never reach them.
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    }
  });
});

describe("on a phone, where the sidebar is a drawer", () => {
  let asked: boolean[];
  const listener = (event: Event) => asked.push((event as CustomEvent<GuideNavDetail>).detail.open);

  beforeEach(() => {
    asked = [];
    window.addEventListener(GUIDE_NAV_EVENT, listener);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => window.removeEventListener(GUIDE_NAV_EVENT, listener));

  const drawerIsOpen = () => !document.querySelector("aside")!.className.includes("-translate-x-full");

  it("opens the drawer for a step about a sidebar link, closes it for the next step, and closes it with the tour", async () => {
    const { user } = renderTour();
    await firstStep();
    expect(asked.at(-1)).toBe(false);
    expect(drawerIsOpen()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Next" })); // the campaign switcher
    await screen.findByRole("dialog", { name: manager[1].title });
    expect(drawerIsOpen()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Next" })); // a sidebar link
    await screen.findByRole("dialog", { name: manager[2].title });
    expect(asked.at(-1)).toBe(true);
    await waitFor(() => expect(drawerIsOpen()).toBe(true));

    await user.click(screen.getByRole("button", { name: "Skip the tour" }));
    await waitFor(() => expect(drawerIsOpen()).toBe(false));
  });

  it("measures a sidebar link only after the drawer has finished sliding in, so the highlight never chases it", async () => {
    // The clock is moved by hand, so this does not depend on how fast the machine is.
    vi.useFakeTimers();
    try {
      const passTime = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
      const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
      renderTour();
      await passTime(0);
      next();
      await passTime(0);
      expect(spotlightBox()).toEqual({ top: 6, left: 294, width: 292, height: 56 });

      // The drawer is still off the screen when the step starts, and arrives some time later.
      slideOffset = -250;
      next();
      await passTime(100);
      expect(spotlightBox()).toEqual({ top: 6, left: 294, width: 292, height: 56 });

      slideOffset = 0;
      await passTime(250);
      expect(spotlightBox()).toEqual({ top: 114, left: 10, width: 220, height: 56 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("on a computer", () => {
  it("never asks for the drawer, which is always there", async () => {
    const asked: Event[] = [];
    const listener = (event: Event) => asked.push(event);
    window.addEventListener(GUIDE_NAV_EVENT, listener);
    const { user } = renderTour();
    await firstStep();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: manager[2].title });

    expect(asked).toHaveLength(0);
    window.removeEventListener(GUIDE_NAV_EVENT, listener);
  });
});
