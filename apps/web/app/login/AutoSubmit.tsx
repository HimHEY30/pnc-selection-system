"use client";

import { useEffect, useRef } from "react";

// Fires once on mount to submit the (server-action) sign-in form without
// requiring a click, so an unauthenticated visitor lands on Keycloak's own
// login form almost immediately instead of pausing on this page.
export function AutoSubmit({ formId }: { formId: string }) {
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) {
      return;
    }
    submitted.current = true;
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }, [formId]);

  return null;
}
