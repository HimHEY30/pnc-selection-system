"use client";

import { useCallback, useRef, useState } from "react";
import { useDismiss } from "@/lib/hooks/useDismiss";
import { t } from "@/lib/messages";

type Props = {
  name: string;
  email?: string | null;
  roles: string[];
  // Server action passed down from the layout (needs server-only auth code).
  signOutAction: () => Promise<void>;
};

// Avatar + name/role block (top right) with a dropdown holding Logout.
export default function ProfileMenu({ name, email, roles, signOutAction }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  const roleLabel = roles.map((r) => t.roles[r]).find(Boolean) ?? roles[0];

  return (
    <div ref={ref} data-guide="profile" className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-lg p-1 pr-2 text-left transition hover:bg-canvas focus-ring"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange text-sm font-bold text-ink">
          {initials || "?"}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-semibold leading-tight text-ink">{name}</span>
          {roleLabel && <span className="block max-w-40 truncate text-xs text-ink-muted">{roleLabel}</span>}
        </span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            {email && <p className="truncate text-xs text-ink-muted">{email}</p>}
          </div>
          <form action={signOutAction} className="border-t border-line pt-1">
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-danger-text hover:bg-canvas focus-ring"
            >
              {t.profile.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
