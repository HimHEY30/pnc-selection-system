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
  /** Only in the answer to creating a campaign from a copy: how each part went. */
  copyResults?: CopyPartResult[] | null;
};

export type Province = { id: number; code: string; name: string };

/** The parts of a campaign that can be copied into a new one, in the order they are copied. */
export type CopyPartKey = "Provinces" | "Details" | "EligibilityRules" | "InformationSessions";

export const COPY_PART_KEYS: readonly CopyPartKey[] = ["Provinces", "Details", "EligibilityRules", "InformationSessions"];

/** What the source campaign has for one part, from GET /api/campaigns/{id}/copy-preview. */
export type CopyPartPreview = {
  key: CopyPartKey;
  label: string;
  /** False when there is nothing to copy (or it cannot be copied yet): the box is shown but cannot be ticked. */
  available: boolean;
  count: number;
  note: string | null;
};

export type CopyPreview = { sourceCampaignId: string; name: string; academicYear: string; parts: CopyPartPreview[] };

/** How one part went when a campaign was created from a copy. A part that did not copy is reported, never dropped. */
export type CopyPartResult = {
  part: CopyPartKey;
  outcome: "Copied" | "Partly" | "Failed";
  count: number;
  issues: string[];
};

/** Which campaign to copy from and which parts, as the create request carries them. */
export type CopyFromInput = { sourceCampaignId: string; parts: CopyPartKey[] };

/** Body of the create request. `copyFrom` is needed (and only used) when `startMode` is "copy". */
export type CreateCampaignInput = {
  name: string;
  academicYear: string;
  description: string;
  startMode: "scratch" | "copy";
  copyFrom?: CopyFromInput;
};

/** What creating a campaign gives back: where it is, and for a copy how each part went. */
export type CreatedCampaign = { id: string; copyResults: CopyPartResult[] | null };

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
