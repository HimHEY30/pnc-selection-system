import type { CandidateField, CandidateForm } from "@/lib/candidates/form";
import { formProgress, type SectionId } from "@/lib/candidates/progress";
import { demoAssistant } from "./demoAssistant";

// The candidate form's AI assistant, as the screen sees it. The screen knows only this interface, never a provider:
//
//   AIAssistant UI  ->  CandidateAssistantService  ->  (an approved AI endpoint)  ->  AI provider
//
// No AI backend exists in this project yet, so the one implementation is `demoAssistant`: fixed, rule-based answers
// that run in the browser and are labelled "Demo" on screen. It is not an AI and must not be presented as one.

export type AssistantIntent = "explain-required" | "check-missing" | "summarize" | "next-step" | "ask";

/**
 * Everything the assistant is allowed to know, and nothing else. Field names and counts only: no name, phone number,
 * date of birth, street-level address, school, NGO name or id, and no login or session information. A real service
 * must be given this object and nothing wider; widen it here, deliberately, if a feature truly needs more.
 */
export type AssistantContext = {
  mode: "create" | "edit";
  percent: number;
  /** The section the person still has to finish first, or null when the form can be saved. */
  currentSection: SectionId | null;
  sections: { id: SectionId; required: number; missing: CandidateField[] }[];
  missing: CandidateField[];
  /** The only values that leave the form, chosen because a summary is not useful without them. */
  summary: { province: string | null; hasSchool: boolean; hasSession: boolean; hasNgoSupport: boolean };
};

export type AssistantRequest = {
  intent: AssistantIntent;
  /** Only for intent "ask": what the person typed. */
  question?: string;
  context: AssistantContext;
};

export type AssistantReply = { text: string };

export interface CandidateAssistantService {
  /** "demo" while answers are canned; "live" once the service is connected to a real AI endpoint. */
  readonly mode: "demo" | "live";
  /** Rejects when the request fails. Honour `signal` so closing the panel can cancel the request. */
  ask(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantReply>;
}

/** The context for the form as it is now. This is the single place where form data is chosen for the assistant. */
export function buildAssistantContext(form: CandidateForm, mode: "create" | "edit"): AssistantContext {
  const progress = formProgress(form);
  return {
    mode,
    percent: progress.percent,
    currentSection: progress.current,
    sections: progress.sections.map(({ id, required, missing }) => ({ id, required, missing })),
    missing: progress.missing,
    summary: {
      province: form.address.province?.name?.trim() || null,
      hasSchool: form.school !== "",
      hasSession: form.sessionId !== "",
      hasNgoSupport: form.ngo === "yes",
    },
  };
}

/**
 * The service the form uses. To connect a real AI: write a `CandidateAssistantService` that sends the request to an
 * approved server route (the browser must never hold a provider key) and return it here with mode "live".
 */
export const candidateAssistant: CandidateAssistantService = demoAssistant;
