import { useCallback, useEffect, useState } from "react";

/**
 * Warns before the user walks away from a page with unsaved changes.
 *
 * - Closing the tab, reloading or typing another address: the browser's own "leave site?"
 *   prompt (beforeunload). The browser decides its wording.
 * - Clicking a link to another page of this app: the click is stopped and `pendingHref` is set,
 *   so the page can ask in its own dialog and then call `leave()` or `stay()`.
 *
 * Not covered: the browser's Back button inside the app. Next.js offers no way to stop that
 * navigation, so it leaves without asking.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // some browsers only show the prompt when this is set
    };

    const onClick = (event: MouseEvent) => {
      // Let the browser handle new-tab clicks, downloads and anything already handled.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // leaving the site: beforeunload asks
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page

      // In the capture phase, so this runs before the router sees the click.
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const stay = useCallback(() => setPendingHref(null), []);

  /** Clears the pending link and returns it, so the caller can navigate there. */
  const leave = useCallback((): string | null => {
    const href = pendingHref;
    setPendingHref(null);
    return href;
  }, [pendingHref]);

  return { pendingHref, stay, leave };
}
