export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Side = "top" | "bottom" | "left" | "right";

/** Space left around the highlighted element so the highlight does not hug it. */
export const SPOTLIGHT_PADDING = 6;
/** Space between the highlight and the card. */
const GAP = 12;
/** The card never gets closer than this to the edge of the screen. */
const MARGIN = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** The highlight's box: the target with some air, or a point in the middle when there is no target. */
export function spotlightBox(target: Box | null, viewport: Size): Box {
  if (!target) return { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 };
  return {
    top: target.top - SPOTLIGHT_PADDING,
    left: target.left - SPOTLIGHT_PADDING,
    width: target.width + SPOTLIGHT_PADDING * 2,
    height: target.height + SPOTLIGHT_PADDING * 2,
  };
}

/**
 * Where the card goes (its top-left corner). It sits on the preferred side of the highlight when it fits there, then
 * on any other side that fits, and across the highlight's axis it lines up with the target but stays on screen. With no
 * target, or no room on any side, it goes in the middle of the screen.
 */
export function placeCard(target: Box | null, card: Size, viewport: Size, preferred: Side = "bottom"): { top: number; left: number } {
  const middle = {
    top: clamp((viewport.height - card.height) / 2, MARGIN, viewport.height - card.height - MARGIN),
    left: clamp((viewport.width - card.width) / 2, MARGIN, viewport.width - card.width - MARGIN),
  };
  if (!target) return middle;

  const box = spotlightBox(target, viewport);
  const alignedLeft = clamp(target.left + target.width / 2 - card.width / 2, MARGIN, viewport.width - card.width - MARGIN);
  const alignedTop = clamp(target.top + target.height / 2 - card.height / 2, MARGIN, viewport.height - card.height - MARGIN);

  const candidates: Record<Side, { fits: boolean; top: number; left: number }> = {
    bottom: {
      fits: box.top + box.height + GAP + card.height + MARGIN <= viewport.height,
      top: box.top + box.height + GAP,
      left: alignedLeft,
    },
    top: { fits: box.top - GAP - card.height - MARGIN >= 0, top: box.top - GAP - card.height, left: alignedLeft },
    right: {
      fits: box.left + box.width + GAP + card.width + MARGIN <= viewport.width,
      left: box.left + box.width + GAP,
      top: alignedTop,
    },
    left: { fits: box.left - GAP - card.width - MARGIN >= 0, left: box.left - GAP - card.width, top: alignedTop },
  };

  const order: Side[] = [preferred, ...(["bottom", "right", "top", "left"] as Side[]).filter((side) => side !== preferred)];
  const side = order.find((s) => candidates[s].fits);
  return side ? { top: candidates[side].top, left: candidates[side].left } : middle;
}
