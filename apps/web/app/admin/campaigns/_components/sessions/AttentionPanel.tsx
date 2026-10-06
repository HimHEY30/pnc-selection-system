import { needsAttention, type AttentionItem } from "@/lib/sessions/attention";
import type { InformationSession } from "@/lib/sessions/types";
import { t } from "@/lib/messages";

const text = t.sessions.attention;

const SENTENCE: Record<AttentionItem["kind"], (count: number) => string> = {
  "missing-attendance": text.missingAttendance,
  unscheduled: text.unscheduled,
  "missing-expected": text.missingExpected,
};

/**
 * What to do next on this campaign's sessions, from the sessions themselves. The orange mark is a quiet accent, never
 * the only signal: every row says in words what is wrong and names the sessions.
 */
export default function AttentionPanel({ sessions, today }: { sessions: InformationSession[]; today: string }) {
  const items = needsAttention(sessions, today);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">{text.allGood}</p>
    );
  }

  return (
    <section aria-labelledby="attention-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="attention-title" className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <span aria-hidden="true" className="size-2 rounded-full bg-brand-orange" />
        {text.title}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item.kind} className="py-2 first:pt-0 last:pb-0">
            <p className="text-sm font-semibold text-ink">{SENTENCE[item.kind](item.count)}</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {text.examples(item.examples)}
              {item.count > item.examples.length ? ` +${item.count - item.examples.length}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
