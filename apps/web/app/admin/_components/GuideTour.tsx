"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import { GUIDE_NAV_EVENT, type GuideNavDetail, type TourStep } from "@/lib/guide/guide";
import { placeCard, spotlightBox, type Box, type Size } from "@/lib/guide/placement";
import { t } from "@/lib/messages";

type Props = {
  open: boolean;
  steps: readonly TourStep[];
  onClose: () => void;
};

const text = t.guide.tour;

/** The sidebar slides in over this long (see AdminShell), so a link inside it is measured after it has stopped. */
const DRAWER_MS = 320;
/** Below this width (Tailwind's `lg`) the sidebar is a drawer that is off the screen until opened. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const isNarrow = () => typeof window.matchMedia === "function" && !window.matchMedia(DESKTOP_QUERY).matches;
const askNav = (open: boolean) => window.dispatchEvent(new CustomEvent<GuideNavDetail>(GUIDE_NAV_EVENT, { detail: { open } }));

/** What the highlight and the card are placed against: the target's box (null when there is none) and the screen. */
type View = { target: Box | null; viewport: Size };

/**
 * The welcome tour. The screen dims, a highlight glides to the real part of the screen each step is about, and a card
 * next to it says what it is for. A step with no target, or whose target is not on the screen, is shown in the middle.
 * Closing it at any step is skipping it. Mounted only while open, so it always starts on the first step.
 */
export default function GuideTour({ open, steps, onClose }: Props) {
  return open ? <Tour steps={steps} onClose={onClose} /> : null;
}

function Tour({ steps, onClose }: Omit<Props, "open">) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [cardAt, setCardAt] = useState<{ top: number; left: number } | null>(null);
  // The card only glides once it has a first place, so it does not fly in from the corner.
  const [settled, setSettled] = useState(false);

  // Find the step's target and keep measuring it while it can move.
  useEffect(() => {
    if (!step) return;
    const targetName = step.target;
    const element = targetName ? document.querySelector<HTMLElement>(`[data-guide="${targetName}"]`) : null;
    const inDrawer = targetName?.startsWith("nav-") ?? false;
    const drawerInTheWay = isNarrow();
    if (drawerInTheWay) askNav(inDrawer);

    const measure = () => {
      const rect = element?.getBoundingClientRect();
      const found = rect && rect.width > 0 && rect.height > 0 ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null;
      setView({ target: found, viewport: { width: window.innerWidth, height: window.innerHeight } });
    };

    element?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const timer = window.setTimeout(measure, drawerInTheWay && inDrawer ? DRAWER_MS : 0);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Put the card next to the highlight. Layout effect, so it is placed before the screen is painted.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!view || !card) return;
    setCardAt(placeCard(view.target, { width: card.offsetWidth, height: card.offsetHeight }, view.viewport, step?.side));
  }, [view, step]);

  useEffect(() => {
    if (!cardAt) return;
    const frame = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [cardAt]);

  // Keyboard: focus starts on the primary button and stays inside the card; Escape skips the tour.
  const ready = view !== null;
  useEffect(() => {
    if (ready) nextRef.current?.focus();
  }, [ready, index]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      const first = buttons[0];
      const end = buttons[buttons.length - 1];
      if (!first || !end) return;
      const active = document.activeElement;
      if (!cardRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && active === end) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      before?.focus?.();
    };
  }, [onClose]);

  // A drawer the tour opened is closed again with the tour.
  useEffect(
    () => () => {
      if (isNarrow()) askNav(false);
    },
    [],
  );

  if (!step || !view) return null;
  const spot = spotlightBox(view.target, view.viewport);

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Catches clicks, so the page behind cannot be used while the tour is open. */}
      <div className="absolute inset-0" aria-hidden="true" />

      {/* The highlight: a box over the target whose huge shadow dims everything else. It glides between steps. */}
      <div
        aria-hidden="true"
        data-guide-spotlight=""
        className={`pointer-events-none absolute rounded-xl shadow-[0_0_0_9999px_rgb(27_39_51/0.6)] transition-[top,left,width,height] duration-300 ease-out ${
          view.target ? "ring-2 ring-brand-blue" : ""
        }`}
        style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl bg-surface p-5 text-ink shadow-xl ${
          settled ? "transition-[top,left] duration-300 ease-out" : ""
        }`}
        style={{ top: cardAt?.top ?? 0, left: cardAt?.left ?? 0, visibility: cardAt ? "visible" : "hidden" }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{text.stepOf(index + 1, steps.length)}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="-mr-2 -mt-1 rounded-lg p-1.5 text-ink-muted transition hover:bg-canvas focus-ring"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-2">
          <ProgressBar total={steps.length} complete={index + 1} inProgress={0} label={text.stepOf(index + 1, steps.length)} />
        </div>

        {/* Read out when the step changes, since focus stays on the button. */}
        <div aria-live="polite" className="mt-4">
          <h2 id={titleId} className="text-lg font-bold">
            {step.title}
          </h2>
          <p id={bodyId} className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
            {step.body}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {last ? (
            <span />
          ) : (
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-2 text-sm font-semibold text-ink-muted transition hover:text-ink focus-ring">
              {text.skip}
            </button>
          )}
          <div className="flex gap-3">
            {index > 0 && <Button onClick={() => setIndex(index - 1)}>{text.back}</Button>}
            <Button ref={nextRef} variant="primary" onClick={last ? onClose : () => setIndex(index + 1)}>
              {last ? text.done : text.next}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
