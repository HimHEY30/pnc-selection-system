"use client";

import Button from "@/components/ui/Button";
import { t } from "@/lib/messages";
import { useCreateCampaign } from "./CreateCampaignProvider";

/** The "+ Create campaign" button. Renders nothing for users who may not create campaigns. */
export default function CreateCampaignButton({ size = "lg" }: { size?: "md" | "lg" }) {
  const { canCreate, open } = useCreateCampaign();
  if (!canCreate) return null;

  return (
    <Button variant="primary" size={size} onClick={open}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {t.dashboard.create}
    </Button>
  );
}
