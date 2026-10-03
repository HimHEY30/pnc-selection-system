"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { seenCookie, tourFor } from "@/lib/guide/guide";
import GuideTour from "./GuideTour";

type GuideContext = {
  /** Opens the tour from its first step. */
  open: () => void;
};

const Context = createContext<GuideContext>({ open: () => {} });

/**
 * Owns the one welcome tour, so the Guide page can start it again. It opens by itself when
 * `startOpen` is true (this browser has not been shown it) and, however it is closed, remembers
 * that it was shown so it does not open by itself again.
 */
export function GuideProvider({ roles, startOpen, children }: { roles: readonly string[]; startOpen: boolean; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  // A new count remounts the tour, so it always starts on its first step.
  const [openCount, setOpenCount] = useState(0);

  const open = useCallback(() => {
    setOpenCount((n) => n + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    // Finishing and skipping are the same to us: the person has seen it.
    document.cookie = seenCookie();
    setIsOpen(false);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <Context.Provider value={value}>
      {children}
      <GuideTour key={openCount} open={isOpen} steps={tourFor(roles)} onClose={close} />
    </Context.Provider>
  );
}

export function useGuide(): GuideContext {
  return useContext(Context);
}
