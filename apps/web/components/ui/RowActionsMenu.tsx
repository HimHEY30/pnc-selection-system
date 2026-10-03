"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDismiss } from "@/lib/hooks/useDismiss";

export type RowAction = { label: string; onSelect: () => void };

type Props = {
  /** Names the button for assistive technology, e.g. "Actions for Open day". */
  label: string;
  actions: RowAction[];
};

const MENU_WIDTH = 208;
// Room the menu needs below the button before it opens upwards instead.
const MENU_HEIGHT_GUESS = 160;

/**
 * A three-dots button that drops a menu of actions for one table row. The menu is positioned against the viewport
 * (not the row) so the table's horizontal scroll area cannot clip it, and it closes on Escape, an outside click,
 * scrolling or resizing, since it would otherwise stay behind at the old position.
 */
export default function RowActionsMenu({ label, actions }: Props) {
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = position !== null;

  const close = useCallback(() => setPosition(null), []);
  useDismiss(open, wrapRef, close);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  if (actions.length === 0) return null;

  const toggle = () => {
    if (open) return close();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, rect.right - MENU_WIDTH);
    const opensUp = window.innerHeight - rect.bottom < MENU_HEIGHT_GUESS && rect.top > MENU_HEIGHT_GUESS;
    setPosition(opensUp ? { bottom: window.innerHeight - rect.top + 4, left } : { top: rect.bottom + 4, left });
  };

  return (
    <div ref={wrapRef} className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Escape") buttonRef.current?.focus();
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-ink-muted transition hover:bg-canvas hover:text-ink focus-ring"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {position && (
        <div
          role="menu"
          aria-label={label}
          style={{ ...position, width: MENU_WIDTH }}
          className="fixed z-50 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                action.onSelect();
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-canvas focus-ring"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
