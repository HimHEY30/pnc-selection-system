import { describe, expect, it } from "vitest";
import { SPOTLIGHT_PADDING, placeCard, spotlightBox, type Box } from "./placement";

const VIEWPORT = { width: 1280, height: 800 };
const CARD = { width: 352, height: 200 };

describe("spotlightBox", () => {
  it("surrounds the target with some air", () => {
    const target: Box = { top: 100, left: 50, width: 200, height: 40 };

    expect(spotlightBox(target, VIEWPORT)).toEqual({
      top: 100 - SPOTLIGHT_PADDING,
      left: 50 - SPOTLIGHT_PADDING,
      width: 200 + SPOTLIGHT_PADDING * 2,
      height: 40 + SPOTLIGHT_PADDING * 2,
    });
  });

  it("collapses to a point in the middle when there is no target, so the screen simply dims", () => {
    expect(spotlightBox(null, VIEWPORT)).toEqual({ top: 400, left: 640, width: 0, height: 0 });
  });
});

describe("placeCard", () => {
  it("centres the card when there is no target", () => {
    expect(placeCard(null, CARD, VIEWPORT)).toEqual({ top: 300, left: 464 });
  });

  it("puts the card below a target in the top bar, lined up with its middle", () => {
    const switcher: Box = { top: 12, left: 300, width: 280, height: 44 };

    const { top, left } = placeCard(switcher, CARD, VIEWPORT, "bottom");

    expect(top).toBeGreaterThan(switcher.top + switcher.height);
    expect(left).toBe(300 + 140 - CARD.width / 2);
  });

  it("puts the card to the right of a sidebar link, lined up with its middle", () => {
    const link: Box = { top: 150, left: 16, width: 208, height: 44 };

    const { top, left } = placeCard(link, CARD, VIEWPORT, "right");

    expect(left).toBeGreaterThan(link.left + link.width);
    expect(top).toBe(150 + 22 - CARD.height / 2);
  });

  it("keeps the card on the screen when the target is at the edge", () => {
    const profile: Box = { top: 12, left: 1200, width: 70, height: 44 };

    const { left } = placeCard(profile, CARD, VIEWPORT, "bottom");

    expect(left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - 12);
    expect(left).toBeGreaterThanOrEqual(12);
  });

  it("moves to another side, without covering the target, when the preferred one has no room", () => {
    const low: Box = { top: 740, left: 300, width: 200, height: 44 };

    const { top, left } = placeCard(low, CARD, VIEWPORT, "bottom");

    const coversTarget = left < low.left + low.width && left + CARD.width > low.left && top < low.top + low.height && top + CARD.height > low.top;
    expect(coversTarget).toBe(false);
    expect(top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height - 12);
  });

  it("goes above the target when there is no room below or beside it", () => {
    const narrow = { width: 400, height: 800 };
    const low: Box = { top: 740, left: 60, width: 280, height: 44 };

    const { top } = placeCard(low, CARD, narrow, "bottom");

    expect(top + CARD.height).toBeLessThan(low.top);
  });

  it("falls back to the middle when the card fits on no side", () => {
    const huge: Box = { top: 0, left: 0, width: 1280, height: 800 };

    expect(placeCard(huge, CARD, VIEWPORT, "bottom")).toEqual({ top: 300, left: 464 });
  });

  it("never leaves the screen on a phone, where the card is nearly as wide as the screen", () => {
    const phone = { width: 390, height: 780 };
    const card = { width: 366, height: 220 };
    const link: Box = { top: 150, left: 16, width: 208, height: 44 };

    const { top, left } = placeCard(link, card, phone, "right");

    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + card.width).toBeLessThanOrEqual(phone.width - 12);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + card.height).toBeLessThanOrEqual(phone.height - 12);
  });
});
