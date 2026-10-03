import { useEffect, type RefObject } from "react";

/**
 * Calls `onDismiss` when the user presses Escape or clicks/taps outside `ref`, while
 * `active` is true. Used by menus and popovers.
 */
export function useDismiss(active: boolean, ref: RefObject<HTMLElement | null>, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, ref, onDismiss]);
}
