import { hasTakenPlace } from "./format";
import type { InformationSession } from "./types";

// What on a campaign's sessions page needs someone to act, worked out from the sessions themselves. Nothing here is
// stored or guessed: each item is a count of sessions in a state the page already shows, so the person can find them.

export type AttentionKind = "unscheduled" | "missing-attendance" | "missing-expected";

export type AttentionItem = {
  kind: AttentionKind;
  count: number;
  /** Titles of up to three of those sessions, soonest or oldest first as the kind suggests, for a short example list. */
  examples: string[];
};

const EXAMPLES = 3;

/**
 * The things to do next, most urgent first. A kind with nothing to do is left out, so an empty result means the
 * sessions are in order.
 *
 * - unscheduled: copies that still need a date, times, host and person responsible.
 * - missing-attendance: planned sessions whose day has come but nobody has said who attended.
 * - missing-expected: planned sessions still ahead with no expected number of candidates.
 */
export function needsAttention(sessions: InformationSession[], today: string): AttentionItem[] {
  const byDate = (a: InformationSession, b: InformationSession) => (a.date ?? "").localeCompare(b.date ?? "");

  const groups: [AttentionKind, InformationSession[]][] = [
    ["missing-attendance", sessions.filter((s) => s.status === "Planned" && hasTakenPlace(s, today) && s.attendance === null).sort(byDate)],
    ["unscheduled", sessions.filter((s) => s.status === "Unscheduled").sort((a, b) => a.title.localeCompare(b.title))],
    [
      "missing-expected",
      sessions.filter((s) => s.status === "Planned" && s.date !== null && !hasTakenPlace(s, today) && s.expectedCandidates === null).sort(byDate),
    ],
  ];

  return groups
    .filter(([, found]) => found.length > 0)
    .map(([kind, found]) => ({ kind, count: found.length, examples: found.slice(0, EXAMPLES).map((s) => s.title) }));
}
