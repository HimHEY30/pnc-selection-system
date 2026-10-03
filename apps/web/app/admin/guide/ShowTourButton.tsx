"use client";

import Button from "@/components/ui/Button";
import { t } from "@/lib/messages";
import { useGuide } from "../_components/GuideProvider";

/** Starts the welcome tour again from its first step. */
export default function ShowTourButton() {
  const { open } = useGuide();
  return (
    <Button variant="primary" onClick={open}>
      {t.guide.page.showTour}
    </Button>
  );
}
