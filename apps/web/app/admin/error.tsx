"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import { t } from "@/lib/messages";

// Catches anything a page under /admin throws - most often the backend being
// unreachable. The user keeps the sidebar and top bar and can retry in place.
// (In this Next.js version the recovery callback is `retry`, not `reset`.)
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-line bg-surface px-8 py-14 text-center">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger-text">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v5M12 16.5v.01" />
          <circle cx="12" cy="12" r="9.5" />
        </svg>
      </span>
      <h1 className="mt-5 text-xl font-bold text-ink">{t.errors.pageTitle}</h1>
      <p className="mt-2 text-[15px] text-ink-muted">{t.errors.pageBody}</p>
      <Button variant="primary" className="mt-6" onClick={() => retry()}>
        {t.common.tryAgain}
      </Button>
      {error.digest && <p className="mt-4 text-xs text-ink-muted">Reference: {error.digest}</p>}
    </div>
  );
}
