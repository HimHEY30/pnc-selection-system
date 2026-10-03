"use client";

import { useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { canEnterNumbers } from "@/lib/sessions/format";
import type { MySession } from "@/lib/sessions/types";
import { t } from "@/lib/messages";
import NumbersDialog from "./NumbersDialog";
import SessionCard from "./SessionCard";

type Props = {
  sessions: MySession[];
  /** Today on the Cambodia calendar (yyyy-mm-dd), so planned sessions can be split into upcoming and earlier. */
  today: string;
};

const text = t.sessions.mine;

/**
 * The sessions the signed-in person is responsible for or runs, across campaigns: upcoming ones first, then the rest.
 * From here they can enter the numbers (expected, and who came once the session has taken place). Changing a
 * session's details is done from its campaign, by a manager.
 */
export default function MySessionsList({ sessions, today }: Props) {
  const [numbersId, setNumbersId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <EmptyState compact title={text.empty} description={text.emptyDescription} />;
  }

  const upcoming = sessions.filter((m) => m.session.status === "Planned" && m.session.date >= today);
  // Earlier ones, most recent first: the one that just happened is the one most likely to need its numbers.
  const earlier = sessions.filter((m) => !upcoming.includes(m)).sort((a, b) => (a.session.date < b.session.date ? 1 : -1));
  const selected = sessions.find((m) => m.session.id === numbersId)?.session ?? null;

  return (
    <div className="flex flex-col gap-8">
      <Group title={text.upcoming} items={upcoming} onNumbers={setNumbersId} />
      <Group title={text.past} items={earlier} onNumbers={setNumbersId} />
      <NumbersDialog session={selected} onClose={() => setNumbersId(null)} />
    </div>
  );
}

function Group({ title, items, onNumbers }: { title: string; items: MySession[]; onNumbers: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-[17px] font-bold text-ink">{title}</h2>
      <ul aria-label={title} className="flex flex-col gap-4">
        {items.map(({ session, campaignName }) => (
          <SessionCard
            key={session.id}
            session={session}
            campaign={{ id: session.campaignId, name: campaignName }}
            canChange={false}
            canEnterNumbers={canEnterNumbers(session)}
            onNumbers={(s) => onNumbers(s.id)}
          />
        ))}
      </ul>
    </section>
  );
}
