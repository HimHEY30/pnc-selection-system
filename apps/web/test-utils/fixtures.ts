import type { CampaignDetail, CampaignStep, Province, StepStatus } from "@/lib/campaigns/types";
import { STEP_KEYS } from "@/lib/campaigns/types";

/** A handful of the real provinces, same ids as the backend seed. */
export const PROVINCES: Province[] = [
  { id: 2, code: "KH-2", name: "Battambang" },
  { id: 3, code: "KH-3", name: "Kampong Cham" },
  { id: 12, code: "KH-12", name: "Phnom Penh" },
  { id: 17, code: "KH-17", name: "Siem Reap" },
  { id: 21, code: "KH-21", name: "Takeo" },
];

export function makeSteps(info: StepStatus = "InProgress"): CampaignStep[] {
  return STEP_KEYS.map((step, i) => ({
    step,
    order: i + 1,
    status: step === "CampaignInfo" ? info : "NotStarted",
  }));
}

/** A freshly created campaign (only name and year set), like the backend returns it. */
export function makeCampaign(overrides: Partial<CampaignDetail> = {}): CampaignDetail {
  const steps = overrides.steps ?? makeSteps();
  return {
    id: "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
    name: "Selection 2027",
    academicYear: "2027–2028",
    description: "Yearly selection of students for the PNC IT training programme.",
    status: "Draft",
    startDate: null,
    endDate: null,
    expectedCandidates: null,
    seatsAvailable: null,
    provinceIds: [],
    createdByName: "Sreyneang Chea",
    createdAt: "2026-10-03T02:00:00Z",
    updatedAt: "2026-10-03T02:12:00Z",
    // 02:12 UTC is 9:12 AM in Cambodia (UTC+7), the time shown in the design.
    infoSavedAt: "2026-10-03T02:12:00Z",
    version: 7,
    steps,
    progress: {
      total: steps.length,
      complete: steps.filter((s) => s.status === "Complete").length,
      inProgress: steps.filter((s) => s.status === "InProgress").length,
    },
    canActivate: false,
    ...overrides,
  };
}
