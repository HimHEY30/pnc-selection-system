import { needsAttention, type AttentionKind } from "@/lib/sessions/attention";
import type { InformationSession, SessionSummary } from "@/lib/sessions/types";
import { demoSessionsAssistant } from "./demoSessionsAssistant";

// The sessions page's AI assistant, as the screen sees it. Same shape as the candidate assistant (assistant.ts): the
// screen knows only this interface, never a provider.
//
//   SessionsAssistant UI  ->  SessionsAssistantService  ->  (an approved AI endpoint)  ->  AI provider
//
// No AI backend exists in this project yet, so the one implementation is `demoSessionsAssistant`: fixed, rule-based
// answers that run in the browser and are labelled "Demo" on screen. It is not an AI and must not be presented as one.

export type SessionsIntent = "summarize" | "needs-attention" | "next-step" | "explain-statuses" | "ask";

/**
 * Everything the assistant is allowed to know, and nothing else: counts. No session title, venue, link, note, host or
 * staff name, phone or email, and no attendance per session. A real service must be given this object and nothing
 * wider; widen it here, deliberately, if a feature truly needs more.
 */
export type SessionsContext = {
  campaignStatus: "Draft" | "Active" | "Closed";
  /** False once the campaign is closed: details cannot change, but the numbers still can. */
  isEditable: boolean;
  /** Whether the person may add and change sessions, so advice never tells an officer to do what they cannot. */
  canManage: boolean;
  summary: SessionSummary;
  attention: { kind: AttentionKind; count: number }[];
};

export type SessionsRequest = {
  intent: SessionsIntent;
  /** Only for intent "ask": what the person typed. */
  question?: string;
  context: SessionsContext;
};

export type SessionsReply = { text: string };

export interface SessionsAssistantService {
  /** "demo" while answers are canned; "live" once the service is connected to a real AI endpoint. */
  readonly mode: "demo" | "live";
  /** Rejects when the request fails. Honour `signal` so closing the panel can cancel the request. */
  ask(request: SessionsRequest, signal?: AbortSignal): Promise<SessionsReply>;
}

type ContextInput = {
  campaignStatus: SessionsContext["campaignStatus"];
  isEditable: boolean;
  canManage: boolean;
  summary: SessionSummary;
  sessions: InformationSession[];
  today: string;
};

/** The context for the page as it is now. This is the single place where session data is chosen for the assistant. */
export function buildSessionsContext({ campaignStatus, isEditable, canManage, summary, sessions, today }: ContextInput): SessionsContext {
  return {
    campaignStatus,
    isEditable,
    canManage,
    summary,
    attention: needsAttention(sessions, today).map(({ kind, count }) => ({ kind, count })),
  };
}

/**
 * The service the page uses. To connect a real AI: write a `SessionsAssistantService` that sends the request to an
 * approved server route (the browser must never hold a provider key) and return it here with mode "live".
 */
export const sessionsAssistant: SessionsAssistantService = demoSessionsAssistant;
