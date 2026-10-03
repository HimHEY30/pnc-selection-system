"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiRequest, ApiUnavailableError, type ApiProblem } from "@/lib/api/client";
import type {
  ActionResult,
  CampaignDetail,
  CampaignInfoInput,
  CopyPreview,
  CreateCampaignInput,
  CreatedCampaign,
} from "@/lib/campaigns/types";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";

// Server actions can be called by anyone who can reach the site, not only from our
// forms, so each one re-checks the session and the role before doing anything. The
// backend checks again; this just gives a clean message instead of a raw 403.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Request fields the forms show errors for. Anything else the backend reports
// (for example a body that failed to parse) is shown as a message above the form.
const FORM_FIELDS = new Set([
  "name",
  "academicYear",
  "description",
  "startMode",
  "startDate",
  "endDate",
  "expectedCandidates",
  "seatsAvailable",
  "provinceIds",
  "copyFrom.sourceCampaignId",
  "copyFrom.parts",
]);

async function requireManager(): Promise<ActionResult<never> | null> {
  const session = await auth();
  if (!session || !canManageCampaigns(session.roles)) {
    return { ok: false, message: t.errors.forbidden };
  }
  return null;
}

function toFailure(problem: ApiProblem): ActionResult<never> {
  if (problem.status === 403) return { ok: false, message: t.errors.forbidden };

  const fieldErrors: Record<string, string> = {};
  let message = problem.title || t.errors.generic;
  for (const [field, messages] of Object.entries(problem.fieldErrors ?? {})) {
    if (FORM_FIELDS.has(field) && messages[0]) {
      fieldErrors[field] = messages[0];
    } else if (messages[0]) {
      message = messages[0];
    }
  }

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, message, fieldErrors }
    : { ok: false, message };
}

async function call<T>(path: string, method: "POST" | "PUT", body: unknown) {
  try {
    return await apiRequest<T>(path, { method, body });
  } catch (error) {
    if (error instanceof ApiUnavailableError) return null;
    throw error;
  }
}

export async function createCampaignAction(
  input: CreateCampaignInput,
): Promise<ActionResult<CreatedCampaign>> {
  const denied = await requireManager();
  if (denied) return denied;
  if (input.startMode === "copy" && !(input.copyFrom && GUID.test(input.copyFrom.sourceCampaignId))) {
    return { ok: false, message: t.errors.generic };
  }

  // A copy's source and parts are only sent when copying, so a stray copyFrom never rides along with "scratch".
  const body = input.startMode === "copy" ? input : { ...input, copyFrom: undefined };
  const result = await call<CampaignDetail>("/api/campaigns", "POST", body);
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return toFailure(result.problem);

  // The campaign list in the top bar lives in the layout, so refresh it too.
  revalidatePath("/admin", "layout");
  return { ok: true, data: { id: result.data.id, copyResults: result.data.copyResults ?? null } };
}

/** What a campaign has that a new one can copy, with counts, for the "copy from" checklist. */
export async function loadCopyPreviewAction(sourceCampaignId: string): Promise<ActionResult<CopyPreview>> {
  const denied = await requireManager();
  if (denied) return denied;
  // The id goes into a URL path, so refuse anything that is not a GUID.
  if (!GUID.test(sourceCampaignId)) return { ok: false, message: t.errors.generic };

  try {
    const result = await apiRequest<CopyPreview>(`/api/campaigns/${sourceCampaignId}/copy-preview`, { method: "GET" });
    if (!result.ok) return toFailure(result.problem);
    return { ok: true, data: result.data };
  } catch (error) {
    if (error instanceof ApiUnavailableError) return { ok: false, message: t.errors.unavailable };
    throw error;
  }
}

export type SaveInfoData = Pick<CampaignDetail, "version" | "infoSavedAt" | "steps" | "progress">;

/** "draft" = Save draft, "complete" = Save and continue. */
export async function saveCampaignInfoAction(
  campaignId: string,
  mode: "draft" | "complete",
  input: CampaignInfoInput,
): Promise<ActionResult<SaveInfoData>> {
  const denied = await requireManager();
  if (denied) return denied;
  // The id goes into a URL path, so refuse anything that is not a GUID.
  if (!GUID.test(campaignId)) return { ok: false, message: t.errors.generic };

  const path = `/api/campaigns/${campaignId}/info${mode === "draft" ? "/draft" : ""}`;
  const result = await call<CampaignDetail>(path, "PUT", input);
  if (!result) return { ok: false, message: t.errors.unavailable };
  if (!result.ok) return toFailure(result.problem);

  revalidatePath("/admin", "layout");
  const { version, infoSavedAt, steps, progress } = result.data;
  return { ok: true, data: { version, infoSavedAt, steps, progress } };
}
