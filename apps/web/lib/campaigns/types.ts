// Shapes of the backend's campaign API (see Campaigns.Application/Contracts.cs).
// Safe to import from client components - this file has no server-only code.

export type CampaignStatus = "Draft" | "Active" | "Closed";
export type StepStatus = "NotStarted" | "InProgress" | "Complete";

export type StepKey =
  | "CampaignInfo"
  | "EligibilityRules"
  | "InformationSessions"
  | "Candidates"
  | "EntranceExam";

/** The five steps in display order. */
export const STEP_KEYS: readonly StepKey[] = [
  "CampaignInfo",
  "EligibilityRules",
  "InformationSessions",
  "Candidates",
  "EntranceExam",
];

export type CampaignStep = { step: StepKey; order: number; status: StepStatus };

export type CampaignSummary = {
  id: string;
  name: string;
  academicYear: string;
  status: CampaignStatus;
  createdAt: string;
};

export type CampaignDetail = {
  id: string;
  name: string;
  academicYear: string;
  description: string | null;
  status: CampaignStatus;
  /** ISO date, yyyy-mm-dd. */
  startDate: string | null;
  endDate: string | null;
  expectedCandidates: number | null;
  seatsAvailable: number | null;
  provinceIds: number[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** When Step 1 was last saved. */
  infoSavedAt: string;
  /** Concurrency token: send it back when saving so we can detect a clash. */
  version: number;
  steps: CampaignStep[];
  progress: { total: number; complete: number; inProgress: number };
  canActivate: boolean;
};

export type Province = { id: number; code: string; name: string };

/** Body of the create request. */
export type CreateCampaignInput = {
  name: string;
  academicYear: string;
  description: string;
  startMode: "scratch" | "copy";
};

/** Body of both Step 1 saves. */
export type CampaignInfoInput = {
  name: string;
  academicYear: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  expectedCandidates: number | null;
  seatsAvailable: number | null;
  provinceIds: number[];
  version: number | null;
};

/** What the server actions return to the forms. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };
