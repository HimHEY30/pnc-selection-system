import { t } from "@/lib/messages";
import type { StepKey } from "./types";

/**
 * Where each setup step's page lives. Steps 4 and 5 have no page yet, so they have no href
 * and show as "coming soon". When a step is built, add its route here and it becomes
 * a working link everywhere (the step list and the step tabs) with no other change.
 */
const STEP_HREFS: Record<StepKey, ((campaignId: string) => string) | null> = {
  CampaignInfo: (id) => `/admin/campaigns/${id}/info`,
  EligibilityRules: (id) => `/admin/campaigns/${id}/eligibility`,
  InformationSessions: (id) => `/admin/campaigns/${id}/sessions`,
  Candidates: null,
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
