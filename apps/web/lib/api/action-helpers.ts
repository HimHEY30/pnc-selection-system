import "server-only";
import { auth } from "@/auth";
import { apiRequest, ApiUnavailableError, type ApiProblem, type ApiResult } from "@/lib/api/client";
import type { ActionResult } from "@/lib/campaigns/types";
import { t } from "@/lib/messages";

// Small pieces shared by the server actions of the setup steps.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id goes into a URL path, so refuse anything that is not a GUID. */
export const isGuid = (value: string): boolean => GUID.test(value);

/**
 * Server actions can be called by anyone who can reach the site, not only from our forms, so each
 * one re-checks the session and the role. Returns a failure to hand back, or null when allowed.
 * The backend checks again; this just gives a clean message instead of a raw 403.
 */
export async function requireRole(allowed: (roles: readonly string[]) => boolean): Promise<ActionResult<never> | null> {
  const session = await auth();
  if (!session || !allowed(session.roles)) {
    return { ok: false, message: t.errors.forbidden };
  }
  return null;
}

/** Calls the backend. Returns null (not a throw) when it cannot be reached, so the action can say so. */
export async function callApi<T>(path: string, method: "GET" | "POST" | "PUT", body?: unknown): Promise<ApiResult<T> | null> {
  try {
    return await apiRequest<T>(path, { method, body });
  } catch (error) {
    if (error instanceof ApiUnavailableError) return null;
    throw error;
  }
}

/**
 * Turns a backend problem into what a form needs: a message, and the first message for each
 * input the backend named (keys like "rules.{id}.values", passed through as they are).
 */
export function problemToFailure(problem: ApiProblem): ActionResult<never> {
  if (problem.status === 403) return { ok: false, message: t.errors.forbidden };

  const fieldErrors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(problem.fieldErrors ?? {})) {
    if (messages[0]) fieldErrors[key] = messages[0];
  }

  const message = problem.title || t.errors.generic;
  return Object.keys(fieldErrors).length > 0 ? { ok: false, message, fieldErrors } : { ok: false, message };
}
