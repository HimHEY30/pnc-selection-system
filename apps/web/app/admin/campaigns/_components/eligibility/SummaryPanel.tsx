import type { DraftGroup } from "@/lib/eligibility/draft";
import { summarize, type PhraseContext } from "@/lib/eligibility/phrases";
import { t } from "@/lib/messages";

type Props = { groups: DraftGroup[]; ctx: PhraseContext };

/**
 * The rules on screen as one sentence, rewritten as the user edits. It is what lets someone
 * check, in plain words, that the rules say what they meant.
 */
export default function SummaryPanel({ groups, ctx }: Props) {
  const summary = summarize(groups, ctx);
  const text = t.eligibility.summary;

  return (
    <section aria-labelledby="summary-title" className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <h2 id="summary-title" className="text-[17px] font-bold text-ink">
        {text.title}
      </h2>

      {summary.isEmpty ? (
        <p className="mt-3 text-sm text-ink-muted">{text.empty}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed">
          <p className="text-ink">{summary.eligibleSentence ?? text.noMandatory}</p>
          {summary.optionalSentence && <p className="text-sm text-ink-muted">{summary.optionalSentence}</p>}
        </div>
      )}
    </section>
  );
}
