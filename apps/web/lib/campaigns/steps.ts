import { t } from "@/lib/messages";
import type { StepKey } from "./types";

/**
 * Where each setup step's page lives. Step 5 has no page yet, so it has no href and shows
 * as "coming soon". When a step is built, add its route here and it becomes a working
 * link everywhere (the step list and the step tabs) with no other change.
 */
const STEP_HREFS: Record<StepKey, ((campaignId: string) => string) | null> = {
  CampaignInfo: (id) => `/admin/campaigns/${id}/info`,
  EligibilityRules: (id) => `/admin/campaigns/${id}/eligibility`,
  InformationSessions: (id) => `/admin/campaigns/${id}/sessions`,
  Candidates: (id) => `/admin/campaigns/${id}/candidates`,
  EntranceExam: null,
};

export function stepHref(step: StepKey, campaignId: string): string | null {
  return STEP_HREFS[step]?.(campaignId) ?? null;
}

export function stepTitle(step: StepKey): string {
  return t.steps[step].title;
}

export function stepDescription(step: StepKey): string {
  return t.steps[step].description;
}
