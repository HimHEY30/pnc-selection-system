import type { Metadata } from "next";
import { auth } from "@/auth";
import PageHeader from "@/components/ui/PageHeader";
import { guideFor } from "@/lib/guide/guide";
import { t } from "@/lib/messages";
import ShowTourButton from "./ShowTourButton";

export const metadata: Metadata = { title: "Guide" };

export default async function GuidePage() {
  const session = await auth();
  const { audience, steps } = guideFor(session?.roles ?? []);
  const [welcome, ...sections] = steps;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title={t.guide.page.title} description={t.guide.page.subtitle} actions={<ShowTourButton />} />

      <section aria-labelledby="guide-intro" className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {audience === "manager" ? t.guide.page.forManagers : t.guide.page.forOfficers}
        </p>
        <h2 id="guide-intro" className="mt-1 text-xl font-bold text-ink">
          {welcome?.title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{welcome?.body}</p>
      </section>

      <ol className="flex flex-col gap-4">
        {sections.map((step, i) => (
          <li key={step.title}>
            <section aria-labelledby={`guide-step-${i}`} className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h2 id={`guide-step-${i}`} className="text-lg font-bold text-ink">
                    {step.title}
                  </h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{step.body}</p>
                  {step.points.length > 0 && (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink marker:text-primary">
                      {step.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </li>
        ))}
      </ol>

      <section aria-labelledby="guide-glossary" className="rounded-2xl border border-line bg-surface p-6">
        <h2 id="guide-glossary" className="text-lg font-bold text-ink">
          {t.guide.page.glossaryTitle}
        </h2>
        <dl className="mt-4 flex flex-col gap-4">
          {t.guide.glossary.map(({ term, meaning }) => (
            <div key={term}>
              <dt className="text-[15px] font-semibold text-ink">{term}</dt>
              <dd className="mt-0.5 text-[15px] leading-relaxed text-ink-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
