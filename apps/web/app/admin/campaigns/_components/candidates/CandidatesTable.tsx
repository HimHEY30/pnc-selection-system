import RowActionsMenu from "@/components/ui/RowActionsMenu";
import type { Address, Candidate } from "@/lib/candidates/types";
import { t } from "@/lib/messages";
import { formatDate } from "@/lib/sessions/format";

type Props = {
  /** The rows to show: one page, already filtered and ordered by the server. */
  candidates: Candidate[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (candidate: Candidate) => void;
  onDelete: (candidate: Candidate) => void;
};

const text = t.candidates.list.table;

const HEAD = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";
const CELL = "px-3 py-3 align-top text-sm text-ink";

/** "Tonle Basak, Chamkar Mon, Phnom Penh": the smallest place first, the way an address is written. */
export function addressLine(address: Address): string {
  return [address.village, address.commune, address.district, address.province]
    .map((place) => place?.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

/** The campaign's candidates as a table, one row each, so a long list stays easy to scan. */
export default function CandidatesTable({ candidates, canEdit, canDelete, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table aria-label={t.candidates.list.listLabel} className="w-full min-w-[64rem] border-collapse">
        <thead className="border-b border-line bg-canvas">
          <tr>
            <th scope="col" className={HEAD}>{text.candidate}</th>
            <th scope="col" className={HEAD}>{text.gender}</th>
            <th scope="col" className={HEAD}>{text.born}</th>
            <th scope="col" className={HEAD}>{text.phone}</th>
            <th scope="col" className={HEAD}>{text.address}</th>
            <th scope="col" className={HEAD}>{text.school}</th>
            <th scope="col" className={HEAD}>{text.session}</th>
            <th scope="col" className={HEAD}>{text.ngo}</th>
            <th scope="col" className={HEAD}>{text.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {candidates.map((candidate) => (
            <tr key={candidate.id}>
              <td className={`${CELL} max-w-56`}>
                <span className="font-semibold">{candidate.nameEn}</span>
                <span lang="km" className="block text-ink-muted">{candidate.nameKm}</span>
              </td>
              <td className={CELL}>{t.candidates.form.genders[candidate.gender]}</td>
              <td className={`${CELL} whitespace-nowrap`}>{formatDate(candidate.dateOfBirth)}</td>
              <td className={`${CELL} whitespace-nowrap tabular-nums`}>{candidate.phone}</td>
              <td className={`${CELL} max-w-64 break-words`}>{addressLine(candidate.address)}</td>
              <td className={`${CELL} max-w-56 break-words`}>{candidate.schoolName}</td>
              <td className={`${CELL} max-w-56`}>
                {candidate.session ? (
                  <>
                    <span className={candidate.session.status === "Cancelled" ? "text-ink-muted line-through" : "font-semibold"}>
                      {candidate.session.title}
                    </span>
                    <span className="block text-ink-muted">
                      {candidate.session.status === "Cancelled"
                        ? text.sessionCancelled
                        : candidate.session.date
                          ? formatDate(candidate.session.date)
                          : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-muted">{text.notSet}</span>
                )}
              </td>
              <td className={`${CELL} max-w-48 break-words`}>
                {candidate.hasNgoSupport ? candidate.ngoName : <span className="text-ink-muted">{text.noNgo}</span>}
              </td>
              <td className={CELL}>
                <RowActionsMenu
                  label={text.actionsFor(candidate.nameEn)}
                  actions={[
                    ...(canEdit ? [{ label: text.edit, onSelect: () => onEdit(candidate) }] : []),
                    ...(canDelete ? [{ label: text.delete, onSelect: () => onDelete(candidate) }] : []),
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
