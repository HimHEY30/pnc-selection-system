"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import CreateCampaignDialog from "./CreateCampaignDialog";

type CreateCampaignContext = {
  /** Whether this user may create campaigns at all. Buttons are hidden when false. */
  canCreate: boolean;
  open: () => void;
};

const Context = createContext<CreateCampaignContext>({ canCreate: false, open: () => {} });

/**
 * Lets any button in the admin area (the empty state, the campaign switcher) open the
 * one "Create campaign" dialog without each owning a copy of it.
 */
export function CreateCampaignProvider({ canCreate, children }: { canCreate: boolean; children: ReactNode }) {
  const [openCount, setOpenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    // A new count remounts the dialog, so it always starts empty.
    setOpenCount((n) => n + 1);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ canCreate, open }), [canCreate, open]);

  return (
    <Context.Provider value={value}>
      {children}
      {canCreate && openCount > 0 && <CreateCampaignDialog key={openCount} open={isOpen} onClose={close} />}
    </Context.Provider>
  );
}

export function useCreateCampaign(): CreateCampaignContext {
  return useContext(Context);
}
