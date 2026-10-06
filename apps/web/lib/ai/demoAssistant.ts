import type { CandidateField } from "@/lib/candidates/form";
import type { SectionId } from "@/lib/candidates/progress";
import { t } from "@/lib/messages";
import type { AssistantContext, AssistantReply, AssistantRequest, CandidateAssistantService } from "./assistant";

// DEMO ONLY. Fixed answers built from the form's own checks, so the assistant panel can be used and reviewed before a
// real AI endpoint exists. Delete this file and point `candidateAssistant` (assistant.ts) at a real service to go live.

const form = t.candidates.form;

const FIELD_LABEL: Record<CandidateField, string> = {
  nameKm: form.nameKm,
  nameEn: form.nameEn,
  gender: form.gender,
  dateOfBirth: form.dateOfBirth,
  phone: form.phone,
  province: t.candidates.address.province,
  district: t.candidates.address.district,
  commune: t.candidates.address.commune,
  village: t.candidates.address.village,
  school: form.school,
  schoolName: form.schoolName,
  sessionId: form.session,
  ngoName: form.ngoName,
};

const SECTION_LABEL: Record<SectionId, string> = form.progress.sections;

const list = (fields: CandidateField[]) => fields.map((f) => FIELD_LABEL[f]).join(", ");

function explainRequired(): string {
  return [
    "To save a candidate you need:",
    `• ${SECTION_LABEL.person}: both names, gender, date of birth and a phone number.`,
    "• Location: the province, district and commune. The village is optional.",
    "• Education: the high school, or Other with the school's name typed in.",
    "• Support: the NGO's name, but only if the candidate is supported by one.",
    "The information session is optional.",
  ].join("\n");
}

function checkMissing(context: AssistantContext): string {
  if (context.missing.length === 0) return "Nothing required is missing. The form is ready to save.";
  const lines = context.sections.filter((s) => s.missing.length > 0).map((s) => `• ${SECTION_LABEL[s.id]}: ${list(s.missing)}`);
  return [`${context.missing.length} required ${context.missing.length === 1 ? "field is" : "fields are"} still empty:`, ...lines].join("\n");
}

function nextStep(context: AssistantContext): string {
  const section = context.sections.find((s) => s.id === context.currentSection);
  if (!section) return "Everything required is filled in. Check the details once more, then save.";
  return `Next, finish "${SECTION_LABEL[section.id]}". Start with ${FIELD_LABEL[section.missing[0]]}.`;
}

function summarize(context: AssistantContext): string {
  const { summary } = context;
  const parts = [
    summary.province ? `Lives in ${summary.province}.` : "No province chosen yet.",
    summary.hasSchool ? "A high school is recorded." : "No high school yet.",
    summary.hasSession ? "Linked to an information session." : "Not linked to an information session.",
    summary.hasNgoSupport ? "Supported by an NGO." : "No NGO support.",
  ];
  return `${parts.join(" ")} The record is ${context.percent}% complete.`;
}

/** Lets the panel show its thinking state; a real call takes longer than this. */
const DELAY_MS = 600;

const wait = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, DELAY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export const demoAssistant: CandidateAssistantService = {
  mode: "demo",

  async ask({ intent, context }: AssistantRequest, signal?: AbortSignal): Promise<AssistantReply> {
    await wait(signal);
    switch (intent) {
      case "explain-required":
        return { text: explainRequired() };
      case "check-missing":
        return { text: checkMissing(context) };
      case "next-step":
        return { text: nextStep(context) };
      case "summarize":
        return { text: summarize(context) };
      case "ask":
        return { text: "The demo assistant can only answer the four questions above. Free-form questions need the real AI service, which is not connected yet." };
    }
  },
};
