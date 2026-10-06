import { t } from "@/lib/messages";
import type { SessionsContext, SessionsReply, SessionsRequest, SessionsAssistantService } from "./sessionsAssistant";

// DEMO ONLY. Fixed answers built from the page's own counts, so the assistant can be used and reviewed before a real
// AI endpoint exists. Delete this file and point `sessionsAssistant` (sessionsAssistant.ts) at a real service to go live.

const text = t.sessions;

const SENTENCE = {
  "missing-attendance": text.attention.missingAttendance,
  unscheduled: text.attention.unscheduled,
  "missing-expected": text.attention.missingExpected,
} as const;

function summarize({ summary }: SessionsContext): string {
  if (summary.total === 0) return "No sessions have been planned for this campaign yet.";
  const parts = [`${summary.total} ${summary.total === 1 ? "session" : "sessions"}: ${text.summary.sessionsDetail(summary.planned, summary.done, summary.cancelled, summary.unscheduled)}.`];
  parts.push(`${summary.expectedCandidates} candidates are expected across sessions that are not cancelled.`);
  parts.push(summary.actualTotal > 0 ? `${summary.actualTotal} have attended so far (${summary.actualFemale} female, ${summary.actualMale} male).` : "No attendance has been entered yet.");
  return parts.join(" ");
}

function needsAttention({ attention }: SessionsContext): string {
  if (attention.length === 0) return text.attention.allGood;
  return attention.map((item) => `• ${SENTENCE[item.kind](item.count)}`).join("\n");
}

function nextStep(context: SessionsContext): string {
  const { attention, summary, canManage, isEditable } = context;
  if (summary.total === 0) {
    return canManage && isEditable ? "Add the first session with the Add session button." : "Nothing to do yet: no sessions have been planned.";
  }
  const first = attention[0];
  if (!first) return "Nothing is waiting on you. Check back after the next session takes place.";
  switch (first.kind) {
    case "missing-attendance":
      return "Start with the sessions that have already taken place: open each one's menu, choose Enter numbers and record who came. Saving marks it as done.";
    case "unscheduled":
      return canManage && isEditable
        ? "Schedule the copied sessions: open each one's menu, choose Schedule, and give it a date, times, a person responsible and a host."
        : "Some copied sessions still need a date and host. A selection manager or system admin can schedule them.";
    case "missing-expected":
      return "Enter how many candidates you expect for the coming sessions: open each one's menu and choose Enter numbers.";
  }
}

function explainStatuses(): string {
  return [
    "• Planned: scheduled, and not yet held.",
    "• Done: the session took place and the attendance was entered.",
    "• Not scheduled: copied from another campaign, still needing a date, host and person responsible.",
    "• Cancelled: called off, with a reason everyone can see.",
  ].join("\n");
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

export const demoSessionsAssistant: SessionsAssistantService = {
  mode: "demo",

  async ask({ intent, context }: SessionsRequest, signal?: AbortSignal): Promise<SessionsReply> {
    await wait(signal);
    switch (intent) {
      case "summarize":
        return { text: summarize(context) };
      case "needs-attention":
        return { text: needsAttention(context) };
      case "next-step":
        return { text: nextStep(context) };
      case "explain-statuses":
        return { text: explainStatuses() };
      case "ask":
        return { text: "The demo assistant can only answer the four questions above. Free-form questions need the real AI service, which is not connected yet." };
    }
  },
};
